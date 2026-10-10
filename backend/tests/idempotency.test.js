/**
 * WorkCred Idempotency Middleware Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Job } from '../src/models/Job.js';

describe('Idempotency Middleware Module', () => {
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

  async function loginCustomer(phone = '9870000001') {
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

    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: 'customer' }),
    });

    await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Idempotent Customer',
        area: 'Central',
        city: 'Bangalore',
        location: { lat: 12.9716, lng: 77.5946 },
      }),
    });

    return token;
  }

  it('Safe retry: identical request with same Idempotency-Key returns cached response with Idempotent-Replayed: true', async () => {
    const token = await loginCustomer();
    const key = 'test-idemp-key-12345678';

    const payload = {
      title: 'Plumbing repair needed',
      skill: 'plumber',
      offeredRate: 700,
      rateUnit: 'day',
      workersNeeded: 1,
      hours: 4,
      lat: 12.9716,
      lng: 77.5946,
    };

    // 1. Initial request
    const res1 = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.headers.get('idempotent-replayed'), null);
    const body1 = await res1.json();
    assert.strictEqual(body1.success, true);
    const createdJobId = body1.data.job.id;

    // 2. Replay request with exact same key and payload
    const res2 = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.headers.get('idempotent-replayed'), 'true');
    const body2 = await res2.json();
    assert.strictEqual(body2.data.job.id, createdJobId);

    // Verify only 1 job created in DB
    const jobsCount = await Job.countDocuments();
    assert.strictEqual(jobsCount, 1);
  });

  it('Key reuse with differing body returns 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const token = await loginCustomer('9870000002');
    const key = 'test-idemp-key-diff-body';

    const payload1 = {
      title: 'Job 1 Title',
      skill: 'plumber',
      offeredRate: 500,
      lat: 12.9716,
      lng: 77.5946,
    };

    const res1 = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload1),
    });
    assert.strictEqual(res1.status, 200);

    // Different body with same key
    const payload2 = {
      title: 'Different Title Entirely',
      skill: 'electrician',
      offeredRate: 800,
      lat: 12.9716,
      lng: 77.5946,
    };

    const res2 = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload2),
    });

    assert.strictEqual(res2.status, 422);
    const body2 = await res2.json();
    assert.strictEqual(body2.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });
});
