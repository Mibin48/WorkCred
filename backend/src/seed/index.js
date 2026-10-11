/**
 * WorkCred Database Seeder CLI
 * Idempotently populates MongoDB with deterministic seed data and syncs indexes.
 * Never calls dropDatabase.
 */

import { config, parseMongoUri } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { generateSeedData } from './seed.js';
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
} from '../models/index.js';
import { decrypt } from '../utils/crypto.js';

async function runSeed() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');
  const hasYesFlag = args.includes('--yes');
  const forceProd = args.includes('--force-production');

  // Safety: Refuse to seed in production without explicit double flags
  if (config.NODE_ENV === 'production' && (!forceProd || process.env.CONFIRM_PRODUCTION_SEED !== 'yes')) {
    console.error('❌ SEED ABORTED: Seeding in production requires --force-production AND CONFIRM_PRODUCTION_SEED=yes.');
    process.exit(1);
  }

  // Safety: Reset requires --yes flag
  if (isReset && !hasYesFlag) {
    console.error('❌ RESET ABORTED: Resetting database collections requires the --yes flag (e.g. "npm run seed:reset -- --yes" or "node src/seed/index.js --reset --yes").');
    process.exit(1);
  }

  const parsed = parseMongoUri(config.MONGODB_URI);
  console.log(`\n🌱 Starting WorkCred Seeder...`);
  console.log(`   Host: ${parsed.maskedHost}`);
  console.log(`   Database: ${parsed.dbName}`);
  console.log(`   Environment: ${config.NODE_ENV}`);
  console.log(`   Mode: ${isReset ? 'Full Reset (Per-collection clean)' : 'Idempotent Sample Refresh'}\n`);

  try {
    await connectDb(config.MONGODB_URI);

    // 1. Ensure all indexes
    await ensureIndexes();

    // 2. Clean previous sample data or full collection reset (NEVER call dropDatabase)
    if (isReset) {
      console.log('🧹 Clearing all collections (per-collection deleteMany)...');
      await Promise.all([
        User.deleteMany({}),
        Job.deleteMany({}),
        Booking.deleteMany({}),
        PassportEntry.deleteMany({}, { _forceLedgerReset: true }),
        Availability.deleteMany({}),
        RateStat.deleteMany({}),
        Post.deleteMany({}),
        Follow.deleteMany({}),
        Endorsement.deleteMany({}),
      ]);
    } else {
      console.log('🧹 Cleaning previous sample data (isSample: true)...');
      const seedPhones = (await generateSeedData()).users.map((u) => u.phone);
      await Promise.all([
        User.deleteMany({ $or: [{ isSample: true }, { phone: { $in: seedPhones } }] }),
        Job.deleteMany({ isSample: true }),
        Booking.deleteMany({ isSample: true }),
        PassportEntry.deleteMany({ isSample: true }, { _forceLedgerReset: true }),
        Availability.deleteMany({ isSample: true }),
        RateStat.deleteMany({ $or: [{ isSample: true }, { isSeed: true }] }),
        Post.deleteMany({ isSample: true }),
        Follow.deleteMany({ isSample: true }),
        Endorsement.deleteMany({ isSample: true }),
      ]);
    }

    // 3. Generate deterministic data
    const data = await generateSeedData();

    // 4. Insert records
    console.log('📦 Inserting seed data...');
    await User.insertMany(data.users);
    await Job.insertMany(data.jobs);
    await Booking.insertMany(data.bookings);
    await PassportEntry.insertMany(data.passportEntries);
    await Availability.insertMany(data.availability);
    await RateStat.insertMany(data.rateStats);
    await Post.insertMany(data.posts);
    await Follow.insertMany(data.follows);
    await Endorsement.insertMany(data.endorsements);

    console.log('\n✅ Database seeded successfully:');
    console.log(`   • Users: ${data.users.length} (${data.users.filter((u) => u.role === 'worker').length} workers, ${data.users.filter((u) => u.role === 'customer').length} customers)`);
    console.log(`   • Broadcast Jobs: ${data.jobs.length}`);
    console.log(`   • Bookings: ${data.bookings.length} (${data.bookings.filter((b) => b.status === 'completed').length} completed)`);
    console.log(`   • Passport Entries: ${data.passportEntries.length} (verifiable SHA-256 chained blocks)`);
    console.log(`   • Free-Now Windows: ${data.availability.length}`);
    console.log(`   • Compass RateStats: ${data.rateStats.length}`);
    console.log(`   • Work Posts: ${data.posts.length}`);
    console.log(`   • Follows: ${data.follows.length}`);
    console.log(`   • Endorsements: ${data.endorsements.length}`);

    if (config.NODE_ENV === 'development') {
      console.log('\n🔑 Demo Accounts (Sample accounts, development mode only):');
      console.log('   • Demo Worker:   Ravi Kumar (Electrician)');
      console.log('   • Demo Customer: Meera Nair (Homeowner)');
      console.log('   • Fixed Dev OTP: 123456\n');
    }

    await disconnectDb();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed with error:', err.message);
    await disconnectDb();
    process.exit(1);
  }
}

runSeed();
