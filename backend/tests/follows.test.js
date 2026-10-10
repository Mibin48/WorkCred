/**
 * WorkCred Follows & Saves Module Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Follow } from '../src/models/Follow.js';

describe('Follows and Saves Module', () => {
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

  it('POST /follows toggles save and follow, blocks self-follow, and requires active worker target', async () => {
    const customer = await loginUser('9876500020', 'customer');
    const worker = await loginUser('9876500021', 'worker');

    await User.findByIdAndUpdate(worker.userId, {
      name: 'Ravi Worker',
      skills: ['electrician'],
      rate: 700,
      profileComplete: true,
    });

    // 1. Self-follow rejected
    const selfRes = await fetch(`${baseUrl}/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({ toUserId: customer.userId, type: 'follow' }),
    });
    assert.strictEqual(selfRes.status, 400);

    // 2. Follow active worker (toggle on)
    const followRes1 = await fetch(`${baseUrl}/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({ toUserId: worker.userId, type: 'follow' }),
    });
    assert.strictEqual(followRes1.status, 200);
    const body1 = await followRes1.json();
    assert.strictEqual(body1.data.active, true);
    assert.strictEqual(body1.data.type, 'follow');

    // 3. Toggle off
    const followRes2 = await fetch(`${baseUrl}/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({ toUserId: worker.userId, type: 'follow' }),
    });
    assert.strictEqual(followRes2.status, 200);
    const body2 = await followRes2.json();
    assert.strictEqual(body2.data.active, false);

    // 4. Save worker
    const saveRes = await fetch(`${baseUrl}/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({ toUserId: worker.userId, type: 'save' }),
    });
    assert.strictEqual(saveRes.status, 200);
    const saveBody = await saveRes.json();
    assert.strictEqual(saveBody.data.active, true);
    assert.strictEqual(saveBody.data.type, 'save');
  });

  it('GET /follows returns saved/followed workers without leaking private fields and DELETE removes idempotently', async () => {
    const customer = await loginUser('9876500022', 'customer');
    const worker = await loginUser('9876500023', 'worker');

    await User.findByIdAndUpdate(worker.userId, {
      name: 'Gopal Verma',
      skills: ['carpenter'],
      mainSkill: 'carpenter',
      rate: 800,
      area: 'Shivajinagar',
      city: 'Pune',
      profileComplete: true,
    });

    await Follow.create({
      fromUserId: customer.userId,
      toUserId: worker.userId,
      type: 'save',
    });

    // 1. GET /follows?type=save
    const res = await fetch(`${baseUrl}/follows?type=save`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.workers.length, 1);
    assert.strictEqual(body.data.workers[0].name, 'Gopal Verma');
    assert.strictEqual(body.data.workers[0].phone, undefined); // Privacy: phone omitted
    assert.strictEqual(body.data.workers[0].location, undefined); // Privacy: exact coords omitted

    // 2. DELETE /follows/:toId
    const delRes = await fetch(`${baseUrl}/follows/${worker.userId}?type=save`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    assert.strictEqual(delRes.status, 200);

    const check = await Follow.findOne({ fromUserId: customer.userId, toUserId: worker.userId, type: 'save' });
    assert.strictEqual(check, null);

    // 3. Repeat DELETE is idempotent
    const delRes2 = await fetch(`${baseUrl}/follows/${worker.userId}?type=save`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    assert.strictEqual(delRes2.status, 200);
  });
});
