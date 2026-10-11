#!/usr/bin/env node
/**
 * WorkCred Local HTTPS Guidance Tool
 * Detects mkcert and prints instructions for generating trusted local certificates.
 * Never downloads or executes external installers automatically.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '192.168.1.100';
}

function checkMkcert() {
  const isWin = process.platform === 'win32';
  const checkCmd = isWin ? 'where' : 'which';
  const res = spawnSync(checkCmd, ['mkcert'], { encoding: 'utf8', shell: true });
  return res.status === 0;
}

const hasMkcert = checkMkcert();
const lanIp = getLanIp();

console.log('\n🔒 WorkCred Local HTTPS Configuration Guide');
console.log('═'.repeat(66));

if (hasMkcert) {
  console.log('✅ mkcert was detected on your system PATH.\n');
} else {
  console.log('ℹ️  mkcert is not currently installed on your PATH.');
  console.log('   You can install it via:');
  console.log('     • Windows (Chocolatey): choco install mkcert');
  console.log('     • Windows (Scoop):      scoop install mkcert');
  console.log('     • macOS (Homebrew):     brew install mkcert');
  console.log('     • Linux:                Follow https://github.com/FiloSottile/mkcert\n');
}

console.log('Step 1: Install the local Root Certificate Authority (CA):');
console.log('  mkcert -install\n');

console.log('Step 2: Generate certificates for localhost, 127.0.0.1, and your LAN IP:');
console.log(`  mkcert -key-file certs/local-key.pem -cert-file certs/local-cert.pem localhost 127.0.0.1 ${lanIp}\n`);

console.log('Step 3: Configure your environment variables in backend/.env:');
console.log('  TLS_CERT_FILE=../certs/local-cert.pem');
console.log('  TLS_KEY_FILE=../certs/local-key.pem\n');

console.log('Step 4: Running on Android / Mobile over Wi-Fi:');
console.log('  1. Find mkcert CA root path: run `mkcert -CAROOT`');
console.log('  2. Send `rootCA.pem` to your Android device (via USB, email, or local transfer).');
console.log('  3. In Android Settings -> Security & Privacy -> More Security Settings');
console.log('     -> Encryption & Credentials -> Install a Certificate -> CA Certificate.');
console.log('  4. Select rootCA.pem to trust your development certificate authority.');
console.log('  Why needed: Modern mobile browsers strictly enforce valid trust chains');
console.log('  for Progressive Web App (PWA) features, camera, and geolocation.\n');

console.log('═'.repeat(66) + '\n');
