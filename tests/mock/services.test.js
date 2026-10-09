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
});
