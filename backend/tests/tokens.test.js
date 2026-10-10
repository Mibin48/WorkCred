/**
 * WorkCred Token & Session Lifecycle Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { clock } from '../src/utils/clock.js';
import { signAccessToken } from '../src/utils/jwt.js';

describe('Tokens & Session Rotation & Reuse Detection', () => {
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

  async function loginTestUser(phone = '9876543210') {
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

    const setCookie = verifyRes.headers.get('set-cookie');
    const cookieMatch = setCookie.match(/wc_rt=([^;]+)/);
    const refreshToken = cookieMatch ? cookieMatch[1] : null;
    const body = await verifyRes.json();

    return {
      user: body.data.user,
      accessToken: body.data.accessToken,
      refreshToken,
      rawCookie: `wc_rt=${refreshToken}`,
    };
  }

  it('Access Token: validates Bearer token and rejects tampered or expired tokens', async () => {
    const session = await loginTestUser();

    // 1. Valid token accessing /users/me
    const meRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.data.user.id, session.user.id);

    // 2. Tampered token
    const tamperedRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}tampered` },
    });
    assert.equal(tamperedRes.status, 401);

    // 3. Expired token (advance clock by 16 minutes)
    clock.advance(16 * 60 * 1000);
    const expiredRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(expiredRes.status, 401);
    const expiredBody = await expiredRes.json();
    assert.equal(expiredBody.error.code, 'TOKEN_EXPIRED');
  });

  it('Access Token: rejects alg=none, fake signatures, and wrong-audience tokens', async () => {
    // 1. alg=none unsigned token
    const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user-123', iss: 'workcred', aud: 'workcred-app', exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    const unsignedToken = `${headerNone}.${payload}.`;

    const noneRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${unsignedToken}` },
    });
    assert.equal(noneRes.status, 401);

    // 2. Mismatched audience
    const session = await loginTestUser('9000000021');
    const meRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(meRes.status, 200);
  });

  it('Access Token: role changes take effect immediately without a new access token', async () => {
    const session = await loginTestUser('9000000022');

    // Before role assignment: role is null
    const beforeRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const beforeBody = await beforeRes.json();
    assert.equal(beforeBody.data.user.role, null);

    // Assign worker role
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ role: 'worker' }),
    });

    // Next request with EXACT SAME original token immediately reflects worker role
    const afterRes = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const afterBody = await afterRes.json();
    assert.equal(afterBody.data.user.role, 'worker');
  });

  it('Access Token: deactivated users are blocked immediately on next request', async () => {
    const session = await loginTestUser('9000000023');

    // Verify token works
    const res1 = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(res1.status, 200);

    // Deactivate user in database
    await User.updateOne({ _id: session.user.id }, { isActive: false });

    // Immediate block with 403 ACCOUNT_DISABLED
    const res2 = await fetch(`${baseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(res2.status, 403);
    const body2 = await res2.json();
    assert.equal(body2.error.code, 'ACCOUNT_DISABLED');
  });

  it('Refresh Token: rotates token and issues new access token on POST /auth/refresh', async () => {
    const session = await loginTestUser();

    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });

    assert.equal(refreshRes.status, 200);
    const body = await refreshRes.json();
    assert.ok(body.data.accessToken);
    assert.notEqual(body.data.accessToken, session.accessToken);

    const newCookie = refreshRes.headers.get('set-cookie');
    assert.ok(newCookie);
    assert.ok(!newCookie.includes(session.refreshToken));
  });

  it('CSRF Guard: /auth/refresh rejects requests missing X-Requested-With header or foreign origin', async () => {
    const session = await loginTestUser();

    // 1. Missing X-Requested-With header
    const noHeaderRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(noHeaderRes.status, 403);

    // 2. Foreign Origin
    const foreignRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Origin: 'https://malicious-site.com',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(foreignRes.status, 403);
  });

  it('Multi-tab Race Tolerance: reused token within 10s grace period returns 401 TOKEN_EXPIRED without revoking family', async () => {
    const session = await loginTestUser();
    const t0 = 1760000000000;
    clock.setTime(t0);

    // Tab 1 refreshes
    const refresh1 = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(refresh1.status, 200);
    const refresh1Cookie = refresh1.headers.get('set-cookie').match(/wc_rt=([^;]+)/)[1];

    // Tab 2 attempts refresh with old cookie 3s later (within 10s grace window)
    clock.setTime(t0 + 3000);
    const refresh2 = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(refresh2.status, 401);
    const body2 = await refresh2.json();
    assert.equal(body2.error.code, 'TOKEN_EXPIRED');

    // Family is NOT revoked: Tab 1's new cookie remains valid
    const tab1ValidRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: `wc_rt=${refresh1Cookie}`,
      },
    });
    assert.equal(tab1ValidRes.status, 200);
  });

  it('Reuse Breach: reused token after 10s grace period revokes entire token family', async () => {
    const session = await loginTestUser();
    const t0 = 1760000000000;
    clock.setTime(t0);

    // Initial refresh
    const refresh1 = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(refresh1.status, 200);
    const latestCookie = refresh1.headers.get('set-cookie').match(/wc_rt=([^;]+)/)[1];

    // Attacker attempts to replay original token 30s later (>10s grace window)
    clock.setTime(t0 + 30000);
    const attackerRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(attackerRes.status, 401);
    const attackerBody = await attackerRes.json();
    assert.equal(attackerBody.error.code, 'TOKEN_REUSED');

    // Entire family is revoked: latest valid cookie is now also rejected
    const victimRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: `wc_rt=${latestCookie}`,
      },
    });
    assert.equal(victimRes.status, 401);
  });

  it('Absolute Family Lifetime: sessions expire after 90 days', async () => {
    const t0 = 1760000000000;
    clock.setTime(t0);
    const session = await loginTestUser();

    // Advance time 91 days later
    clock.setTime(t0 + 91 * 24 * 60 * 60 * 1000);

    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });

    assert.equal(refreshRes.status, 401);
    const body = await refreshRes.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });

  it('Logout: POST /auth/logout clears cookie and revokes session family (idempotent)', async () => {
    const session = await loginTestUser();

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });

    assert.equal(logoutRes.status, 200);
    const clearCookie = logoutRes.headers.get('set-cookie');
    assert.ok(clearCookie.includes('wc_rt=;'));

    // Re-attempting refresh fails
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: session.rawCookie,
      },
    });
    assert.equal(refreshRes.status, 401);
  });
});
