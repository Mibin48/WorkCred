/**
 * WorkCred Server Cryptography Utilities
 * AES-256-GCM encryption for booking handshake codes at rest.
 * Cryptographically secure random tokens and digits.
 * Constant-time comparison for secrets and verification codes.
 */

import crypto from 'node:crypto';
import { sha256Hex as sharedSha256Hex } from '../../../shared/hash.js';

/**
 * SHA-256 hash formatted as lowercase hex string.
 */
export async function sha256Hex(str) {
  return sharedSha256Hex(str);
}

/**
 * Synchronous SHA-256 hash using Node's crypto.
 */
export function sha256HexSync(str) {
  return crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
}

/**
 * Constant-time string comparison preventing timing attacks.
 */
export function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate cryptographically secure n-digit numeric string (e.g., OTP or Handshake code).
 */
export function randomDigits(n = 6) {
  if (n <= 0 || n > 12) {
    throw new Error('randomDigits length must be between 1 and 12.');
  }
  const min = Math.pow(10, n - 1);
  const max = Math.pow(10, n);
  const num = crypto.randomInt(min, max);
  return String(num);
}

/**
 * Generate cryptographically secure random url-safe token string.
 */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Parse and validate 32-byte AES key from base64 string or buffer.
 */
function getEncryptionKeyBuffer(keyInput) {
  const keyStr = keyInput || process.env.CODES_ENC_KEY;
  if (!keyStr) {
    throw new Error('CODES_ENC_KEY environment variable is not defined.');
  }
  const keyBuf = Buffer.isBuffer(keyStr) ? keyStr : Buffer.from(keyStr, 'base64');
  if (keyBuf.length !== 32) {
    throw new Error(`Invalid encryption key length: expected 32 bytes (256 bits), got ${keyBuf.length} bytes.`);
  }
  return keyBuf;
}

/**
 * AES-256-GCM Encrypt
 * Produces format: "v1:<iv-base64url>:<tag-base64url>:<ciphertext-base64url>"
 */
export function encrypt(plaintext, keyInput = null) {
  if (plaintext === null || plaintext === undefined) {
    return null;
  }
  const key = getEncryptionKeyBuffer(keyInput);
  const iv = crypto.randomBytes(12); // 96-bit standard GCM IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

/**
 * AES-256-GCM Decrypt
 * Verifies auth tag and rejects tampered ciphertext.
 */
export function decrypt(encryptedString, keyInput = null) {
  if (!encryptedString) {
    return null;
  }
  if (typeof encryptedString !== 'string') {
    throw new Error('Invalid encrypted input format: must be a string.');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid ciphertext format or unsupported version.');
  }

  const [, ivStr, tagStr, ctStr] = parts;
  const key = getEncryptionKeyBuffer(keyInput);
  const iv = Buffer.from(ivStr, 'base64url');
  const tag = Buffer.from(tagStr, 'base64url');
  const ciphertext = Buffer.from(ctStr, 'base64url');

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Invalid IV or auth tag length in ciphertext.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Decryption failed: integrity check failed or corrupted ciphertext/wrong key.');
  }
}
