/**
 * WorkCred Local Run & Demorun Resilience Tests
 * Validates multi-origin support, database-down resilience, and missing Cloudinary handling.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { config, validateEnv } from '../src/config/env.js';
import { generateUploadSignature } from '../src/utils/cloudinary.js';
import { setupTestDb, teardownTestDb } from './helper.js';

describe('Local Run & Demo Readiness (Phase 1)', () => {
  let server;
  let baseUrl;
  let testDbUri;

  before(async () => {
    testDbUri = await setupTestDb();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDb();
  });

  it('Multi-origin: derives localhost and 127.0.0.1 when APP_ORIGIN is empty in dev', () => {
    const validated = validateEnv({
      NODE_ENV: 'development',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/workcred',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_at_least_32_characters_12345',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_at_least_32_characters_12345',
      CODES_ENC_KEY: Buffer.alloc(32, 'a').toString('base64'),
    });

    assert.equal(validated.valid, true);
    assert.deepEqual(validated.config.APP_ORIGINS, [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
    ]);
    assert.equal(validated.config.PRIMARY_APP_ORIGIN, 'http://localhost:4000');
  });

  it('Multi-origin: supports comma-separated APP_ORIGIN and sets PRIMARY_APP_ORIGIN', () => {
    const validated = validateEnv({
      NODE_ENV: 'development',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/workcred',
      APP_ORIGIN: 'http://localhost:4000,http://127.0.0.1:4000,http://192.168.1.50:4000',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_at_least_32_characters_12345',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_at_least_32_characters_12345',
      CODES_ENC_KEY: Buffer.alloc(32, 'a').toString('base64'),
    });

    assert.equal(validated.valid, true);
    assert.deepEqual(validated.config.APP_ORIGINS, [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://192.168.1.50:4000',
    ]);
    assert.equal(validated.config.PRIMARY_APP_ORIGIN, 'http://localhost:4000');
  });

  it('Origin checks: accepts requests from localhost, 127.0.0.1 and rejects foreign origins', async () => {
    // 1. Foreign origin attempt on refresh
    const foreignRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'x-requested-with': 'workcred',
        origin: 'http://malicious-site.com',
      },
    });
    assert.equal(foreignRes.status, 403);
    const foreignJson = await foreignRes.json();
    assert.equal(foreignJson.error.code, 'FORBIDDEN');

    // 2. Localhost origin is allowed past origin check
    const localRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'x-requested-with': 'workcred',
        origin: 'http://localhost:4000',
      },
    });
    // Fails on missing cookie (401), confirming origin check passed
    assert.equal(localRes.status, 401);

    // 3. 127.0.0.1 origin is allowed past origin check
    const loopbackRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'x-requested-with': 'workcred',
        origin: 'http://127.0.0.1:4000',
      },
    });
    assert.equal(loopbackRes.status, 401);
  });

  it('Cloudinary: throws UPLOADS_UNAVAILABLE (503) when credentials are placeholder or empty', () => {
    assert.throws(
      () => {
        generateUploadSignature({
          userId: 'user-123',
          purpose: 'post',
          cloudName: 'placeholder',
          apiKey: 'placeholder',
          apiSecret: 'placeholder',
        });
      },
      (err) => {
        assert.equal(err.code, 'UPLOADS_UNAVAILABLE');
        assert.equal(err.status, 503);
        assert.ok(err.message.includes('Photo upload is not configured'));
        return true;
      }
    );
  });

  it('Static file serving: works for landing page and PWA shell', async () => {
    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    const rootHtml = await rootRes.text();
    assert.ok(/<!doctype html>/i.test(rootHtml));

    const appRes = await fetch(`${baseUrl}/app`);
    assert.equal(appRes.status, 200);
    const appHtml = await appRes.text();
    assert.ok(/<!doctype html>/i.test(appHtml));

    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.data.status, 'ok');
  });

  it('Database-down guard: returns 503 SERVICE_UNAVAILABLE when database is disconnected', async () => {
    // Temporarily disconnect mongoose
    await mongoose.disconnect();

    try {
      const res = await fetch(`${baseUrl}/api/v1/workers`);
      assert.equal(res.status, 503);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, 'SERVICE_UNAVAILABLE');
      assert.ok(json.error.message.includes('The database is not reachable'));

      const readyRes = await fetch(`${baseUrl}/api/v1/health/ready`);
      assert.equal(readyRes.status, 503);

      // /health liveness probe remains 200 even when database is down
      const livenessRes = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(livenessRes.status, 200);
    } finally {
      // Reconnect for teardown
      if (testDbUri) {
        await mongoose.connect(testDbUri);
      }
    }
  });
});
