/**
 * WorkCred User Profile Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';

describe('Users Profile & Roles Module', () => {
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

  async function loginUser(phone = '9876543210') {
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
    return {
      user: body.data.user,
      accessToken: body.data.accessToken,
    };
  }

  it('PATCH /users/me/role: assigns worker role once and blocks re-assignment', async () => {
    const session = await loginUser('9000000010');

    // 1. Assign worker role -> 200
    const roleRes = await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'worker' }),
    });
    assert.equal(roleRes.status, 200);
    const roleBody = await roleRes.json();
    assert.equal(roleBody.data.user.role, 'worker');

    // 2. Second role assignment attempt -> 409 ROLE_ALREADY_SET
    const secondRes = await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'customer' }),
    });
    assert.equal(secondRes.status, 409);
    const secondBody = await secondRes.json();
    assert.equal(secondBody.error.code, 'ROLE_ALREADY_SET');
  });

  it('PATCH /users/me/role: rejects invalid or admin roles', async () => {
    const session = await loginUser('9000000011');

    const adminRes = await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(adminRes.status, 400);
    const body = await adminRes.json();
    assert.equal(body.error.code, 'INVALID_ROLE');
  });

  it('PATCH /users/me: enforces strict field whitelisting and validates input values', async () => {
    const session = await loginUser('9000000012');
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'customer' }),
    });

    // 1. Attempting to update worker-only field on customer profile -> 400
    const workerFieldRes = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ skills: ['electrician'] }),
    });
    assert.equal(workerFieldRes.status, 400);
    const workerFieldBody = await workerFieldRes.json();
    assert.equal(workerFieldBody.error.code, 'VALIDATION_ERROR');

    // 2. Name validation: numbers only rejected
    const badNameRes = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ name: '123456' }),
    });
    assert.equal(badNameRes.status, 400);

    // 3. Photo validation: data: URLs rejected
    const dataUrlRes = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ photoUrl: 'data:image/svg+xml;base64,...' }),
    });
    assert.equal(dataUrlRes.status, 400);
    const dataUrlBody = await dataUrlRes.json();
    assert.match(dataUrlBody.error.message, /data urls are not allowed/i);

    // 4. Valid Customer Update
    const goodUpdateRes = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        name: 'Meera Nair',
        area: 'Deccan',
        city: 'Pune',
        location: { lat: 18.5158, lng: 73.8418 },
      }),
    });
    assert.equal(goodUpdateRes.status, 200);
    const goodBody = await goodUpdateRes.json();
    assert.equal(goodBody.data.user.name, 'Meera Nair');
    assert.equal(goodBody.data.user.profileComplete, true);
    assert.equal(goodBody.data.user.location.coordinates[0], 73.8418);
    assert.equal(goodBody.data.user.location.coordinates[1], 18.5158);
  });

  it('PATCH /users/me: worker profile update generates unique passport slug upon completion', async () => {
    const session = await loginUser('9000000013');
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'worker' }),
    });

    const updateRes = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        name: 'Ravi Kumar',
        skills: ['electrician', 'helper'],
        rate: 750,
        rateUnit: 'day',
        area: 'Shivajinagar',
        city: 'Pune',
        location: { lat: 18.5304, lng: 73.8467 },
        bio: 'Certified master electrician.',
      }),
    });

    assert.equal(updateRes.status, 200);
    const body = await updateRes.json();
    assert.equal(body.data.user.name, 'Ravi Kumar');
    assert.equal(body.data.user.profileComplete, true);
    assert.ok(body.data.user.passportSlug.startsWith('ravi-kumar-'));
    assert.equal(body.data.user.hourlyRate, 94);
    assert.equal(body.data.user.dailyRate, 750);
  });

  it('PATCH /users/me: rejects photos from untrusted domains not in allowlist', async () => {
    const session = await loginUser('9000000014');
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'worker' }),
    });

    const badPhotoRes = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        photoUrl: 'https://untrusted-storage-bucket.com/hacker.jpg',
      }),
    });

    assert.equal(badPhotoRes.status, 400);
    const body = await badPhotoRes.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.match(body.error.message, /not in the allowed storage hosts/i);
  });

  it('PATCH /users/me: handles passport slug collision deterministically for same worker name', async () => {
    // Worker 1: Ravi Shinde
    const session1 = await loginUser('9000000015');
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session1.accessToken}` },
      body: JSON.stringify({ role: 'worker' }),
    });
    const res1 = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session1.accessToken}` },
      body: JSON.stringify({
        name: 'Ravi Shinde',
        skills: ['mason'],
        rate: 800,
        rateUnit: 'day',
        area: 'Kothrud',
        city: 'Pune',
        location: { lat: 18.5074, lng: 73.8077 },
      }),
    });
    const body1 = await res1.json();
    const slug1 = body1.data.user.passportSlug;

    // Worker 2: Same name 'Ravi Shinde'
    const session2 = await loginUser('9000000016');
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session2.accessToken}` },
      body: JSON.stringify({ role: 'worker' }),
    });
    const res2 = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session2.accessToken}` },
      body: JSON.stringify({
        name: 'Ravi Shinde',
        skills: ['mason'],
        rate: 800,
        rateUnit: 'day',
        area: 'Kothrud',
        city: 'Pune',
        location: { lat: 18.5074, lng: 73.8077 },
      }),
    });
    const body2 = await res2.json();
    const slug2 = body2.data.user.passportSlug;

    assert.ok(slug1);
    assert.ok(slug2);
    assert.notEqual(slug1, slug2, 'Colliding worker names must yield distinct passport slugs');
  });
});
