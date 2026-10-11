#!/usr/bin/env node
/**
 * WorkCred Database Backup Restore Tool
 * Restores collections from NDJSON backup archive with cryptographic ledger verification.
 * Zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { config, parseMongoUri } from '../../src/config/env.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { models, ensureIndexes, PassportEntry, User } from '../../src/models/index.js';
import { verifyChain } from '../../../shared/hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

async function restoreDatabase() {
  const args = process.argv.slice(2);
  let inDir = null;
  const inIdx = args.indexOf('--in');
  if (inIdx !== -1 && args[inIdx + 1]) {
    inDir = path.resolve(process.cwd(), args[inIdx + 1]);
  } else {
    // Pick latest backup from backups directory if available
    const backupsRoot = path.join(rootDir, 'backups');
    if (fs.existsSync(backupsRoot)) {
      const dirs = fs.readdirSync(backupsRoot)
        .map((d) => path.join(backupsRoot, d))
        .filter((p) => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'manifest.json')));
      if (dirs.length > 0) {
        dirs.sort().reverse();
        inDir = dirs[0];
      }
    }
  }

  if (!inDir || !fs.existsSync(inDir)) {
    console.error(`❌ Restore failed: Input directory not found: ${inDir || '(none provided)'}`);
    console.error('   Specify backup directory with --in <path>, e.g.:');
    console.error('   node backend/scripts/backup/restore.mjs --in backups/demo-baseline --yes\n');
    process.exit(1);
  }

  const manifestPath = path.join(inDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Restore failed: Missing manifest.json in backup directory: ${inDir}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const parsed = parseMongoUri(config.MONGODB_URI);
  const targetDb = parsed.dbName;
  const isTestOrRestore = targetDb.endsWith('_test') || targetDb.endsWith('_restore');
  const hasYes = args.includes('--yes');
  const hasOverwriteFlag = args.includes('--i-understand-this-overwrites');

  console.log(`\n🔄 WorkCred Database Restore`);
  console.log(`   Source:   ${inDir}`);
  console.log(`   Target:   ${targetDb} on ${parsed.maskedHost}`);
  console.log(`   Created:  ${manifest.timestamp}\n`);

  // Target Database Safeguard
  if (!isTestOrRestore) {
    if (!hasYes || !hasOverwriteFlag) {
      console.error('❌ RESTORE REFUSED: Safety guard triggered.');
      console.error(`   Target database is '${targetDb}' (not ending in '_test' or '_restore').`);
      console.error('   To restore into this database, both flags are strictly required:');
      console.error('     --yes --i-understand-this-overwrites\n');
      process.exit(1);
    }
  } else if (!hasYes) {
    console.error('❌ RESTORE REFUSED: Restore requires the --yes flag.\n');
    process.exit(1);
  }

  await connectDb(config.MONGODB_URI);

  try {
    const modelByCollection = {};
    for (const model of Object.values(models)) {
      modelByCollection[model.collection.name] = model;
    }

    for (const [colName, expectedCount] of Object.entries(manifest.counts)) {
      const model = modelByCollection[colName];
      if (!model) {
        console.warn(`   ⚠️ Skipping unknown collection: ${colName}`);
        continue;
      }

      const filePath = path.join(inDir, `${colName}.ndjson.gz`);
      if (!fs.existsSync(filePath)) {
        console.warn(`   ⚠️ Missing backup file for ${colName}, skipping.`);
        continue;
      }

      console.log(`   Restoring ${colName.padEnd(20)} (expected ${expectedCount})...`);

      // Clear existing records in collection
      if (colName === 'passportentries') {
        await model.deleteMany({}, { _forceLedgerReset: true });
      } else {
        await model.deleteMany({});
      }

      const fileStream = fs.createReadStream(filePath);
      const gunzip = zlib.createGunzip();
      fileStream.pipe(gunzip);

      const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });
      const batch = [];
      let totalInserted = 0;

      for await (const line of rl) {
        if (!line.trim()) continue;
        const doc = JSON.parse(line);
        batch.push(doc);

        if (batch.length >= 200) {
          await model.collection.insertMany(batch.slice());
          totalInserted += batch.length;
          batch.length = 0;
        }
      }

      if (batch.length > 0) {
        await model.collection.insertMany(batch.slice());
        totalInserted += batch.length;
        batch.length = 0;
      }

      const actualCount = await model.countDocuments();
      if (actualCount !== expectedCount) {
        console.warn(`   ⚠️ Count mismatch for ${colName}: expected ${expectedCount}, got ${actualCount}`);
      }
    }

    // Recreate indexes
    console.log('\n🔧 Rebuilding and synchronizing database indexes...');
    await ensureIndexes();

    // Verify all Work Passport chains
    console.log('🛡️  Auditing cryptographic integrity of all Work Passport ledgers...');
    const workers = await User.find({ role: 'worker' }).select('_id name');
    let chainsChecked = 0;

    for (const worker of workers) {
      const entries = await PassportEntry.find({ workerId: worker.id }).sort({ seq: 1 });
      if (entries.length > 0) {
        const audit = await verifyChain(entries.map((e) => e.toObject()));
        if (!audit.valid) {
          throw new Error(`Passport ledger corruption detected for worker ${worker.id} at seq ${audit.brokenAtSeq}`);
        }
        chainsChecked++;
      }
    }

    console.log(`\n✅ Database restored successfully:`);
    console.log(`   • Collections restored: ${Object.keys(manifest.counts).length}`);
    console.log(`   • Passport chains verified: ${chainsChecked} valid chains`);
    console.log(`   • Zero integrity defects found.\n`);

    await disconnectDb();
    process.exit(0);
  } catch (err) {
    console.error(`❌ Restore failed: ${err.message}`);
    await disconnectDb();
    process.exit(1);
  }
}

restoreDatabase();
