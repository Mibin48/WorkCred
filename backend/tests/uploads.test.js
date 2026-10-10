/**
 * WorkCred Upload Signing & Image URL Validation Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { generateUploadSignature, validateOwnImageUrl, extractPublicIdFromUrl } from '../src/utils/cloudinary.js';

describe('Uploads & Image Security Module', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'workcred-cloud';
    process.env.CLOUDINARY_API_KEY = '123456789012345';
    process.env.CLOUDINARY_API_SECRET = 'secret_test_cloudinary_key_12345';

    await setupTestDb();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}/api/v1`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  async function loginUser(phone = '9876543210', role = 'worker') {
    await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: '123456' }),
    });

    const body = await verifyRes.json();
    const token = body.data.accessToken;

    if (role) {
      await fetch(`${baseUrl}/users/me/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
    }

    return {
      user: body.data.user,
      accessToken: token,
    };
  }

  describe('validateOwnImageUrl attack vector suite', () => {
    const userId = 'user-abc12345';
    const cloudName = 'workcred-cloud';

    it('accepts valid Cloudinary URLs with caller folder', () => {
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/v1728500000/workcred/${userId}/profile/photo.jpg`, userId, cloudName),
        true
      );
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/post/after_clean.png`, userId, cloudName),
        true
      );
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/image.webp`, userId, cloudName),
        true
      );
    });

    it('rejects URLs belonging to other users or other cloud names', () => {
      // Other user
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/other-user-999/profile/photo.jpg`, userId, cloudName),
        false
      );
      // Other cloud name
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/evil-cloud/image/upload/workcred/${userId}/photo.jpg`, userId, cloudName),
        false
      );
    });

    it('rejects HTTP protocol and userinfo attacks', () => {
      assert.strictEqual(
        validateOwnImageUrl(`http://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/photo.jpg`, userId, cloudName),
        false
      );
      assert.strictEqual(
        validateOwnImageUrl(`https://admin:pass@res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/photo.jpg`, userId, cloudName),
        false
      );
    });

    it('rejects domain spoofing, traversal, and encoded characters', () => {
      // Domain spoofing
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com.attacker.com/${cloudName}/image/upload/workcred/${userId}/photo.jpg`, userId, cloudName),
        false
      );
      // Path traversal
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/../victim/photo.jpg`, userId, cloudName),
        false
      );
      // Encoded slashes
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred%2f${userId}/photo.jpg`, userId, cloudName),
        false
      );
      // Query parameters
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/photo.jpg?malicious=1`, userId, cloudName),
        false
      );
      // Disallowed extensions
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/script.js`, userId, cloudName),
        false
      );
      assert.strictEqual(
        validateOwnImageUrl(`https://res.cloudinary.com/${cloudName}/image/upload/workcred/${userId}/file.svg`, userId, cloudName),
        false
      );
      // Data and JS URLs
      assert.strictEqual(
        validateOwnImageUrl(`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=`, userId, cloudName),
        false
      );
      assert.strictEqual(
        validateOwnImageUrl(`javascript:alert(1)`, userId, cloudName),
        false
      );
    });
  });

  describe('generateUploadSignature unit tests', () => {
    it('produces deterministic SHA-1 signature matching Cloudinary specification', () => {
      const fixedTimestamp = 1728500000;
      const params = {
        userId: 'user-unit-test',
        purpose: 'post',
        timestamp: fixedTimestamp,
        cloudName: 'test-cloud',
        apiKey: '111222333',
        apiSecret: 'my_api_secret_key',
      };

      const result = generateUploadSignature(params);

      // Expected sorted string: allowed_formats=jpg,png,webp&folder=workcred/user-unit-test/post&timestamp=1728500000my_api_secret_key
      const expectedStringToSign = `allowed_formats=jpg,png,webp&folder=workcred/user-unit-test/post&timestamp=1728500000my_api_secret_key`;
      const expectedSignature = crypto.createHash('sha1').update(expectedStringToSign).digest('hex');

      assert.strictEqual(result.signature, expectedSignature);
      assert.strictEqual(result.folder, 'workcred/user-unit-test/post');
      assert.strictEqual(result.allowedFormats, 'jpg,png,webp');
      assert.strictEqual(result.uploadUrl, 'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
      assert.strictEqual(result.apiKey, '111222333');
      // Secret must never appear in response
      assert.strictEqual(result.apiSecret, undefined);
    });
  });

  describe('POST /uploads/sign endpoint', () => {
    it('returns signed upload payload for authenticated user', async () => {
      const { user, accessToken } = await loginUser('9876500001', 'worker');

      const res = await fetch(`${baseUrl}/uploads/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ purpose: 'profile' }),
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.folder, `workcred/${user.id}/profile`);
      assert.ok(body.data.cloudName);
      assert.ok(body.data.signature);
      assert.strictEqual(body.data.apiSecret, undefined);
    });

    it('rejects invalid purpose', async () => {
      const { accessToken } = await loginUser('9876500002', 'worker');

      const res = await fetch(`${baseUrl}/uploads/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ purpose: 'invalid_purpose' }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    });
  });
});
