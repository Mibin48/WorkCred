#!/usr/bin/env node
/**
 * WorkCred Demo Reset CLI
 * Re-seeds sample data with confirmation and masked host safeguard.
 */

import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, parseMongoUri } from '../backend/src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

const seedScript = path.join(rootDir, 'backend/src/seed/index.js');
const args = process.argv.slice(2);
const hasYes = args.includes('--yes');

const parsed = parseMongoUri(config.MONGODB_URI);

console.log(`\n🌱 WorkCred Demo Reset`);
console.log(`   Host:     ${parsed.maskedHost}`);
console.log(`   Database: ${parsed.dbName}\n`);

async function run() {
  if (!hasYes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((res) => {
      rl.question(`⚠️  This will reset sample records in '${parsed.dbName}'. Proceed? [y/N]: `, res);
    });
    rl.close();

    if (!answer || answer.trim().toLowerCase() !== 'y') {
      console.log('Reset cancelled.\n');
      process.exit(0);
    }
  }

  const result = spawnSync(process.execPath, [seedScript, '--reset', '--yes'], {
    stdio: 'inherit',
    cwd: rootDir,
  });

  process.exit(result.status ?? 0);
}

run();
