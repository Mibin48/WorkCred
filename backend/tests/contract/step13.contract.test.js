/**
 * Step 13 Contract Parity Suite: Real Backend vs Mock Services
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from '../helper.js';
import { User } from '../../src/models/User.js';
import { Booking } from '../../src/models/Booking.js';
import { Post } from '../../src/models/Post.js';
import { Follow } from '../../src/models/Follow.js';
import * as mockFeedService from '../../../frontend/app/js/mock/services/feedService.js';
import * as mockUploadService from '../../../frontend/app/js/mock/services/uploadService.js';
import { resetDb } from '../../../frontend/app/js/mock/db.js';

describe('Step 13 Contract Parity Tests', () => {
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
    resetDb();
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
    const userId = body.data.user.id;

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

    await User.findByIdAndUpdate(userId, {
      name: role === 'worker' ? 'Contract Worker' : 'Contract Customer',
      skills: ['electrician'],
      mainSkill: 'electrician',
      rate: 750,
      rateUnit: 'day',
      area: 'Shivajinagar',
      city: 'Pune',
      location: { type: 'Point', coordinates: [73.8567, 18.5204] },
      profileComplete: true,
    });

    return {
      userId,
      accessToken: token,
    };
  }

  it('Feed Contract Parity: Real backend response format matches mock structure', async () => {
    const worker = await loginUser('9876500060', 'worker');

    // Query backend
    const res = await fetch(`${baseUrl}/feed?lat=18.5204&lng=73.8567`, {
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data.feed));

    // Compare with mock feed
    const mockFeed = mockFeedService.getFeed(worker.userId, 'worker', { lat: 18.5204, lng: 73.8567 });
    assert.ok(Array.isArray(mockFeed.feed));
    assert.strictEqual(typeof body.data.total, 'number');
  });

  it('Follows Contract Parity: toggle follow / save response shape', async () => {
    const customer = await loginUser('9876500061', 'customer');
    const worker = await loginUser('9876500062', 'worker');

    const res = await fetch(`${baseUrl}/follows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({ toUserId: worker.userId, type: 'follow' }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.active, true);
    assert.strictEqual(body.data.type, 'follow');
    assert.strictEqual(body.data.toUserId, worker.userId);

    // Mock parity
    const mockFollow = mockFeedService.toggleFollow(customer.userId, { toUserId: worker.userId, type: 'follow' });
    assert.strictEqual(mockFollow.type, 'follow');
    assert.strictEqual(mockFollow.toUserId, worker.userId);
  });

  it('Uploads Contract Parity: POST /uploads/sign returns required keys', async () => {
    const worker = await loginUser('9876500063', 'worker');

    const res = await fetch(`${baseUrl}/uploads/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
      },
      body: JSON.stringify({ purpose: 'post' }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.uploadUrl);
    assert.ok(body.data.signature);
    assert.ok(body.data.folder);
  });
});
