#!/usr/bin/env node
/**
 * WorkCred Database Backup Export Tool
 * Exports collections to compressed NDJSON with integrity manifest.
 * Zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { config, parseMongoUri } from '../../src/config/env.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { models } from '../../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

async function exportDatabase() {
  const args = process.argv.slice(2);
  let outDir = null;
  const outIdx = args.indexOf('--out');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outDir = path.resolve(process.cwd(), args[outIdx + 1]);
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    outDir = path.resolve(rootDir, 'backups', timestamp);
  }

  const allowOverwrite = args.includes('--overwrite');

  if (fs.existsSync(outDir)) {
    if (!allowOverwrite) {
      console.error(`❌ Export failed: Target directory already exists: ${outDir}`);
      console.error('   Pass --overwrite to overwrite existing export.\n');
      process.exit(1);
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const parsed = parseMongoUri(config.MONGODB_URI);
  console.log(`\n📦 WorkCred Database Export`);
  console.log(`   Host:     ${parsed.maskedHost}`);
  console.log(`   Database: ${parsed.dbName}`);
  console.log(`   Output:   ${outDir}\n`);

  await connectDb(config.MONGODB_URI);

  const manifest = {
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    database: parsed.dbName,
    maskedHost: parsed.maskedHost,
    counts: {},
  };

  try {
    for (const [name, model] of Object.entries(models)) {
      const colName = model.collection.name;
      const count = await model.countDocuments();
      manifest.counts[colName] = count;

      const filePath = path.join(outDir, `${colName}.ndjson.gz`);
      const fileStream = fs.createWriteStream(filePath);
      const gzip = zlib.createGzip();
      gzip.pipe(fileStream);

      console.log(`   Exporting ${colName.padEnd(20)} (${count} documents)...`);

      const cursor = model.find({}).lean().cursor();
      for await (const doc of cursor) {
        gzip.write(JSON.stringify(doc) + '\n');
      }

      await new Promise((resolve, reject) => {
        gzip.end(() => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
        });
      });
    }

    const manifestPath = path.join(outDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`\n✅ Database export completed successfully.`);
    console.log(`   Manifest saved to: ${manifestPath}`);
    console.log(`   Total collections: ${Object.keys(manifest.counts).length}\n`);

    await disconnectDb();
    process.exit(0);
  } catch (err) {
    console.error(`❌ Export failed: ${err.message}`);
    await disconnectDb();
    process.exit(1);
  }
}

exportDatabase();
