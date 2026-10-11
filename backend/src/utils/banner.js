/**
 * WorkCred Startup Banner & Network Utilities
 * Development-only formatted console banner and LAN IP detection.
 * Never logs secrets, passwords, tokens, or raw URIs.
 */

import os from 'node:os';
import { parseMongoUri } from '../config/env.js';
import { isDbConnected } from '../config/db.js';
import { User, Booking, PassportEntry } from '../models/index.js';

/**
 * Discovers the active local network IPv4 address.
 * @returns {string|null}
 */
export function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * Prints the development startup banner.
 * @param {object} options
 * @param {object} options.config
 * @param {boolean} options.isLanMode
 * @param {boolean} options.isHttps
 */
export async function printStartupBanner({ config, isLanMode, isHttps = false }) {
  const protocol = isHttps ? 'https' : 'http';
  const port = config.PORT;
  const lanIp = isLanMode ? getLanIp() : null;

  const mongoParsed = parseMongoUri(config.MONGODB_URI);
  const dbConnected = isDbConnected();

  let countsStr = 'Connecting / Retrying in background...';
  if (dbConnected) {
    try {
      const [uCount, bCount, pCount] = await Promise.all([
        User.countDocuments({ isSample: true }),
        Booking.countDocuments({ isSample: true }),
        PassportEntry.countDocuments({ isSample: true }),
      ]);
      countsStr = `Users: ${uCount} | Bookings: ${bCount} | Passport Entries: ${pCount}`;
    } catch {
      countsStr = 'Database connected';
    }
  }

  const hasCloudinary = Boolean(
    config.CLOUDINARY_CLOUD_NAME &&
    config.CLOUDINARY_CLOUD_NAME !== 'placeholder' &&
    config.CLOUDINARY_API_KEY &&
    config.CLOUDINARY_API_KEY !== 'placeholder'
  );

  const sep = '═'.repeat(66);
  console.log(`\n╔${sep}╗`);
  console.log(`║  ★  WorkCred — Proof of work, work near you. (v1.0.0)             ║`);
  console.log(`║     Mobile-first PWA for verified daily work & hiring            ║`);
  console.log(`╠${sep}╣`);
  console.log(`║  Mode:             ${(config.NODE_ENV + (isHttps ? ' (HTTPS)' : '') + (isLanMode ? ' (LAN)' : '')).padEnd(46)}║`);
  console.log(`║  Local App URL:    ${`${protocol}://localhost:${port}/app`.padEnd(46)}║`);
  console.log(`║  Loopback URL:     ${`${protocol}://127.0.0.1:${port}/app`.padEnd(46)}║`);
  if (isLanMode && lanIp) {
    console.log(`║  LAN App URL:      ${`${protocol}://${lanIp}:${port}/app`.padEnd(46)}║`);
  }
  console.log(`║  Public Passport:  ${`${protocol}://localhost:${port}/p/ravi-kumar-pune-842`.padEnd(46)}║`);
  console.log(`║  Offline Demo URL: ${`${protocol}://localhost:${port}/app?mock=1`.padEnd(46)}║`);
  console.log(`╠${sep}╣`);
  console.log(`║  Database:         ${`${mongoParsed.dbName || 'workcred'} (${mongoParsed.maskedHost || 'Atlas'})`.padEnd(46)}║`);
  console.log(`║  Status:           ${(dbConnected ? '✅ Connected' : '⚠️  Unreachable (Retrying every 30s)').padEnd(46)}║`);
  console.log(`║  Seeded Records:   ${countsStr.padEnd(46)}║`);
  console.log(`║  SMS Mode:         ${'dev (code 123456 below)'.padEnd(46)}║`);
  console.log(`║  Cloudinary:       ${(hasCloudinary ? 'Configured (Live signed uploads)' : 'Not configured (Local text-only demo)').padEnd(46)}║`);
  console.log(`╠${sep}╣`);
  console.log(`║  DEMO ACCOUNTS (Sample accounts, development mode only):          ║`);
  console.log(`║  • Worker:   Phone: 9000000001 (Ravi Kumar - Electrician)         ║`);
  console.log(`║  • Customer: Phone: 9000000002 (Meera Nair - Homeowner)           ║`);
  console.log(`║  • Fixed Dev OTP: 123456                                          ║`);
  console.log(`╠${sep}╣`);
  console.log(`║  Diagnostics: Run "npm run doctor" to audit environment & cluster ║`);
  console.log(`╚${sep}╝\n`);

  if (isLanMode) {
    console.warn('⚠️  SECURITY WARNING: LAN MODE ACTIVE (0.0.0.0)');
    console.warn('   Anyone on your local Wi-Fi network can access WorkCred and authenticate');
    console.warn('   using the public demo OTP code (123456). Run this only on trusted private networks.\n');
  }
}
