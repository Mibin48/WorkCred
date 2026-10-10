/**
 * WorkCred Booking Lifecycle, Double-Booking, & Overlap Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Booking } from '../src/models/Booking.js';

describe('Bookings Lifecycle & Overlap Protection', () => {
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
              skills: ['helper', 'electrician'],
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

  it('Customer books worker: pending state hides handshake codes and phone; confirmed reveals them', async () => {
    const customer = await loginUser('9811111111', 'customer');
    const worker = await loginUser('9822222222', 'worker');

    const scheduledAt = new Date(Date.now() + 4 * 3600000).toISOString();
    const createRes = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.user.id,
        source: 'direct',
        scheduledAt,
        hours: 4,
        note: 'Please come on time',
      }),
    });

    assert.strictEqual(createRes.status, 200);
    const createBody = await createRes.json();
    const booking = createBody.data.booking;
    assert.strictEqual(booking.status, 'pending');

    // Customer detail check while pending: codes and worker phone must NOT be present
    const pendingDetailRes = await fetch(`${baseUrl}/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    const pendingDetail = (await pendingDetailRes.json()).data.booking;
    assert.strictEqual(pendingDetail.startCode, undefined, 'Start code must be hidden in pending');
    assert.strictEqual(pendingDetail.finishCode, undefined, 'Finish code must be hidden in pending');
    assert.strictEqual(pendingDetail.workerPhone, undefined, 'Worker phone must be hidden in pending');

    // Worker detail check while pending: worker NEVER sees startCode or finishCode
    const workerDetailRes = await fetch(`${baseUrl}/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });
    const workerDetail = (await workerDetailRes.json()).data.booking;
    assert.strictEqual(workerDetail.startCode, undefined, 'Worker must NEVER see start code');
    assert.strictEqual(workerDetail.finishCode, undefined, 'Worker must NEVER see finish code');

    // Worker confirms booking
    const confirmRes = await fetch(`${baseUrl}/bookings/${booking.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
      },
    });
    assert.strictEqual(confirmRes.status, 200);

    // Customer detail check while confirmed: codes and phone ARE revealed to customer
    const confirmedDetailRes = await fetch(`${baseUrl}/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    const confirmedDetail = (await confirmedDetailRes.json()).data.booking;
    assert.strictEqual(confirmedDetail.status, 'confirmed');
    assert.ok(/^\d{4}$/.test(confirmedDetail.startCode), 'Customer must see 4-digit startCode when confirmed');
    assert.ok(/^\d{4}$/.test(confirmedDetail.finishCode), 'Customer must see 4-digit finishCode when confirmed');
    assert.strictEqual(confirmedDetail.workerPhone, '9822222222', 'Customer must see worker phone when confirmed');

    // Worker detail check while confirmed: worker STILL never sees codes, but now sees customer phone
    const workerConfirmedRes = await fetch(`${baseUrl}/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });
    const workerConfirmed = (await workerConfirmedRes.json()).data.booking;
    assert.strictEqual(workerConfirmed.startCode, undefined, 'Worker still cannot see startCode');
    assert.strictEqual(workerConfirmed.finishCode, undefined, 'Worker still cannot see finishCode');
    assert.strictEqual(workerConfirmed.customerPhone, '9811111111', 'Worker sees customer phone when confirmed');
  });

  it('Double booking prevention: overlapping time window returns ALREADY_BOOKED', async () => {
    const customer1 = await loginUser('9833333331', 'customer');
    const customer2 = await loginUser('9833333332', 'customer');
    const worker = await loginUser('9833333333', 'worker');

    const scheduledAt = new Date(Date.now() + 10 * 3600000).toISOString();

    // Customer 1 books 4 hours at T+10
    const b1Res = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer1.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.user.id,
        scheduledAt,
        hours: 4,
      }),
    });
    assert.strictEqual(b1Res.status, 200);

    // Customer 2 attempts to book overlapping slot (T+11, 2 hours) -> 409 ALREADY_BOOKED
    const overlapTime = new Date(Date.now() + 11 * 3600000).toISOString();
    const b2Res = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer2.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.user.id,
        scheduledAt: overlapTime,
        hours: 2,
      }),
    });

    assert.strictEqual(b2Res.status, 409);
    const body2 = await b2Res.json();
    assert.strictEqual(body2.error.code, 'ALREADY_BOOKED');
  });

  it('Concurrent booking race: two customers simultaneously book the same worker at the same time -> only one succeeds', async () => {
    const customerA = await loginUser('9844444441', 'customer');
    const customerB = await loginUser('9844444442', 'customer');
    const worker = await loginUser('9844444443', 'worker');

    const scheduledAt = new Date(Date.now() + 15 * 3600000).toISOString();

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerA.accessToken}`,
        },
        body: JSON.stringify({
          workerId: worker.user.id,
          scheduledAt,
          hours: 3,
        }),
      }),
      fetch(`${baseUrl}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerB.accessToken}`,
        },
        body: JSON.stringify({
          workerId: worker.user.id,
          scheduledAt,
          hours: 3,
        }),
      }),
    ]);

    const results = [await resA.json(), await resB.json()];
    const successes = results.filter((r) => r.success === true);
    const failures = results.filter((r) => r.success === false && r.error?.code === 'ALREADY_BOOKED');

    assert.strictEqual(successes.length, 1, 'Exactly one concurrent booking must succeed');
    assert.strictEqual(failures.length, 1, 'Second concurrent booking must fail with ALREADY_BOOKED');
  });
});
