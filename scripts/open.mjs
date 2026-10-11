#!/usr/bin/env node
/**
 * Cross-platform Browser Opener
 * Opens the WorkCred app in the default system browser.
 * Zero external dependencies.
 */

import { spawn } from 'node:child_process';
import { config } from '../backend/src/config/env.js';

const port = config.PORT || 4000;
const url = process.argv[2] || `http://localhost:${port}/app`;

const platform = process.platform;
let cmd = '';
let args = [];

if (platform === 'win32') {
  cmd = 'cmd.exe';
  args = ['/c', 'start', '""', url];
} else if (platform === 'darwin') {
  cmd = 'open';
  args = [url];
} else {
  cmd = 'xdg-open';
  args = [url];
}

console.log(`🌐 Opening ${url} in your default browser...`);
const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
child.unref();
process.exit(0);
