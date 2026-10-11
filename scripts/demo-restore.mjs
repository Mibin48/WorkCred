#!/usr/bin/env node
/**
 * WorkCred Demo Restore CLI
 * Restores baseline snapshot from backups/demo-baseline/ with host confirmation.
 */

import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, parseMongoUri } from '../backend/src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

const restoreScript = path.join(rootDir, 'backend/scripts/backup/restore.mjs');
const sourceDir = path.join(rootDir, 'backups/demo-baseline');

const args = process.argv.slice(2);
const hasYes = args.includes('--yes');

const parsed = parseMongoUri(config.MONGODB_URI);

console.log(`\n🔄 WorkCred Demo Snapshot Restore`);
console.log(`   Host:     ${parsed.maskedHost}`);
console.log(`   Database: ${parsed.dbName}`);
console.log(`   Source:   ${sourceDir}\n`);

async function run() {
  if (!hasYes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((res) => {
      rl.question(`⚠️  This will overwrite all records in '${parsed.dbName}'. Proceed? [y/N]: `, res);
    });
    rl.close();

    if (!answer || answer.trim().toLowerCase() !== 'y') {
      console.log('Restore cancelled.\n');
      process.exit(0);
    }
  }

  const result = spawnSync(
    process.execPath,
    [restoreScript, '--in', sourceDir, '--yes', '--i-understand-this-overwrites'],
    {
      stdio: 'inherit',
      cwd: rootDir,
    }
  );

  process.exit(result.status ?? 0);
}

run();
