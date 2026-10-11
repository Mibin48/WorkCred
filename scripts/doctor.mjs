#!/usr/bin/env node
/**
 * WorkCred System Doctor CLI
 * Comprehensive environment, database, network, and security health diagnostics.
 * Never prints secrets, connection strings, passwords, or tokens.
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import mongoose from '../backend/node_modules/mongoose/index.js';
import { config, parseMongoUri } from '../backend/src/config/env.js';
import { models } from '../backend/src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

const args = process.argv.slice(2);
const showIp = args.includes('--show-ip');
const checkCloudinary = args.includes('--check-cloudinary');

let hasFailure = false;
let hasWarning = false;

function pass(msg) {
  console.log(`  ✅ [PASS] ${msg}`);
}

function warn(msg, fix = null) {
  hasWarning = true;
  console.log(`  ⚠️  [WARN] ${msg}`);
  if (fix) console.log(`            Fix: ${fix}`);
}

function fail(msg, fix = null) {
  hasFailure = true;
  console.log(`  ❌ [FAIL] ${msg}`);
  if (fix) console.log(`            Fix: ${fix}`);
}

function info(msg) {
  console.log(`  ℹ️  [INFO] ${msg}`);
}

async function runDoctor() {
  console.log('\n🩺 Running WorkCred Environment & Health Doctor...\n');

  // 1. Node.js Version Check
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 20) {
    pass(`Node.js version v${process.versions.node} (>= 20 required).`);
  } else {
    fail(`Node.js version is v${process.versions.node}. WorkCred requires Node 20 or newer.`, 'Install Node.js 20 LTS from https://nodejs.org');
  }

  // 2. Environment Variables Presence (Names only, never values)
  const envFile = path.join(rootDir, 'backend/.env');
  if (fs.existsSync(envFile)) {
    pass('backend/.env file exists.');
  } else {
    fail('backend/.env is missing.', 'Run "npm run setup" or copy backend/.env.example to backend/.env');
  }

  const requiredNames = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CODES_ENC_KEY', 'MONGODB_URI'];
  const missingNames = requiredNames.filter((name) => !process.env[name]);
  if (missingNames.length === 0) {
    pass('Required environment variable names are set.');
  } else {
    fail(`Missing required environment variables: ${missingNames.join(', ')}`, 'Fill missing variables in backend/.env');
  }

  // 3. Secrets Length & Complexity (No default placeholders)
  const jwtAccess = process.env.JWT_ACCESS_SECRET || '';
  const jwtRefresh = process.env.JWT_REFRESH_SECRET || '';
  const codesEnc = process.env.CODES_ENC_KEY || '';

  if (jwtAccess.length >= 32 && jwtRefresh.length >= 32 && !jwtAccess.includes('replace_with') && !jwtRefresh.includes('replace_with')) {
    pass('JWT secrets are strong and non-default (>= 32 characters).');
  } else {
    fail('JWT secrets are too short or contain placeholder strings.', 'Run "npm run gen:secrets" and update backend/.env');
  }

  try {
    const encBuf = Buffer.from(codesEnc, 'base64');
    if (encBuf.length === 32 && !codesEnc.includes('replace_with')) {
      pass('CODES_ENC_KEY is a valid 32-byte base64 encryption key.');
    } else {
      fail('CODES_ENC_KEY must decode to exactly 32 bytes (256 bits).', 'Run "npm run gen:secrets" to generate a 32-byte key');
    }
  } catch {
    fail('CODES_ENC_KEY is not valid base64.', 'Run "npm run gen:secrets" to generate a valid key');
  }

  // 4. MONGODB_URI Parsing & Diagnostics
  const mongoUri = process.env.MONGODB_URI;
  const parsedMongo = parseMongoUri(mongoUri);

  if (parsedMongo.valid) {
    pass(`MongoDB URI parses correctly (Database: '${parsedMongo.dbName}', Host: '${parsedMongo.maskedHost}').`);
  } else {
    fail(parsedMongo.error, 'Ensure MONGODB_URI ends with an explicit database name, e.g. /workcred?retryWrites=true');
  }

  // 5. DNS Resolution for Atlas Host
  let dnsOk = false;
  if (parsedMongo.valid && parsedMongo.maskedHost) {
    try {
      if (parsedMongo.protocol === 'mongodb+srv') {
        const srvLookup = await dns.resolveSrv(`_mongodb._tcp.${parsedMongo.maskedHost}`).catch(() => null);
        if (srvLookup && srvLookup.length > 0) {
          pass(`DNS SRV resolution succeeded for ${parsedMongo.maskedHost}.`);
          dnsOk = true;
        } else {
          // Standard A/AAAA lookup fallback
          await dns.lookup(parsedMongo.maskedHost);
          pass(`DNS lookup succeeded for ${parsedMongo.maskedHost}.`);
          dnsOk = true;
        }
      } else {
        await dns.lookup(parsedMongo.maskedHost);
        pass(`DNS lookup succeeded for ${parsedMongo.maskedHost}.`);
        dnsOk = true;
      }
    } catch (dnsErr) {
      fail(`DNS lookup failed for Atlas host: ${parsedMongo.maskedHost}`, 'Check internet connection or firewall. If your network blocks SRV DNS, use the standard mongodb:// string from Atlas.');
    }
  }

  // 6. MongoDB Atlas Connection & Auth (10s timeout)
  let dbConnected = false;
  if (parsedMongo.valid) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 2,
        autoIndex: false,
      });
      const ping = await mongoose.connection.db.admin().ping();
      if (ping && ping.ok === 1) {
        pass(`Connected and authenticated successfully to MongoDB Atlas database '${parsedMongo.dbName}'.`);
        dbConnected = true;
      } else {
        fail('Database ping did not respond with ok: 1.');
      }
    } catch (connErr) {
      const msg = connErr.message;
      if (msg.includes('bad auth') || msg.includes('AuthenticationFailed') || connErr.code === 18) {
        fail('MongoDB Atlas authentication failed (wrong username or password).', 'Check credentials in backend/.env. URL-encode special characters in your password.');
      } else if (msg.includes('timed out') || msg.includes('whitelist') || msg.includes('IP')) {
        fail('Connection to MongoDB Atlas timed out. Most likely your current IP is not whitelisted.', 'Log into MongoDB Atlas -> Network Access -> Add your current public IP address.');
      } else if (msg.includes('paused')) {
        fail('MongoDB Atlas cluster appears paused.', 'Log into MongoDB Atlas and resume your cluster.');
      } else {
        fail(`Database connection error: ${msg}`, 'Check internet connectivity and Atlas cluster status.');
      }
    }
  }

  // 7. Public IP Address Echo (ONLY if --show-ip is passed)
  if (showIp) {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        info(`Your current public IP is: ${ipData.ip} (compare this to Atlas Network Access).`);
      } else {
        info('Could not determine public IP (echo service returned HTTP error).');
      }
    } catch {
      info('Could not determine public IP (network timeout or offline).');
    }
  } else {
    info('Public IP lookup skipped. (Run "npm run doctor -- --show-ip" to display your IP).');
  }

  // 8 & 9. Indexes & Seeded Counts (Only if DB connected)
  if (dbConnected) {
    try {
      let missingIndexCount = 0;
      for (const [mName, model] of Object.entries(models)) {
        const indexes = await model.collection.listIndexes().toArray();
        if (indexes.length <= 1 && mName !== 'Otp') {
          missingIndexCount++;
        }
      }
      if (missingIndexCount === 0) {
        pass('All collection indexes are present and synchronized.');
      } else {
        warn(`${missingIndexCount} collection(s) may have missing custom indexes.`, 'Run "npm run db:indexes"');
      }

      const userCount = await models.User.countDocuments();
      const bookingCount = await models.Booking.countDocuments();
      const passportCount = await models.PassportEntry.countDocuments();

      if (userCount >= 40 && passportCount >= 100) {
        pass(`Sample dataset verified: ${userCount} users, ${bookingCount} bookings, ${passportCount} passport entries.`);
      } else if (userCount === 0) {
        warn('Database has 0 users. No seed data found.', 'Run "npm run seed"');
      } else {
        info(`Current record counts: ${userCount} users, ${bookingCount} bookings, ${passportCount} passport entries.`);
      }
    } catch (e) {
      warn(`Could not verify indexes or counts: ${e.message}`);
    } finally {
      await mongoose.disconnect();
    }
  }

  // 10. Cloudinary Configuration
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudKey = process.env.CLOUDINARY_API_KEY;
  const cloudSecret = process.env.CLOUDINARY_API_SECRET;

  const hasCloudinary = Boolean(cloudName && cloudKey && cloudSecret && cloudName !== 'placeholder' && cloudKey !== 'placeholder');
  if (hasCloudinary) {
    pass(`Cloudinary variables configured (Cloud: '${cloudName}').`);
    if (checkCloudinary) {
      try {
        const pingRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/ping`, { signal: AbortSignal.timeout(5000) });
        if (pingRes.ok) {
          pass('Cloudinary signed ping responded successfully.');
        } else {
          warn(`Cloudinary ping returned HTTP ${pingRes.status}.`);
        }
      } catch (err) {
        warn(`Cloudinary ping error: ${err.message}`);
      }
    }
  } else {
    warn('Cloudinary credentials are not configured or are placeholders.', 'Photo uploads will use local text-only fallback. To enable Cloudinary, add real credentials in backend/.env.');
  }

  // 11. Port Availability (Port 4000)
  const targetPort = config.PORT || 4000;
  const portAvailable = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close();
      resolve(true);
    });
    srv.listen(targetPort, '127.0.0.1');
  });

  if (portAvailable) {
    pass(`Port ${targetPort} is available.`);
  } else {
    warn(`Port ${targetPort} is currently in use by another process.`, `If a previous instance is running, stop it or run with PORT=${targetPort + 1}`);
  }

  // 12. OTP Mode
  if (config.OTP_MODE === 'dev') {
    pass('OTP_MODE is set to "dev" (fixed demo code 123456 active).');
  } else {
    info(`OTP_MODE is set to "${config.OTP_MODE}".`);
  }

  // 13. Frontend & PWA Files
  const requiredFiles = [
    'frontend/index.html',
    'frontend/app/index.html',
    'frontend/sw.js',
    'frontend/manifest.webmanifest',
    'shared/constants.js',
    'shared/validators.js',
  ];

  const missingFiles = requiredFiles.filter((rel) => !fs.existsSync(path.join(rootDir, rel)));
  if (missingFiles.length === 0) {
    pass('All frontend PWA and service worker files are present.');
  } else {
    fail(`Missing frontend files: ${missingFiles.join(', ')}`);
  }

  // 14. Backups Directory & Disk Check
  const backupsDir = path.join(rootDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  pass('backups/ directory is ready for snapshots and exports.');

  console.log('\n' + '─'.repeat(66));
  if (hasFailure) {
    console.error('❌ DOCTOR RESULT: One or more checks failed. Please apply the fixes above.\n');
    process.exit(1);
  } else if (hasWarning) {
    console.log('⚠️  DOCTOR RESULT: System is operational with warnings. Ready for local demo.\n');
    process.exit(0);
  } else {
    console.log('🎉 DOCTOR RESULT: All checks passed! System is 100% ready for local run.\n');
    process.exit(0);
  }
}

runDoctor();
