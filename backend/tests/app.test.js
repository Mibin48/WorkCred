/**
 * App Integration & HTTP Pipeline Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb } from './helper.js';

describe('Express App & HTTP Middleware Pipeline', () => {
  let server;
  let baseUrl;

  before(async () => {
    await setupTestDb();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await teardownTestDb();
  });

  it('GET /api/v1/health should return standard 200 liveness envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.ok(typeof body.data.uptime === 'number');
    assert.equal(body.data.version, '1.0.0');
  });

  it('GET /api/v1/health/ready should return 200 when database is connected', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ready');
    assert.equal(body.data.database, 'connected');
  });

  it('GET /api/v1/health/ready should return 503 when database connection is down', async () => {
    // Disconnect mongoose temporarily
    await mongoose.disconnect();

    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');

    // Reconnect for subsequent tests
    await mongoose.connect(process.env.MONGODB_URI);
  });

  it('GET /api/v1/unknown-endpoint should return JSON 404 envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/unknown-endpoint`);
    assert.equal(res.status, 404);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('POST with invalid JSON body should return 400 INVALID_JSON', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ malformed json: true, ',
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  it('POST with oversized payload (>100kb) should return 413 PAYLOAD_TOO_LARGE', async () => {
    const largeString = 'a'.repeat(105 * 1024);
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: largeString }),
    });

    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('Security: should include Helmet security headers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
  });

  it('Static Serving: / should serve landing page HTML with no-cache', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('Static Serving: /app/index.html SPA fallback for /app and /p/:slug', async () => {
    const appRes = await fetch(`${baseUrl}/app/workers`);
    assert.equal(appRes.status, 200);
    const appHtml = await appRes.text();
    assert.match(appHtml, /wc-app-body/);

    const slugRes = await fetch(`${baseUrl}/p/ravi-kumar-pune-842`);
    assert.equal(slugRes.status, 200);
    const slugHtml = await slugRes.text();
    assert.match(slugHtml, /wc-app-body/);
  });

  it('Static Security: forbidden paths (/backend, /docs, /package.json, dotfiles) must return 404', async () => {
    const blockedPaths = [
      '/backend/package.json',
      '/backend/src/server.js',
      '/docs/SYSTEM_DESIGN.md',
      '/package.json',
      '/.env',
      '/.git/config',
    ];

    for (const p of blockedPaths) {
      const res = await fetch(`${baseUrl}${p}`);
      assert.equal(res.status, 404, `Path ${p} should be blocked with 404`);
    }
  });
});
