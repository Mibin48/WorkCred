/**
 * WorkCred Double Handshake Protocol Integration Tests
 * Tests start & finish handshakes, atomic 5-attempt lockouts, soft distance warnings,
 * and SHA-256 tamper-evident Work Passport chaining.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Booking } from '../src/models/Booking.js';
import { PassportEntry } from '../src/models/PassportEntry.js';
import { GENESIS_HASH, computeEntryHash } from '../../shared/hash.js';

describe('Handshake Protocols & Ledger Integrity', () => {
  let server;
  let baseUrl;

  before(async () => {
    await setupTestDb();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}/api/v1`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  async function loginUser(phone = '9876543210', role = 'customer') {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: '123456' }),
    });

    const body = await verifyRes.json();
    const token = body.data.accessToken;

    if (role) {
      await fetch(`${baseUrl}/users/me/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });

      const updatePayload =
        role === 'customer'
          ? {
              name: `Customer ${phone.slice(-4)}`,
              area: 'Central',
              city: 'Bangalore',
              location: { lat: 12.9716, lng: 77.5946 },
            }
          : {
              name: `Worker ${phone.slice(-4)}`,
              skills: ['electrician'],
              mainSkill: 'electrician',
              rate: 500,
              rateUnit: 'day',
              area: 'Central',
              city: 'Bangalore',
              location: { lat: 12.9716, lng: 77.5946 },
              calendar: {
                monday: 'full',
                tuesday: 'full',
                wednesday: 'full',
                thursday: 'full',
                friday: 'full',
                saturday: 'full',
                sunday: 'full',
              },
            };

      await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      });
    }

    return {
      user: body.data.user,
      accessToken: token,
    };
  }

  it('Start Handshake: 5 wrong attempts trigger atomic RATE_LIMITED lockout; correct attempt transitions to in_progress', async () => {
    const customer = await loginUser('9855555551', 'customer');
    const worker = await loginUser('9855555552', 'worker');

    const scheduledAt = new Date(Date.now() + 3600000).toISOString();
    const bRes = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.user.id,
        scheduledAt,
        hours: 4,
      }),
    });
    const { data: { booking } } = await bRes.json();

    // Confirm
    await fetch(`${baseUrl}/bookings/${booking.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });

    // Customer obtains codes
    const detailRes = await fetch(`${baseUrl}/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    const customerView = (await detailRes.json()).data.booking;
    const realStartCode = customerView.startCode;

    // Worker attempts wrong code 4 times concurrently
    const wrongPromises = [1, 2, 3, 4].map(() =>
      fetch(`${baseUrl}/bookings/${booking.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${worker.accessToken}`,
        },
        body: JSON.stringify({
          startCode: '0000',
          lat: 12.9716,
          lng: 77.5946,
        }),
      })
    );
    await Promise.all(wrongPromises);

    // Check attempts count in database
    const docAfter4 = await Booking.findById(booking.id);
    assert.strictEqual(docAfter4.startCodeAttempts, 4);

    // 5th wrong attempt triggers RATE_LIMITED lockout
    const fifthRes = await fetch(`${baseUrl}/bookings/${booking.id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
      },
      body: JSON.stringify({
        startCode: '0000',
        lat: 12.9716,
        lng: 77.5946,
      }),
    });
    assert.strictEqual(fifthRes.status, 429);
    const fifthBody = await fifthRes.json();
    assert.strictEqual(fifthBody.error.code, 'RATE_LIMITED');

    // 6th attempt (even with correct code) is blocked while locked
    const lockedRes = await fetch(`${baseUrl}/bookings/${booking.id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
      },
      body: JSON.stringify({
        startCode: realStartCode,
        lat: 12.9716,
        lng: 77.5946,
      }),
    });
    assert.strictEqual(lockedRes.status, 429);
  });

  it('Finish Handshake: completed booking chains SHA-256 hash onto ledger and updates rateStats', async () => {
    const customer = await loginUser('9866666661', 'customer');
    const worker = await loginUser('9866666662', 'worker');

    const scheduledAt = new Date(Date.now() + 1800000).toISOString();
    const bRes = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.user.id,
        scheduledAt,
        hours: 4,
      }),
    });
    const { data: { booking } } = await bRes.json();

    await fetch(`${baseUrl}/bookings/${booking.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });

    const detailRes = await fetch(`${baseUrl}/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    const { startCode, finishCode } = (await detailRes.json()).data.booking;

    // Start with location > 500m away to test distance warning
    const startRes = await fetch(`${baseUrl}/bookings/${booking.id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
      },
      body: JSON.stringify({
        startCode,
        lat: 12.9900, // ~2km away from customer location
        lng: 77.6100,
      }),
    });
    assert.strictEqual(startRes.status, 200);
    const startBody = await startRes.json();
    assert.strictEqual(startBody.data.booking.status, 'in_progress');
    assert.strictEqual(startBody.data.distanceWarning, true);

    // Customer completes booking with finish code & rating
    const finishRes = await fetch(`${baseUrl}/bookings/${booking.id}/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        finishCode,
        paidCash: true,
        rating: 5,
        comment: 'Outstanding electrical work!',
      }),
    });

    assert.strictEqual(finishRes.status, 200);
    const finishBody = await finishRes.json();
    assert.strictEqual(finishBody.data.booking.status, 'completed');
    assert.strictEqual(finishBody.data.booking.rating, 5);

    // Verify Work Passport Ledger Entry created and correctly chained
    const passportEntry = await PassportEntry.findOne({ bookingId: booking.id });
    assert.ok(passportEntry, 'Passport ledger entry must exist');
    assert.strictEqual(passportEntry.fields.rating, 5);
    assert.strictEqual(passportEntry.prevHash, GENESIS_HASH);

    const expectedHash = await computeEntryHash(GENESIS_HASH, {
      bookingId: booking.id,
      workerId: worker.user.id,
      customerId: customer.user.id,
      skill: 'electrician',
      hoursWorked: passportEntry.fields.hoursWorked,
      amountPaid: passportEntry.fields.amountPaid,
      startedAt: passportEntry.fields.startedAt,
      finishedAt: passportEntry.fields.finishedAt,
      rating: 5,
    });

    assert.strictEqual(passportEntry.hash, expectedHash, 'Cryptographic ledger hash must match computeEntryHash');

    // Verify worker stats updated
    const updatedWorker = await User.findById(worker.user.id);
    assert.strictEqual(updatedWorker.passportStats.jobsCompleted, 1);
    assert.strictEqual(updatedWorker.passportStats.avgRating, 5);
    assert.ok(updatedWorker.passportStats.totalHoursWorked >= 1);
  });
});
