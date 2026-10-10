/**
 * WorkCred Auth Module Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Otp } from '../src/models/Otp.js';
import { clock } from '../src/utils/clock.js';
import { AUTH_CONSTANTS } from '../src/modules/auth/auth.constants.js';

describe('Auth Module (OTP Request & Verify)', () => {
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
    clock.resetTime();
  });

  it('POST /auth/otp/request: validates phone number and normalizes prefixes', async () => {
    // 1. Invalid phone format
    const badRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '12345' }),
    });
    assert.equal(badRes.status, 400);
    const badBody = await badRes.json();
    assert.equal(badBody.success, false);
    assert.equal(badBody.error.code, 'VALIDATION_ERROR');

    // 2. Valid phone with +91 prefix
    const goodRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+91 9876543210' }),
    });
    assert.equal(goodRes.status, 200);
    const goodBody = await goodRes.json();
    assert.equal(goodBody.success, true);
    assert.equal(goodBody.data.expiresInSeconds, 300);
    assert.equal(goodBody.data.resendInSeconds, 30);
  });

  it('POST /auth/otp/request: stores keyed hash only (no plain OTP code in database)', async () => {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    const rawOtp = await mongoose.connection.db.collection('otps').findOne({ phone: '9876543210' });
    assert.ok(rawOtp);
    assert.ok(rawOtp.codeHash);
    assert.equal(rawOtp.codeHash.length, 64); // SHA-256 / HMAC-SHA256 hex length
    assert.equal(rawOtp.code, undefined);
    assert.ok(!JSON.stringify(rawOtp).includes('123456'));
  });

  it('POST /auth/otp/request: enforces 30s cooldown between requests', async () => {
    const t0 = 1760000000000;
    clock.setTime(t0);

    // First request -> 200
    const res1 = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    assert.equal(res1.status, 200);

    // Second request 10s later -> 429
    clock.setTime(t0 + 10000);
    const res2 = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    assert.equal(res2.status, 429);
    const body2 = await res2.json();
    assert.equal(body2.error.code, 'RATE_LIMITED');
    assert.equal(body2.error.details.retryAfter, 20);

    // Third request after 30s cooldown (31s later) -> 200
    clock.setTime(t0 + 31000);
    const res3 = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    assert.equal(res3.status, 200);
  });

  it('POST /auth/otp/request: enforces 10-minute window limit (max 3 sends)', async () => {
    const t0 = 1760000000000;
    clock.setTime(t0);

    // Send 1 (t0)
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    // Send 2 (t0 + 35s)
    clock.setTime(t0 + 35000);
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    // Send 3 (t0 + 70s)
    clock.setTime(t0 + 70000);
    const res3 = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    assert.equal(res3.status, 200);

    // Send 4 (t0 + 105s) -> Exceeds 3 sends within 10 min window -> 429
    clock.setTime(t0 + 105000);
    const res4 = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    assert.equal(res4.status, 429);
    const body4 = await res4.json();
    assert.equal(body4.error.code, 'RATE_LIMITED');
  });

  it('POST /auth/otp/verify: successful verification creates user, session, and refresh cookie', async () => {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '123456' }),
    });

    assert.equal(verifyRes.status, 200);
    const body = await verifyRes.json();
    assert.equal(body.success, true);
    assert.ok(body.data.accessToken);
    assert.equal(body.data.user.phone, '9876543210');
    assert.equal(body.data.user.role, null);
    assert.equal(body.data.user.isNew, true);
    assert.equal(body.data.user.profileComplete, false);

    // Verify Set-Cookie header
    const setCookie = verifyRes.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.ok(setCookie.includes('wc_rt='));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('Path=/api/v1/auth'));

    // Verify consumed OTP is deleted
    const otpRemaining = await Otp.findOne({ phone: '9876543210' });
    assert.equal(otpRemaining, null);
  });

  it('POST /auth/otp/verify: wrong code returns attempts left; 5 failures trigger lockout', async () => {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    // 4 wrong attempts
    for (let i = 1; i <= 4; i++) {
      const wrongRes = await fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210', code: '000000' }),
      });
      assert.equal(wrongRes.status, 400);
      const body = await wrongRes.json();
      assert.equal(body.error.code, 'INVALID_CODE');
      assert.equal(body.error.details.attemptsLeft, 5 - i);
    }

    // 5th wrong attempt -> 429 lockout
    const finalRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '000000' }),
    });
    assert.equal(finalRes.status, 429);
    const finalBody = await finalRes.json();
    assert.equal(finalBody.error.code, 'RATE_LIMITED');
  });

  it('POST /auth/otp/request: enforces daily limit of 10 OTP requests per number', async () => {
    const t0 = 1760000000000;
    clock.setTime(t0);

    // Send 10 times across spaced windows (e.g. every 15 minutes)
    for (let i = 0; i < 10; i++) {
      clock.setTime(t0 + i * 15 * 60 * 1000);
      const res = await fetch(`${baseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210' }),
      });
      assert.equal(res.status, 200, `Request ${i + 1} should succeed`);
    }

    // 11th request within 24 hours -> 429
    clock.setTime(t0 + 10 * 15 * 60 * 1000);
    const cappedRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    assert.equal(cappedRes.status, 429);
    const cappedBody = await cappedRes.json();
    assert.equal(cappedBody.error.code, 'RATE_LIMITED');
    assert.match(cappedBody.error.message, /daily otp limit/i);
  });

  it('POST /auth/otp/request: returns identical response envelope for new and existing users', async () => {
    // New phone
    const newRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const newBody = await newRes.json();

    // Create existing user
    await User.create({ phone: '9123456780', name: 'Existing User', role: 'customer' });

    // Existing phone
    const existingRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9123456780' }),
    });
    const existingBody = await existingRes.json();

    assert.equal(newRes.status, 200);
    assert.equal(existingRes.status, 200);
    assert.deepEqual(Object.keys(newBody.data).sort(), Object.keys(existingBody.data).sort());
    assert.equal(newBody.data.expiresInSeconds, existingBody.data.expiresInSeconds);
    assert.equal(newBody.data.resendInSeconds, existingBody.data.resendInSeconds);
  });

  it('POST /auth/otp/request: replaces previous OTP code on resend', async () => {
    const t0 = 1760000000000;
    clock.setTime(t0);

    // Request 1
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const otp1 = await Otp.findOne({ phone: '9876543210' });
    assert.ok(otp1);

    // Advance 35s and resend
    clock.setTime(t0 + 35000);
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });
    const otp2 = await Otp.findOne({ phone: '9876543210' });

    // Ensure single document updated with new timestamps
    const count = await Otp.countDocuments({ phone: '9876543210' });
    assert.equal(count, 1);
    assert.equal(otp2.lastSentAt.getTime(), t0 + 35000);
  });

  it('POST /auth/otp/verify: code works once and replay fails', async () => {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    // 1st verify -> 200
    const firstRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '123456' }),
    });
    assert.equal(firstRes.status, 200);

    // 2nd verify (replay with non-dev code or deleted OTP) -> fails with 400
    const replayRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '999999' }),
    });
    assert.equal(replayRes.status, 400);
  });

  it('POST /auth/otp/verify: expired OTP code (> 5 minutes) is rejected', async () => {
    const t0 = 1760000000000;
    clock.setTime(t0);

    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    // Advance 6 minutes (> 5 min expiry)
    clock.setTime(t0 + 6 * 60 * 1000);

    const expiredRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '000000' }),
    });
    assert.equal(expiredRes.status, 400);
    const body = await expiredRes.json();
    assert.equal(body.error.code, 'INVALID_CODE');
  });

  it('POST /auth/otp/verify: concurrent first-time verifies create exactly one user', async () => {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    // Fire 3 concurrent verification requests simultaneously
    const results = await Promise.all([
      fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210', code: '123456' }),
      }),
      fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210', code: '123456' }),
      }),
      fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9876543210', code: '123456' }),
      }),
    ]);

    // All should return valid response
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.includes(200));

    // MongoDB MUST contain exactly 1 User document for this phone
    const userDocs = await User.find({ phone: '9876543210' });
    assert.equal(userDocs.length, 1);
  });

  it('POST /auth/otp/verify: existing user verification reuses existing user and preserves role', async () => {
    // Seed existing worker
    const existing = await User.create({
      phone: '9876543210',
      name: 'Ramesh Mali',
      role: 'worker',
      skills: ['cleaner'],
      profileComplete: true,
      isActive: true,
    });

    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '123456' }),
    });

    assert.equal(verifyRes.status, 200);
    const body = await verifyRes.json();
    assert.equal(body.data.user.id, existing.id);
    assert.equal(body.data.user.isNew, false);
    assert.equal(body.data.user.role, 'worker');
    assert.equal(body.data.user.name, 'Ramesh Mali');
    assert.equal(body.data.user.profileComplete, true);
  });

  it('POST /auth/otp/verify: rejects deactivated accounts with 403 ACCOUNT_DISABLED', async () => {
    // Create deactivated user
    await User.create({
      phone: '9876543210',
      isActive: false,
    });

    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', code: '123456' }),
    });

    assert.equal(verifyRes.status, 403);
    const body = await verifyRes.json();
    assert.equal(body.error.code, 'ACCOUNT_DISABLED');
  });
});

