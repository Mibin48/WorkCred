/**
 * Environment Validation Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv, parseMongoUri } from '../src/config/env.js';

describe('Config & Environment Validation', () => {
  it('should parse valid MongoDB Atlas SRV URI with database name', () => {
    const res = parseMongoUri('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/workcred?retryWrites=true');
    assert.equal(res.valid, true);
    assert.equal(res.dbName, 'workcred');
    assert.equal(res.maskedHost, 'cluster0.abcde.mongodb.net');
    assert.equal(res.protocol, 'mongodb+srv');
  });

  it('should reject MongoDB URI without database name', () => {
    const res = parseMongoUri('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/?retryWrites=true');
    assert.equal(res.valid, false);
    assert.match(res.error, /missing a database name/i);
  });

  it('should reject invalid URI formats', () => {
    const res = parseMongoUri('not-a-valid-uri');
    assert.equal(res.valid, false);
  });

  it('should reject missing or short JWT secrets', () => {
    const res = validateEnv({
      NODE_ENV: 'development',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/workcred',
      JWT_ACCESS_SECRET: 'short_secret',
      JWT_REFRESH_SECRET: 'short_refresh_secret',
      CODES_ENC_KEY: Buffer.alloc(32).toString('base64'),
    });

    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('JWT_ACCESS_SECRET must be at least 32 characters')));
    assert.ok(res.errors.some((e) => e.includes('JWT_REFRESH_SECRET must be at least 32 characters')));
  });

  it('should reject invalid CODES_ENC_KEY length', () => {
    const res = validateEnv({
      NODE_ENV: 'development',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/workcred',
      JWT_ACCESS_SECRET: '12345678901234567890123456789012',
      JWT_REFRESH_SECRET: '12345678901234567890123456789012',
      CODES_ENC_KEY: Buffer.alloc(16).toString('base64'), // 16 bytes instead of 32
    });

    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('CODES_ENC_KEY must decode to exactly 32 bytes')));
  });

  it('should reject OTP_MODE=dev in production environment', () => {
    const res = validateEnv({
      NODE_ENV: 'production',
      PORT: '4000',
      MONGODB_URI: 'mongodb://localhost:27017/workcred',
      JWT_ACCESS_SECRET: '12345678901234567890123456789012',
      JWT_REFRESH_SECRET: '12345678901234567890123456789012',
      CODES_ENC_KEY: Buffer.alloc(32).toString('base64'),
      OTP_MODE: 'dev',
    });

    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('OTP_MODE cannot be set to "dev" in production')));
  });

  it('should reject TEST_MONGODB_URI if database name does not end with _test', () => {
    const res = validateEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      TEST_MONGODB_URI: 'mongodb://localhost:27017/workcred', // Should be workcred_test
      JWT_ACCESS_SECRET: '12345678901234567890123456789012',
      JWT_REFRESH_SECRET: '12345678901234567890123456789012',
      CODES_ENC_KEY: Buffer.alloc(32).toString('base64'),
    });

    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("database name must end with '_test'")));
  });

  it('connectDb: failure with invalid URI should log troubleshooting checklist and reject cleanly', async () => {
    const { connectDb } = await import('../src/config/db.js');
    await assert.rejects(
      async () => {
        // Deliberately unreachable throwaway URI with 1 retry and short timeout
        await connectDb('mongodb://invalid-user:invalid-pass@127.0.0.1:59999/workcred_test?connectTimeoutMS=100', 1);
      },
      /Failed to connect to MongoDB/i
    );
  });
});
