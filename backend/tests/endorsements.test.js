/**
 * WorkCred Endorsements Module Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Booking } from '../src/models/Booking.js';
import { Endorsement } from '../src/models/Endorsement.js';

describe('Endorsements Module', () => {
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
    const userId = body.data.user.id;

    if (role) {
      await fetch(`${baseUrl}/users/me/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
    }

    return {
      userId,
      accessToken: token,
    };
  }

  it('POST /endorsements requires completed booking for that specific skill and rejects duplicates', async () => {
    const customer = await loginUser('9876500030', 'customer');
    const worker = await loginUser('9876500031', 'worker');

    await User.findByIdAndUpdate(worker.userId, {
      name: 'Anand Shinde',
      skills: ['plumber', 'electrician'],
      rate: 700,
      profileComplete: true,
    });

    // 1. Endorsement without any booking fails with 409
    const resNoBooking = await fetch(`${baseUrl}/endorsements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.userId,
        skill: 'plumber',
        comment: 'Great plumbing repair.',
      }),
    });
    assert.strictEqual(resNoBooking.status, 409);
    const bodyNoBooking = await resNoBooking.json();
    assert.strictEqual(bodyNoBooking.error.code, 'DUPLICATE_ENDORSEMENT');

    // 2. Booking exists but for 'electrician', endorsement for 'plumber' fails
    const elecBooking = await Booking.create({
      customerId: customer.userId,
      workerId: worker.userId,
      skill: 'electrician',
      status: 'completed',
      rate: 700,
      rateUnit: 'day',
      agreedRate: 700,
      hours: 4,
      amountPaid: 350,
      paidCash: true,
      startCodeEnc: 'enc1',
      finishCodeEnc: 'enc2',
    });

    const resWrongSkill = await fetch(`${baseUrl}/endorsements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.userId,
        skill: 'plumber',
      }),
    });
    assert.strictEqual(resWrongSkill.status, 409);

    // 3. Endorsement for 'electrician' succeeds
    const resSuccess = await fetch(`${baseUrl}/endorsements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.userId,
        skill: 'electrician',
        comment: 'Fixed all electrical sockets perfectly.',
      }),
    });
    assert.strictEqual(resSuccess.status, 201);
    const bodySuccess = await resSuccess.json();
    assert.strictEqual(bodySuccess.data.skillCount, 1);
    assert.strictEqual(bodySuccess.data.endorsement.skill, 'electrician');

    // 4. Duplicate endorsement for same skill fails with 409
    const resDuplicate = await fetch(`${baseUrl}/endorsements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        workerId: worker.userId,
        skill: 'electrician',
      }),
    });
    assert.strictEqual(resDuplicate.status, 409);
  });
});
