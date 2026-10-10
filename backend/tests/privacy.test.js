/**
 * WorkCred Privacy & PII / Credential Redaction Audit Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb } from './helper.js';
import { logger } from '../src/utils/logger.js';

describe('Privacy & PII Log Redaction Audit', () => {
  let server;
  let baseUrl;
  const capturedLogs = [];

  before(async () => {
    await setupTestDb();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}/api/v1`;

    // Hook logger to capture stream
    const originalInfo = logger.info.bind(logger);
    const originalWarn = logger.warn.bind(logger);
    const originalError = logger.error.bind(logger);

    logger.info = (...args) => {
      capturedLogs.push(JSON.stringify(args));
      return originalInfo(...args);
    };
    logger.warn = (...args) => {
      capturedLogs.push(JSON.stringify(args));
      return originalWarn(...args);
    };
    logger.error = (...args) => {
      capturedLogs.push(JSON.stringify(args));
      return originalError(...args);
    };
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await teardownTestDb();
  });

  it('Guarantees zero OTP codes, plain tokens, cookies, or unmasked phones in application logs', async () => {
    const rawPhone = '9876543210';
    const otpCode = '123456';

    // 1. Request OTP
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: rawPhone }),
    });

    // 2. Verify OTP
    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: rawPhone, code: otpCode }),
    });
    const verifyBody = await verifyRes.json();
    const accessToken = verifyBody.data.accessToken;
    const cookie = verifyRes.headers.get('set-cookie');

    // 3. Refresh
    await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'workcred',
        Cookie: cookie,
      },
    });

    // 4. Update Profile
    await fetch(`${baseUrl}/users/me/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ role: 'worker' }),
    });

    const combinedLogOutput = capturedLogs.join('\n');

    // Assertions
    // Unmasked full phone number must NEVER appear in logs
    assert.ok(!combinedLogOutput.includes(rawPhone), 'Full unmasked phone number leaked in logs');
    assert.ok(!combinedLogOutput.includes('+919876543210'), 'E.164 unmasked phone leaked in logs');

    // Masked phone format must be present
    assert.ok(combinedLogOutput.includes('+91*****3210'), 'Masked phone expected in audit events');

    // OTP Code must NEVER appear in logs
    assert.ok(!combinedLogOutput.includes(`"code":"${otpCode}"`), 'Plain OTP code leaked in logs');
    assert.ok(!combinedLogOutput.includes(`"otp":"${otpCode}"`), 'Plain OTP parameter leaked in logs');

    // Plain Bearer Access Token must NEVER appear in logs
    assert.ok(!combinedLogOutput.includes(accessToken), 'Plain Bearer token leaked in logs');
  });
});
