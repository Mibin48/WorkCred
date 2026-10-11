#!/usr/bin/env node
/**
 * WorkCred One-Command Setup Script
 * Automates initial project setup, dependencies, environment scaffolding, and health audit.
 * Safe to run repeatedly.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

console.log('\n🚀 Starting WorkCred Local Setup...\n');

// 1. Check Node.js Version (>= 20)
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 20) {
  console.error(`❌ Node.js version is v${process.versions.node}. WorkCred requires Node 20 or newer.`);
  console.error('   Please install Node 20 LTS from https://nodejs.org and re-run.\n');
  process.exit(1);
}
console.log(`✅ Node.js v${process.versions.node} detected.`);

// 2. Install Root Dependencies if node_modules missing
const rootModules = path.join(rootDir, 'node_modules');
if (!fs.existsSync(rootModules)) {
  console.log('📦 Installing root dependencies (npm install)...');
  const res = spawnSync('npm', ['install'], { cwd: rootDir, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error('❌ Root dependency installation failed.');
    process.exit(1);
  }
} else {
  console.log('✅ Root dependencies already installed.');
}

// 3. Install Backend Dependencies if backend/node_modules missing
const backendModules = path.join(rootDir, 'backend/node_modules');
if (!fs.existsSync(backendModules)) {
  console.log('📦 Installing backend dependencies (npm --prefix backend install)...');
  const res = spawnSync('npm', ['--prefix', 'backend', 'install'], { cwd: rootDir, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error('❌ Backend dependency installation failed.');
    process.exit(1);
  }
} else {
  console.log('✅ Backend dependencies already installed.');
}

// 4. Create backend/.env from .env.example ONLY if missing
const envPath = path.join(rootDir, 'backend/.env');
const envExamplePath = path.join(rootDir, 'backend/.env.example');

if (!fs.existsSync(envPath)) {
  console.log('📄 Creating backend/.env from template with generated cryptographic secrets...');
  let template = fs.readFileSync(envExamplePath, 'utf8');

  const accessSecret = crypto.randomBytes(32).toString('hex');
  const refreshSecret = crypto.randomBytes(32).toString('hex');
  const encKey = crypto.randomBytes(32).toString('base64');

  template = template.replace(
    /JWT_ACCESS_SECRET=.*/,
    `JWT_ACCESS_SECRET=${accessSecret}`
  );
  template = template.replace(
    /JWT_REFRESH_SECRET=.*/,
    `JWT_REFRESH_SECRET=${refreshSecret}`
  );
  template = template.replace(
    /CODES_ENC_KEY=.*/,
    `CODES_ENC_KEY=${encKey}`
  );

  fs.writeFileSync(envPath, template, 'utf8');
  console.log('✅ Created backend/.env with fresh secrets.');
  console.log('   ⚠️ Please open backend/.env and set your MongoDB Atlas connection string (MONGODB_URI).\n');
} else {
  console.log('✅ backend/.env already exists (will not overwrite).');
}

// 5. Ensure gitignored folders exist
const dirsToEnsure = [
  path.join(rootDir, 'backups'),
  path.join(rootDir, 'logs'),
  path.join(rootDir, 'backups/demo-baseline'),
];

for (const d of dirsToEnsure) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}
console.log('✅ Verified directories (backups, logs).');

// 6. Run Doctor
console.log('\n🩺 Running system doctor to audit configuration...\n');
const doctorScript = path.join(rootDir, 'scripts/doctor.mjs');
const doctorRes = spawnSync(process.execPath, [doctorScript], { cwd: rootDir, stdio: 'inherit' });

if (doctorRes.status !== 0) {
  console.log('⚠️ Setup completed with pending doctor items. Please check messages above.\n');
} else {
  console.log('🎉 Setup complete! Run "npm start" to launch WorkCred.\n');
}
process.exit(0);
