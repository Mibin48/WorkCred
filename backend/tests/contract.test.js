/**
 * Contract Parity Suite: Real Backend vs Mock Service
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { AUTH_CONTRACT_SCENARIOS } from './contract/auth.scenarios.js';
import { handleMockRequest } from '../../frontend/app/js/mock/handlers.js';
import { resetDb } from '../../frontend/app/js/mock/db.js';

describe('Contract Parity Verification (Real Backend vs Mock Service)', () => {
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
    resetDb();
  });

  for (const scenario of AUTH_CONTRACT_SCENARIOS) {
    it(`Contract Scenario: ${scenario.name}`, async () => {
      // 1. Run against Real Backend
      const realRes = await fetch(`${baseUrl}${scenario.path}`, {
        method: scenario.method,
        headers: {
          'Content-Type': 'application/json',
          ...(scenario.headers || {}),
        },
        body: scenario.body ? JSON.stringify(scenario.body) : undefined,
      });

      const realBody = await realRes.json();
      assert.equal(realRes.status, scenario.expectedStatus, `Real backend status mismatch on ${scenario.name}`);
      assert.equal(realBody.success, scenario.expectedSuccess, `Real backend success mismatch on ${scenario.name}`);

      if (scenario.expectedErrorCode) {
        assert.ok(
          realBody.error.code === scenario.expectedErrorCode ||
          (scenario.expectedErrorCode === 'VALIDATION_ERROR' && realBody.error.code === 'INVALID_PHONE'),
          `Real backend error code mismatch: got ${realBody.error?.code}, expected ${scenario.expectedErrorCode}`
        );
      }

      if (scenario.validateData && realBody.success) {
        assert.ok(scenario.validateData(realBody.data), `Real backend data schema validation failed on ${scenario.name}`);
      }

      // 2. Run against Mock Service
      const mockResult = await handleMockRequest(
        scenario.method,
        `/api/v1${scenario.path}`,
        scenario.body || {},
        scenario.headers || {}
      );

      assert.equal(mockResult.success, scenario.expectedSuccess, `Mock service success mismatch on ${scenario.name}`);
      if (scenario.expectedErrorCode) {
        assert.ok(
          mockResult.error.code === scenario.expectedErrorCode ||
          (scenario.expectedErrorCode === 'VALIDATION_ERROR' && mockResult.error.code === 'INVALID_PHONE'),
          `Mock error code mismatch: got ${mockResult.error?.code}`
        );
      }
    });
  }
});
