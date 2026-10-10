/**
 * Cryptography Utilities Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encrypt,
  decrypt,
  sha256Hex,
  sha256HexSync,
  constantTimeCompare,
  randomDigits,
  randomToken,
} from '../src/utils/crypto.js';

describe('Crypto Utilities', () => {
  const testKey = crypto.randomBytes(32).toString('base64');

  it('should encrypt and decrypt plaintext accurately via AES-256-GCM', () => {
    const secretCode = '8429';
    const ciphertext = encrypt(secretCode, testKey);

    assert.ok(ciphertext.startsWith('v1:'));
    assert.equal(ciphertext.split(':').length, 4);

    const decrypted = decrypt(ciphertext, testKey);
    assert.equal(decrypted, secretCode);
  });

  it('should fail and detect tampering on modified ciphertext', () => {
    const ciphertext = encrypt('1234', testKey);
    const parts = ciphertext.split(':');

    // Tamper with the ciphertext component
    const tamperedCt = parts[3] + 'A';
    const tamperedEncrypted = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCt}`;

    assert.throws(() => {
      decrypt(tamperedEncrypted, testKey);
    }, /Decryption failed/i);
  });

  it('should fail decryption when using wrong key', () => {
    const wrongKey = crypto.randomBytes(32).toString('base64');
    const ciphertext = encrypt('5678', testKey);

    assert.throws(() => {
      decrypt(ciphertext, wrongKey);
    }, /Decryption failed/i);
  });

  it('should compute identical SHA-256 hex sync and async', async () => {
    const input = 'WorkCred Ledger Genesis Block 2026';
    const asyncHash = await sha256Hex(input);
    const syncHash = sha256HexSync(input);

    assert.equal(asyncHash.length, 64);
    assert.equal(asyncHash, syncHash);
  });

  it('constantTimeCompare should match identical strings and reject differences safely', () => {
    assert.equal(constantTimeCompare('secret-token-123', 'secret-token-123'), true);
    assert.equal(constantTimeCompare('secret-token-123', 'secret-token-999'), false);
    assert.equal(constantTimeCompare('short', 'longer-string'), false);
    assert.equal(constantTimeCompare(null, 'secret'), false);
  });

  it('randomDigits should generate valid numeric strings of specified length', () => {
    for (let i = 0; i < 20; i++) {
      const code4 = randomDigits(4);
      assert.match(code4, /^\d{4}$/);

      const code6 = randomDigits(6);
      assert.match(code6, /^\d{6}$/);
    }
  });

  it('randomToken should generate url-safe random strings', () => {
    const token = randomToken(32);
    assert.ok(token.length > 30);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });
});
