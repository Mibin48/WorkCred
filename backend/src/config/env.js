/**
 * WorkCred Environment Variable Loader & Strict Validator
 * Validates configuration at startup and fails fast with actionable errors.
 * Never prints secret values to console or logs.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isRunningTests =
  process.env.NODE_ENV === 'test' ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.execArgv.some((a) => a.includes('test')) ||
  process.argv.some((a) => a.includes('test') || a.includes('.test.'));

if (isRunningTests && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

/**
 * Extract database name and masked host safely from MongoDB URI.
 */
export function parseMongoUri(uriString) {
  if (!uriString || typeof uriString !== 'string') {
    return { valid: false, error: 'MONGODB_URI is required and must be a string.' };
  }

  try {
    // Normalise mongodb / mongodb+srv protocol for WHATWG URL parser
    const normalized = uriString.replace(/^mongodb(\+srv)?:\/\//, 'http://');
    const url = new URL(normalized);
    const dbName = url.pathname ? url.pathname.replace(/^\//, '').split('?')[0] : '';

    if (!dbName || dbName.trim().length === 0) {
      return {
        valid: false,
        error: 'MONGODB_URI is missing a database name (e.g. ".../workcred?retryWrites=true"). Without an explicit database name, the MongoDB driver will silently default to the "test" database.',
      };
    }

    const host = url.host || 'unknown-host';
    const maskedHost = host.replace(/.*@/, ''); // Strip credentials if any remain in host

    return {
      valid: true,
      protocol: uriString.startsWith('mongodb+srv://') ? 'mongodb+srv' : 'mongodb',
      dbName,
      maskedHost,
    };
  } catch (err) {
    return {
      valid: false,
      error: `MONGODB_URI is not a valid MongoDB connection string: ${err.message}`,
    };
  }
}

export function validateEnv(env = process.env) {
  const errors = [];

  const NODE_ENV = env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(NODE_ENV)) {
    errors.push(`NODE_ENV must be one of 'development', 'production', or 'test'. Got: '${NODE_ENV}'`);
  }

  const isProduction = NODE_ENV === 'production';
  const isTest = NODE_ENV === 'test';

  if (isTest) {
    if (!env.JWT_ACCESS_SECRET) env.JWT_ACCESS_SECRET = 'test_jwt_access_secret_at_least_32_characters_12345';
    if (!env.JWT_REFRESH_SECRET) env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_at_least_32_characters_12345';
    if (!env.CODES_ENC_KEY) env.CODES_ENC_KEY = Buffer.alloc(32, 'a').toString('base64');
  }

  const PORT = parseInt(env.PORT || '4000', 10);
  if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    errors.push(`PORT must be an integer between 1 and 65535. Got: '${env.PORT}'`);
  }

  // MongoDB URI validation (In tests, MONGODB_URI might not be set if memory server is used)
  const mongoUri = env.MONGODB_URI;
  if (!mongoUri && !isTest) {
    errors.push('MONGODB_URI is required.');
  } else if (mongoUri) {
    const mongoParsed = parseMongoUri(mongoUri);
    if (!mongoParsed.valid) {
      errors.push(mongoParsed.error);
    }
  }

  // TEST_MONGODB_URI validation (optional, but if provided must end with '_test')
  if (env.TEST_MONGODB_URI) {
    const testParsed = parseMongoUri(env.TEST_MONGODB_URI);
    if (!testParsed.valid) {
      errors.push(`TEST_MONGODB_URI: ${testParsed.error}`);
    } else if (!testParsed.dbName.endsWith('_test')) {
      errors.push(`TEST_MONGODB_URI database name must end with '_test' (got '${testParsed.dbName}'). Tests will never run against production or development databases.`);
    }
  }

  // Secrets length & complexity
  const jwtAccess = env.JWT_ACCESS_SECRET;
  if (!jwtAccess || jwtAccess.length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters long.');
  }

  const jwtRefresh = env.JWT_REFRESH_SECRET;
  if (!jwtRefresh || jwtRefresh.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters long.');
  }

  const encKey = env.CODES_ENC_KEY;
  if (!encKey) {
    errors.push('CODES_ENC_KEY (32-byte base64 string) is required.');
  } else {
    try {
      const keyBuf = Buffer.from(encKey, 'base64');
      if (keyBuf.length !== 32) {
        errors.push(`CODES_ENC_KEY must decode to exactly 32 bytes (256 bits). Got ${keyBuf.length} bytes.`);
      }
    } catch {
      errors.push('CODES_ENC_KEY must be a valid base64 string.');
    }
  }

  // OTP Configuration
  const otpMode = env.OTP_MODE || 'dev';
  if (!['dev', 'sms'].includes(otpMode)) {
    errors.push(`OTP_MODE must be 'dev' or 'sms'. Got: '${otpMode}'`);
  }

  if (isProduction && otpMode === 'dev') {
    errors.push('CRITICAL: OTP_MODE cannot be set to "dev" in production environment.');
  }

  if (isProduction) {
    if (jwtAccess && jwtAccess.includes('replace_with')) {
      errors.push('CRITICAL: Default placeholder detected in JWT_ACCESS_SECRET for production.');
    }
    if (jwtRefresh && jwtRefresh.includes('replace_with')) {
      errors.push('CRITICAL: Default placeholder detected in JWT_REFRESH_SECRET for production.');
    }
    if (encKey && encKey.includes('replace_with')) {
      errors.push('CRITICAL: Default placeholder detected in CODES_ENC_KEY for production.');
    }
  }

  // Parse allowed origins (supports comma-separated list)
  let rawOrigins = env.APP_ORIGIN;
  let parsedOrigins = [];
  if (rawOrigins && typeof rawOrigins === 'string') {
    parsedOrigins = rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);
  }

  if (parsedOrigins.length === 0) {
    if (isProduction) {
      errors.push('APP_ORIGIN is required in production.');
    } else {
      parsedOrigins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
    }
  }

  const primaryOrigin = parsedOrigins[0] || `http://localhost:${PORT}`;
  const appOriginString = parsedOrigins.join(',');

  return {
    valid: errors.length === 0,
    errors,
    config: {
      NODE_ENV,
      PORT,
      APP_ORIGIN: appOriginString,
      APP_ORIGINS: parsedOrigins,
      PRIMARY_APP_ORIGIN: primaryOrigin,
      MONGODB_URI: mongoUri,
      TEST_MONGODB_URI: env.TEST_MONGODB_URI,
      JWT_ACCESS_SECRET: jwtAccess,
      JWT_REFRESH_SECRET: jwtRefresh,
      CODES_ENC_KEY: encKey,
      OTP_MODE: otpMode,
      OTP_DEV_CODE: env.OTP_DEV_CODE || '123456',
      SMS_PROVIDER: env.SMS_PROVIDER || 'placeholder',
      SMS_API_KEY: env.SMS_API_KEY || 'placeholder',
      CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME || 'placeholder',
      CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY || 'placeholder',
      CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET || 'placeholder',
      LOG_LEVEL: env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
      TRUST_PROXY: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    },
  };
}

const validation = validateEnv();
if (!validation.valid && process.env.NODE_ENV !== 'test') {
  console.error('\n❌ WorkCred Server Startup Failed - Invalid Environment Configuration:');
  for (const err of validation.errors) {
    console.error(`   • ${err}`);
  }
  console.error('\nPlease check backend/.env against backend/.env.example and re-run.\n');
  process.exit(1);
}

export const config = validation.config;
