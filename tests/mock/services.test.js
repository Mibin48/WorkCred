import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleMockRequest } from '../../frontend/app/js/mock/handlers.js';
import { buildSeedData } from '../../frontend/app/js/mock/seed.js';
import { readDb, writeDb, resetDb } from '../../frontend/app/js/mock/db.js';

describe('mock/services End-To-End Suite', () => {
  it('executes complete job lifecycle: post -> accept -> start -> finish -> passport hash chain', async () => {
    resetDb();

    // 1. Customer posts job
    const postJobRes = await handleMockRequest('POST', '/jobs', {
      title: 'Emergency Wiring Fix in Kothrud',
      skill: 'electrician',
      description: 'Main board trip repair',
      area: 'Kothrud',
      city: 'Pune',
      lat: 18.5074,
      lng: 73.8077,
      rate: 800,
      rateUnit: 'day',
    }, { Authorization: 'Bearer mock-access-user-customer-meera-1' });

    assert.equal(postJobRes.success, true);
    const job = postJobRes.data.job;
    assert.equal(job.status, 'open');
    assert.ok(postJobRes.data.compass);

    // 2. Worker accepts job
    const acceptRes = await handleMockRequest('POST', `/jobs/${job.id}/accept`, {}, {
      Authorization: 'Bearer mock-access-user-worker-ravi-1',
    });

    assert.equal(acceptRes.success, true);
    const booking = acceptRes.data.booking;
    assert.equal(booking.status, 'confirmed');

    // 3. Customer views booking details (sees startCode & finishCode)
    const custBookingRes = await handleMockRequest('GET', `/bookings/${booking.id}`, undefined, {
      Authorization: 'Bearer mock-access-user-customer-meera-1',
    });
    assert.equal(custBookingRes.success, true);
    const startCode = custBookingRes.data.booking.startCode;
    const finishCode = custBookingRes.data.booking.finishCode;
    assert.ok(startCode);
    assert.ok(finishCode);

    // Worker views booking details (NEVER sees codes)
    const workerBookingRes = await handleMockRequest('GET', `/bookings/${booking.id}`, undefined, {
      Authorization: 'Bearer mock-access-user-worker-ravi-1',
    });
    assert.equal(workerBookingRes.success, true);
    assert.equal(workerBookingRes.data.booking.startCode, undefined);
    assert.equal(workerBookingRes.data.booking.finishCode, undefined);

    // 4. Worker starts booking with startCode and GPS
    const startRes = await handleMockRequest('POST', `/bookings/${booking.id}/start`, {
      startCode,
      lat: 18.5074,
      lng: 73.8077,
    }, { Authorization: 'Bearer mock-access-user-worker-ravi-1' });

    if (!startRes.success) console.error('START_RES_ERROR:', startRes.error);
    assert.equal(startRes.success, true);
    assert.equal(startRes.data.booking.status, 'in_progress');

    // 5. Customer finishes booking with finishCode and rating
    const finishRes = await handleMockRequest('POST', `/bookings/${booking.id}/finish`, {
      finishCode,
      paidCash: true,
      rating: 5,
      comment: 'Excellent work!',
    }, { Authorization: 'Bearer mock-access-user-customer-meera-1' });

    assert.equal(finishRes.success, true);
    assert.equal(finishRes.data.booking.status, 'completed');
    assert.ok(finishRes.data.passportEntry);

    // 6. Verify SHA-256 Passport Hash Chain
    const verifyRes = await handleMockRequest('GET', '/passport/ravi-kumar-pune-842/verify');
    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.valid, true);

    // 7. Tamper passport entry and verify detection
    await handleMockRequest('POST', '/dev/tamper-passport', { workerId: 'user-worker-ravi', seq: 1 });
    const verifyTamperedRes = await handleMockRequest('GET', '/passport/ravi-kumar-pune-842/verify');
    assert.equal(verifyTamperedRes.success, true);
    assert.equal(verifyTamperedRes.data.valid, false);
  });

  it('enforces 5 max failed start code attempts before RATE_LIMITED locking', async () => {
    resetDb();
    const db = readDb();
    const booking = db.bookings.find((b) => b.status === 'confirmed');
    assert.ok(booking);

    for (let i = 0; i < 5; i++) {
      const res = await handleMockRequest('POST', `/bookings/${booking.id}/start`, {
        startCode: '0000',
        lat: 18.5,
        lng: 73.8,
      }, { Authorization: `Bearer mock-access-${booking.workerId}-1` });

      if (i < 4) {
        assert.equal(res.success, false);
        assert.equal(res.error.code, 'INVALID_START_CODE');
      } else {
        assert.equal(res.success, false);
        assert.equal(res.error.code, 'RATE_LIMITED');
      }
    }
  });

  it('rejects duplicate endorsements without completed booking with 409 conflict', async () => {
    resetDb();
    const res = await handleMockRequest('POST', '/endorsements', {
      workerId: 'user-worker-2',
      skill: 'electrician',
      comment: 'Super!',
    }, { Authorization: 'Bearer mock-access-user-customer-meera-1' });

    assert.equal(res.success, false);
    assert.equal(res.error.code, 'DUPLICATE_ENDORSEMENT');
  });

  it('replays response on repeated Idempotency-Key submission', async () => {
    resetDb();
    const idempotencyKey = 'idem-test-key-999';

    const req1 = await handleMockRequest('POST', '/jobs', {
      title: 'Idempotency Job Test',
      skill: 'plumber',
      area: 'Aundh',
      city: 'Pune',
      lat: 18.56,
      lng: 73.80,
      rate: 600,
    }, { Authorization: 'Bearer mock-access-user-customer-meera-1', 'Idempotency-Key': idempotencyKey });

    assert.equal(req1.success, true);

    const req2 = await handleMockRequest('POST', '/jobs', {
      title: 'Idempotency Job Test',
      skill: 'plumber',
      area: 'Aundh',
      city: 'Pune',
      lat: 18.56,
      lng: 73.80,
      rate: 600,
    }, { Authorization: 'Bearer mock-access-user-customer-meera-1', 'Idempotency-Key': idempotencyKey });

    assert.equal(req2.success, true);
    assert.equal(req1.data.job.id, req2.data.job.id);
  });

  it('serves customer discovery, follow lists, and booking contact privacy', async () => {
    resetDb();
    const customerAuth = { Authorization: 'Bearer mock-access-user-customer-meera-1' };
    const workerAuth = { Authorization: 'Bearer mock-access-user-worker-2-1' };
    const search = await handleMockRequest('GET', '/workers?skills=electrician&radiusKm=5&minRating=4&sortBy=rating', undefined, customerAuth);
    assert.equal(search.success, true);
    assert.ok(search.data.workers.length > 0);
    assert.equal('phone' in search.data.workers[0], false);

    const profile = await handleMockRequest('GET', '/workers/user-worker-2', undefined, customerAuth);
    assert.equal(profile.success, true);
    assert.ok(profile.data.worker.totalHoursWorked >= 0);
    assert.ok(Array.isArray(profile.data.worker.passportEntries));
    assert.equal('phone' in profile.data.worker, false);

    const saved = await handleMockRequest('POST', '/follows', { toUserId: 'user-worker-2', type: 'save' }, customerAuth);
    assert.equal(saved.success, true);
    assert.equal(saved.data.active, true);
    const savedList = await handleMockRequest('GET', '/follows?type=save', undefined, customerAuth);
    assert.equal(savedList.success, true);
    assert.ok(savedList.data.workers.some((worker) => worker.id === 'user-worker-2'));

    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const bookingRes = await handleMockRequest('POST', '/bookings', {
      workerId: 'user-worker-2', source: 'direct', skill: 'electrician', rate: 600,
      rateUnit: 'day', scheduledAt, hours: 2,
    }, customerAuth);
    assert.equal(bookingRes.success, true);
    const bookingId = bookingRes.data.booking.id;
    const pendingDetail = await handleMockRequest('GET', `/bookings/${bookingId}`, undefined, customerAuth);
    assert.equal(pendingDetail.success, true);
    assert.equal(pendingDetail.data.booking.workerPhone, undefined);

    const confirm = await handleMockRequest('POST', `/bookings/${bookingId}/confirm`, {}, workerAuth);
    assert.equal(confirm.success, true);
    const confirmedDetail = await handleMockRequest('GET', `/bookings/${bookingId}`, undefined, customerAuth);
    assert.equal(confirmedDetail.success, true);
    assert.ok(confirmedDetail.data.booking.workerPhone);
  });

  it('guarantees Passport privacy, verification counts, tamper detection, and report logging', async () => {
    resetDb();
    const workerAuth = { Authorization: 'Bearer mock-access-user-worker-ravi-1' };
    const otherWorkerAuth = { Authorization: 'Bearer mock-access-user-worker-2-1' };

    // 1. Worker fetches their own passport
    const myPass = await handleMockRequest('GET', '/passport/me', undefined, workerAuth);
    assert.equal(myPass.success, true);
    const entries = myPass.data.passportEntries;
    assert.ok(entries.length > 0);
    const firstEntryId = entries[0].id;

    // 2. Reject tampering with non-modifiable fields
    const invalidPatch = await handleMockRequest('PATCH', `/passport/entries/${firstEntryId}`, {
      hash: 'tampered-hash-string',
      amountPaid: 99999,
    }, workerAuth);
    assert.equal(invalidPatch.success, false);
    assert.equal(invalidPatch.error.code, 'VALIDATION_ERROR');

    // 3. Reject unauthorized worker patching another worker's entry
    const unauthorizedPatch = await handleMockRequest('PATCH', `/passport/entries/${firstEntryId}`, {
      visibility: 'private',
    }, otherWorkerAuth);
    assert.equal(unauthorizedPatch.success, false);
    assert.equal(unauthorizedPatch.error.code, 'FORBIDDEN');

    // 4. Worker sets entry to private
    const hidePatch = await handleMockRequest('PATCH', `/passport/entries/${firstEntryId}`, {
      visibility: 'private',
    }, workerAuth);
    assert.equal(hidePatch.success, true);
    assert.equal(hidePatch.data.entry.visibility, 'private');

    // 5. Unauthenticated public view never leaks the private entry
    const publicPass = await handleMockRequest('GET', '/passport/ravi-kumar-pune-842');
    assert.equal(publicPass.success, true);
    assert.equal(publicPass.data.passportEntries.some((e) => e.id === firstEntryId), false);
    assert.equal(publicPass.data.worker.hiddenRecordsCount, 1);
    assert.equal('phone' in publicPass.data.worker, false);

    // 6. Verification check still includes all entries including hidden ones
    const verifyRes = await handleMockRequest('GET', '/passport/ravi-kumar-pune-842/verify');
    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.data.valid, true);
    assert.equal(verifyRes.data.totalRecords, entries.length);
    assert.equal(verifyRes.data.hiddenRecords, 1);

    // 7. Dev Tamper simulation triggers valid: false
    const tamperRes = await handleMockRequest('POST', '/dev/tamper-passport', {
      workerId: 'user-worker-ravi',
      seq: 1,
    });
    assert.equal(tamperRes.success, true);

    const tamperedVerify = await handleMockRequest('GET', '/passport/ravi-kumar-pune-842/verify');
    assert.equal(tamperedVerify.success, true);
    assert.equal(tamperedVerify.data.valid, false);

    // 8. Restore tamper resets verification back to valid
    const resetRes = await handleMockRequest('POST', '/dev/reset-tamper-passport', {
      workerId: 'user-worker-ravi',
      seq: 1,
    });
    assert.equal(resetRes.success, true);
    const restoredVerify = await handleMockRequest('GET', '/passport/ravi-kumar-pune-842/verify');
    assert.equal(restoredVerify.success, true);
    assert.equal(restoredVerify.data.valid, true);

    // 9. Submit incident report
    const reportRes = await handleMockRequest('POST', '/reports', {
      targetType: 'passport',
      targetSlug: 'ravi-kumar-pune-842',
      reason: 'fake',
      note: 'Testing report endpoint',
    });
    assert.equal(reportRes.success, true);
    assert.ok(reportRes.data.report.id);
  });

  it('Step 7: validates Free Now nearby, universal Feed, and Work Posts lifecycle', async () => {
    // 1. Worker goes Free Now

    const workerToken = 'mock-access-user-worker-ravi-token';
    const freeRes = await handleMockRequest('POST', '/availability', {
      hours: 4,
      lat: 18.5204,
      lng: 73.8567,
    }, { Authorization: `Bearer ${workerToken}` });
    assert.equal(freeRes.success, true);

    // 2. Customer searches nearby Free Now workers (sorted by distance, within radius)
    const customerToken = 'mock-access-user-customer-meera-token';
    const nearbyRes = await handleMockRequest('GET', '/availability/nearby?lat=18.5204&lng=73.8567&radiusKm=5', {}, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert.equal(nearbyRes.success, true);
    assert.ok(Array.isArray(nearbyRes.data.workers));
    assert.ok(nearbyRes.data.workers.some((w) => w.workerId === 'user-worker-ravi'));

    // Out of radius (e.g. radiusKm=0.01) excludes worker
    const farRes = await handleMockRequest('GET', '/availability/nearby?lat=19.0760&lng=72.8777&radiusKm=1', {}, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert.equal(farRes.success, true);
    assert.equal(farRes.data.workers.length, 0);

    // 3. Work Post validation: reject phone numbers and URLs
    const phonePost = await handleMockRequest('POST', '/posts', {
      skill: 'electrician',
      caption: 'Call me at 9876543210 for best repairs',
      afterPhotoUrl: 'data:image/jpeg;base64,sample',
    }, { Authorization: `Bearer ${workerToken}` });
    assert.equal(phonePost.success, false);
    assert.equal(phonePost.error.code, 'VALIDATION_ERROR');

    const urlPost = await handleMockRequest('POST', '/posts', {
      skill: 'electrician',
      caption: 'Visit https://mysite.com for portfolio',
      afterPhotoUrl: 'data:image/jpeg;base64,sample',
    }, { Authorization: `Bearer ${workerToken}` });
    assert.equal(urlPost.success, false);
    assert.equal(urlPost.error.code, 'VALIDATION_ERROR');

    // 4. Create valid Work Post with linked completed booking
    const validPost = await handleMockRequest('POST', '/posts', {
      skill: 'electrician',
      caption: 'Installed new sub-panel and copper ground wires.',
      afterPhotoUrl: 'data:image/jpeg;base64,sampleAfter',
      beforePhotoUrl: 'data:image/jpeg;base64,sampleBefore',
      linkedBookingId: 'booking-hist-user-worker-ravi-1',
    }, { Authorization: `Bearer ${workerToken}` });
    assert.equal(validPost.success, true);
    assert.ok(validPost.data.post.id);
    assert.ok(validPost.data.post.linkedBooking);
    const createdPostId = validPost.data.post.id;

    // 5. Test Feed for Customer (includes post and Free Now card)
    const customerFeed = await handleMockRequest('GET', '/feed?filter=all', {}, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert.equal(customerFeed.success, true);
    assert.ok(customerFeed.data.feed.some((f) => f.type === 'post' && f.id === createdPostId));
    assert.ok(customerFeed.data.feed.some((f) => f.type === 'free_now' && f.item.workerId === 'user-worker-ravi'));

    // 6. Test Feed for Worker (includes post and open jobs)
    const workerFeed = await handleMockRequest('GET', '/feed?filter=all', {}, {
      Authorization: `Bearer ${workerToken}`,
    });
    assert.equal(workerFeed.success, true);
    assert.ok(workerFeed.data.feed.some((f) => f.type === 'post'));

    // 7. Delete post: forbidden for non-owner, succeeds for owner
    const forbiddenDelete = await handleMockRequest('DELETE', `/posts/${createdPostId}`, {}, {
      Authorization: `Bearer ${customerToken}`,
    });
    assert.equal(forbiddenDelete.success, false);
    assert.equal(forbiddenDelete.error.code, 'FORBIDDEN');

    const ownerDelete = await handleMockRequest('DELETE', `/posts/${createdPostId}`, {}, {
      Authorization: `Bearer ${workerToken}`
    });
    assert.equal(ownerDelete.success, true);
  });

  it('Step 8: guarantees offline cache sanitization strips startCode and finishCode', async () => {
    const { sanitizeForOffline, isWhitelistedPath } = await import('../../frontend/app/js/offline/cache.js');

    assert.equal(isWhitelistedPath('/bookings/booking-123'), true);
    assert.equal(isWhitelistedPath('/users/me'), true);
    assert.equal(isWhitelistedPath('/auth/otp/verify'), false);

    const mockBookingPayload = {
      booking: {
        id: 'booking-secret-1',
        workerId: 'worker-1',
        startCode: '1234',
        finishCode: '5678',
        skill: 'plumber',
      },
    };

    const sanitized = sanitizeForOffline('/bookings/booking-secret-1', mockBookingPayload);
    assert.equal(sanitized.booking.id, 'booking-secret-1');
    assert.equal(sanitized.booking.startCode, undefined);
    assert.equal(sanitized.booking.finishCode, undefined);
  });
});


