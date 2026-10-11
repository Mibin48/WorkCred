#!/usr/bin/env node
/**
 * WorkCred Demo Snapshot CLI
 * Exports baseline sample data to backups/demo-baseline/
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

const exportScript = path.join(rootDir, 'backend/scripts/backup/export.mjs');
const targetDir = path.join(rootDir, 'backups/demo-baseline');

console.log('📸 Creating WorkCred Demo Baseline Snapshot...');
const result = spawnSync(process.execPath, [exportScript, '--out', targetDir, '--overwrite'], {
  stdio: 'inherit',
  cwd: rootDir,
});

process.exit(result.status ?? 0);
