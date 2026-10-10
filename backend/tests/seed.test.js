/**
 * WorkCred Seed Parity & Cryptographic Ledger Verification Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  User,
  Job,
  Booking,
  PassportEntry,
  Availability,
  RateStat,
  Post,
  Follow,
  Endorsement,
  ensureIndexes,
} from '../src/models/index.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { generateSeedData } from '../src/seed/seed.js';
import { verifyChain } from '../../shared/hash.js';

describe('Seed Data Parity & Cryptographic Ledger Audit', () => {
  before(async () => {
    await setupTestDb();
    await ensureIndexes();
  });

  after(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('Seed generation produces expected record counts and demo accounts', async () => {
    const data = await generateSeedData();

    assert.equal(data.users.length, 52); // 40 workers + 12 customers
    assert.equal(data.jobs.length, 25);
    assert.ok(data.bookings.length >= 120);
    assert.ok(data.passportEntries.length >= 120);
    assert.equal(data.availability.length, 8);
    assert.equal(data.rateStats.length, 110); // 10 localities * 11 skills
    assert.equal(data.posts.length, 15);
    assert.equal(data.follows.length, 20);
    assert.equal(data.endorsements.length, 30);

    const ravi = data.users.find((u) => u.phone === '9000000001');
    assert.ok(ravi);
    assert.equal(ravi.name, 'Ravi Kumar');
    assert.equal(ravi.role, 'worker');

    const meera = data.users.find((u) => u.phone === '9000000002');
    assert.ok(meera);
    assert.equal(meera.name, 'Meera Nair');
    assert.equal(meera.role, 'customer');
  });

  it('Seeding is idempotent: running twice does not duplicate records', async () => {
    const data = await generateSeedData();

    // First insert
    await User.insertMany(data.users);
    assert.equal(await User.countDocuments({ isSample: true }), 52);

    // Clean sample data & re-insert
    await User.deleteMany({ isSample: true });
    await User.insertMany(data.users);
    assert.equal(await User.countDocuments({ isSample: true }), 52);
  });

  it('Passport Ledger: every worker chain passes cryptographic audit (verifyChain)', async () => {
    const data = await generateSeedData();
    await PassportEntry.insertMany(data.passportEntries);

    const workers = data.users.filter((u) => u.role === 'worker');

    for (const worker of workers) {
      const entries = await PassportEntry.find({ workerId: worker._id }).sort({ seq: 1 });
      if (entries.length > 0) {
        const audit = await verifyChain(entries.map((e) => e.toObject()));
        assert.equal(
          audit.valid,
          true,
          `Worker ${worker.name} (${worker._id}) chain verification failed: ${JSON.stringify(audit)}`
        );
        assert.equal(audit.checkedEntries, entries.length);
        assert.equal(audit.brokenAtSeq, null);
      }
    }
  });

  it('Passport Ledger: tampering a stored record directly in database causes audit to fail', async () => {
    const data = await generateSeedData();
    await PassportEntry.insertMany(data.passportEntries);

    const demoWorkerId = 'user-worker-ravi';
    const entries = await PassportEntry.find({ workerId: demoWorkerId }).sort({ seq: 1 });
    assert.ok(entries.length >= 10);

    // Tamper seq 5 directly via raw MongoDB native collection (bypassing Mongoose pre-hook)
    await mongoose.connection.db.collection('passportentries').updateOne(
      { workerId: demoWorkerId, seq: 5 },
      { $set: { 'fields.amountPaid': 999999 } }
    );

    const tamperedEntries = await PassportEntry.find({ workerId: demoWorkerId }).sort({ seq: 1 });
    const audit = await verifyChain(tamperedEntries.map((e) => e.toObject()));

    assert.equal(audit.valid, false, 'Tampered ledger entry MUST fail verifyChain');
    assert.equal(audit.brokenAtSeq, 5, 'Broken sequence number must pinpoint tampered block (seq 5)');
  });
});
