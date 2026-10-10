/**
 * WorkCred Database Models & Indexes Integration Tests
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
  Follow,
  Endorsement,
  ensureIndexes,
} from '../src/models/index.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { clock } from '../src/utils/clock.js';
import { GENESIS_HASH, computeEntryHash } from '../../shared/hash.js';

describe('Mongoose Models & Indexes Verification', () => {
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

  it('ensureIndexes should create all expected indexes with explicit names', async () => {
    const userIndexes = await User.collection.listIndexes().toArray();
    const userIndexNames = userIndexes.map((i) => i.name);
    assert.ok(userIndexNames.includes('users_phone_unique'));
    assert.ok(userIndexNames.includes('users_passport_slug_unique'));
    assert.ok(userIndexNames.includes('users_location_2dsphere'));
    assert.ok(userIndexNames.includes('users_role_active_skills'));
    assert.ok(userIndexNames.includes('users_role_rating_sort'));

    const bookingIndexes = await Booking.collection.listIndexes().toArray();
    const bookingIndexNames = bookingIndexes.map((i) => i.name);
    assert.ok(bookingIndexNames.includes('bookings_worker_job_active_unique'));

    const passportIndexes = await PassportEntry.collection.listIndexes().toArray();
    const passportIndexNames = passportIndexes.map((i) => i.name);
    assert.ok(passportIndexNames.includes('passport_entries_booking_id_unique'));
    assert.ok(passportIndexNames.includes('passport_entries_worker_seq_unique'));

    const availIndexes = await Availability.collection.listIndexes().toArray();
    const availIndexNames = availIndexes.map((i) => i.name);
    assert.ok(availIndexNames.includes('availability_worker_active_unique'));
    assert.ok(availIndexNames.includes('availability_expires_at_ttl'));
  });

  it('User: unique phone constraint rejects duplicates', async () => {
    await User.create({
      phone: '9000000001',
      name: 'Ravi Kumar',
      role: 'worker',
      skills: ['electrician'],
      rate: 750,
      location: { type: 'Point', coordinates: [73.8567, 18.5204] },
    });

    await assert.rejects(
      async () => {
        await User.create({
          phone: '9000000001',
          name: 'Duplicate Ravi',
          role: 'worker',
        });
      },
      (err) => err.code === 11000
    );
  });

  it('User: publicProjection strips phone number and exact coordinates', async () => {
    const user = await User.create({
      phone: '9000000001',
      name: 'Ravi Kumar',
      role: 'worker',
      area: 'Shivajinagar',
      city: 'Pune',
      skills: ['electrician'],
      location: { type: 'Point', coordinates: [73.8467, 18.5304] },
    });

    const projected = User.publicProjection(user);
    assert.equal(projected.phone, undefined);
    assert.equal(projected.location, undefined);
    assert.equal(projected.area, 'Shivajinagar');
    assert.equal(projected.name, 'Ravi Kumar');
  });

  it('2dsphere Geospatial: $near query uses geo index and returns sorted distance', async () => {
    // 1. Shivajinagar
    await User.create({
      _id: 'user-shivaji',
      phone: '9000000011',
      name: 'Shivaji Worker',
      role: 'worker',
      location: { type: 'Point', coordinates: [73.8467, 18.5304] },
    });

    // 2. Kothrud (Further)
    await User.create({
      _id: 'user-kothrud',
      phone: '9000000012',
      name: 'Kothrud Worker',
      role: 'worker',
      location: { type: 'Point', coordinates: [73.8077, 18.5074] },
    });

    // Query from Deccan (Closer to Shivajinagar than Kothrud)
    const deccanLng = 73.8418;
    const deccanLat = 18.5158;

    const explain = await User.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [deccanLng, deccanLat] },
          $maxDistance: 10000,
        },
      },
    }).explain('executionStats');

    // Verify 2dsphere index was utilized
    const stage = JSON.stringify(explain);
    assert.ok(stage.includes('GEO_NEAR') || stage.includes('2dsphere') || stage.includes('users_location_2dsphere'));

    const results = await User.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [deccanLng, deccanLat] },
          $maxDistance: 10000,
        },
      },
    });

    assert.equal(results.length, 2);
    assert.equal(results[0]._id, 'user-shivaji'); // Closer first
    assert.equal(results[1]._id, 'user-kothrud');
  });

  it('Availability: activeNear filters expired records immediately before TTL monitor', async () => {
    const now = clock.now();

    // Active unexpired window
    await Availability.create({
      workerId: 'worker-1',
      skill: 'electrician',
      hours: 4,
      rate: 750,
      location: { type: 'Point', coordinates: [73.8467, 18.5304] },
      active: true,
      expiresAt: new Date(now + 3600000), // expires in 1 hour
    });

    // Expired window (Still present in DB before Mongo TTL runs)
    await Availability.create({
      workerId: 'worker-2',
      skill: 'electrician',
      hours: 2,
      rate: 600,
      location: { type: 'Point', coordinates: [73.8467, 18.5304] },
      active: true,
      expiresAt: new Date(now - 60000), // expired 1 minute ago
    });

    const activeList = await Availability.activeNear({
      lat: 18.5304,
      lng: 73.8467,
      radiusKm: 5,
    });

    assert.equal(activeList.length, 1);
    assert.equal(activeList[0].workerId, 'worker-1');
  });

  it('Availability: partial unique index enforces single active window per worker', async () => {
    await Availability.create({
      workerId: 'worker-single-active',
      skill: 'electrician',
      hours: 4,
      rate: 750,
      location: { type: 'Point', coordinates: [73.8467, 18.5304] },
      active: true,
      expiresAt: new Date(Date.now() + 3600000),
    });

    await assert.rejects(
      async () => {
        await Availability.create({
          workerId: 'worker-single-active',
          skill: 'electrician',
          hours: 2,
          rate: 750,
          location: { type: 'Point', coordinates: [73.8467, 18.5304] },
          active: true,
          expiresAt: new Date(Date.now() + 7200000),
        });
      },
      (err) => err.code === 11000
    );
  });

  it('Booking: codes are encrypted at rest and omitted from toJSON', async () => {
    const booking = new Booking({
      customerId: 'cust-1',
      workerId: 'worker-1',
      skill: 'electrician',
      rate: 750,
      status: 'pending',
    });

    booking.setCodes('8429', '6104');
    await booking.save();

    // 1. Verify JSON transformation removes codes
    const json = booking.toJSON();
    assert.equal(json.startCodeEnc, undefined);
    assert.equal(json.finishCodeEnc, undefined);
    assert.equal(json.startCode, undefined);
    assert.equal(json.finishCode, undefined);

    // 2. Read raw MongoDB document directly via native driver
    const rawDoc = await mongoose.connection.db.collection('bookings').findOne({ _id: booking._id });
    assert.ok(rawDoc.startCodeEnc.startsWith('v1:'));
    assert.ok(rawDoc.finishCodeEnc.startsWith('v1:'));
    assert.ok(!JSON.stringify(rawDoc).includes('8429'));
    assert.ok(!JSON.stringify(rawDoc).includes('6104'));

    // 3. Decrypt helper
    const loaded = await Booking.findById(booking._id).select('+startCodeEnc +finishCodeEnc');
    assert.equal(loaded.getDecryptedStartCode(), '8429');
    assert.equal(loaded.getDecryptedFinishCode(), '6104');
  });

  it('Booking: overlap helper detects conflicting time slots', async () => {
    const scheduledDate = new Date('2026-10-15T10:00:00.000Z');
    await Booking.create({
      customerId: 'cust-1',
      workerId: 'worker-overlap-check',
      skill: 'electrician',
      status: 'confirmed',
      rate: 750,
      scheduledAt: scheduledDate,
      hours: 4, // 10:00 - 14:00
    });

    // 1. Conflicting overlapping window (11:00 - 13:00)
    const isConflict1 = await Booking.overlapsFor(
      'worker-overlap-check',
      '2026-10-15T11:00:00.000Z',
      '2026-10-15T13:00:00.000Z'
    );
    assert.equal(isConflict1, true);

    // 2. Non-conflicting window (15:00 - 18:00)
    const isConflict2 = await Booking.overlapsFor(
      'worker-overlap-check',
      '2026-10-15T15:00:00.000Z',
      '2026-10-15T18:00:00.000Z'
    );
    assert.equal(isConflict2, false);
  });

  it('PassportEntry: Append-Only Guard blocks mutation and deletion of ledger entries', async () => {
    const fields = {
      bookingId: 'book-100',
      workerId: 'worker-100',
      customerId: 'cust-100',
      skill: 'electrician',
      hoursWorked: 4,
      amountPaid: 375,
      startedAt: '2026-10-10T09:00:00.000Z',
      finishedAt: '2026-10-10T13:00:00.000Z',
      rating: 5,
    };
    const hash = await computeEntryHash(GENESIS_HASH, fields);

    const entry = await PassportEntry.create({
      bookingId: 'book-100',
      workerId: 'worker-100',
      seq: 1,
      prevHash: GENESIS_HASH,
      hash,
      fields,
      visibility: 'public',
      isMasked: true,
    });

    // 1. Attempt to mutate hashed fields via updateOne -> must fail
    await assert.rejects(async () => {
      await PassportEntry.updateOne({ _id: entry._id }, { hash: 'tampered-hash' });
    }, /integrity violation/i);

    // 2. Attempt to delete -> must fail
    await assert.rejects(async () => {
      await PassportEntry.deleteOne({ _id: entry._id });
    }, /permanent and cannot be deleted/i);

    // 3. Allowed privacy update (visibility / isMasked) -> succeeds
    await PassportEntry.updateOne({ _id: entry._id }, { visibility: 'private', isMasked: false });
    const updated = await PassportEntry.findById(entry._id);
    assert.equal(updated.visibility, 'private');
    assert.equal(updated.isMasked, false);
  });

  it('PassportEntry: Duplicate seq insert rejection protects against concurrent writers', async () => {
    const fields1 = {
      bookingId: 'b-seq-1',
      workerId: 'worker-concurrent',
      customerId: 'cust-1',
      skill: 'helper',
      hoursWorked: 2,
      amountPaid: 200,
      startedAt: '2026-10-10T09:00:00.000Z',
      finishedAt: '2026-10-10T11:00:00.000Z',
      rating: 5,
    };
    const hash1 = await computeEntryHash(GENESIS_HASH, fields1);

    await PassportEntry.create({
      bookingId: 'b-seq-1',
      workerId: 'worker-concurrent',
      seq: 1,
      prevHash: GENESIS_HASH,
      hash: hash1,
      fields: fields1,
    });

    // 10 simultaneous parallel writers attempting to insert seq: 2
    const writers = Array.from({ length: 10 }).map((_, idx) => {
      const f = { ...fields1, bookingId: `b-seq-2-${idx}` };
      return computeEntryHash(hash1, f).then((h) =>
        PassportEntry.create({
          bookingId: `b-seq-2-${idx}`,
          workerId: 'worker-concurrent',
          seq: 2,
          prevHash: hash1,
          hash: h,
          fields: f,
        })
      );
    });

    const results = await Promise.allSettled(writers);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one writer should win the seq 2 slot');
    assert.equal(rejected.length, 9, 'All other 9 writers must be rejected by unique seq index');
  });
});
