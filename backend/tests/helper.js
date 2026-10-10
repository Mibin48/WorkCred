/**
 * WorkCred Backend Test Helper
 * Manages MongoMemoryReplSet / TEST_MONGODB_URI for transaction-compatible tests.
 * Strict guards preventing any test operations against development/production databases.
 */

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { parseMongoUri } from '../src/config/env.js';
import { DB_OPTIONS } from '../src/config/db.js';

let replSet = null;
let testUri = null;

export async function setupTestDb() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test_jwt_access_secret_at_least_32_characters_long_12345';
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_characters_long_12345';
  process.env.CODES_ENC_KEY = Buffer.alloc(32, 'a').toString('base64');
  process.env.OTP_MODE = 'dev';

  if (process.env.TEST_MONGODB_URI) {
    const parsed = parseMongoUri(process.env.TEST_MONGODB_URI);
    if (!parsed.valid || !parsed.dbName.endsWith('_test')) {
      throw new Error(`TEST_MONGODB_URI must end with '_test'. Got '${parsed.dbName}'. Refusing to run tests.`);
    }
    testUri = process.env.TEST_MONGODB_URI;
  } else {
    // Start MongoMemoryReplSet with single node for transaction support
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger', dbName: 'workcred_test' },
    });
    testUri = replSet.getUri('workcred_test');
  }

  process.env.MONGODB_URI = testUri;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(testUri, DB_OPTIONS);
  }

  return testUri;
}

export async function teardownTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

/**
 * Safely clears all collections in the test database.
 * Refuses to run if database name does not contain 'test'.
 */
export async function clearTestDb() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const dbName = mongoose.connection.name;
  if (!dbName || (!dbName.includes('test') && !dbName.endsWith('_test'))) {
    throw new Error(`CRITICAL TEST SAFETY GUARD: Refusing to clear database '${dbName}'. Tests can only clear databases with 'test' in their name.`);
  }

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}
