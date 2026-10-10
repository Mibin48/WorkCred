/**
 * WorkCred Work Posts Module Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Booking } from '../src/models/Booking.js';
import { Post } from '../src/models/Post.js';
import { destroyCloudinaryAsset } from '../src/utils/cloudinary.js';

describe('Work Posts Module', () => {
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

  async function loginUser(phone = '9876543210', role = 'worker', profileComplete = true) {
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

    if (profileComplete) {
      await User.findByIdAndUpdate(userId, {
        name: 'Worker Name',
        skills: ['electrician', 'helper'],
        mainSkill: 'electrician',
        rate: 600,
        rateUnit: 'day',
        area: 'Kothrud',
        city: 'Pune',
        profileComplete: true,
      });
    }

    return {
      userId,
      accessToken: token,
    };
  }

  it('POST /posts creates work post with valid Cloudinary image and caption', async () => {
    const { userId, accessToken } = await loginUser('9876500010', 'worker', true);

    const validAfterUrl = `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${userId}/post/after_job.jpg`;
    const validBeforeUrl = `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${userId}/post/before_job.jpg`;

    const res = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        skill: 'electrician',
        caption: 'Completed residential rewiring and main fuse box upgrade.',
        afterUrl: validAfterUrl,
        beforeUrl: validBeforeUrl,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.post.skill, 'electrician');
    assert.strictEqual(body.data.post.workerId, userId);
    assert.strictEqual(body.data.post.verifiedJob, false);
    assert.strictEqual(body.data.post.afterUrl, validAfterUrl);
    assert.strictEqual(body.data.post.beforeUrl, validBeforeUrl);
  });

  it('POST /posts rejects foreign image URLs or URLs containing phones/links in caption', async () => {
    const { userId, accessToken } = await loginUser('9876500011', 'worker', true);

    // 1. Foreign user folder
    const foreignUrl = `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/foreign-user-id/post/after.jpg`;
    const res1 = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        skill: 'electrician',
        caption: 'Clean wiring installation done.',
        afterUrl: foreignUrl,
      }),
    });
    assert.strictEqual(res1.status, 400);
    const body1 = await res1.json();
    assert.strictEqual(body1.error.code, 'IMAGE_NOT_ALLOWED');

    // 2. Caption containing phone number
    const validAfterUrl = `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${userId}/post/after.jpg`;
    const res2 = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        skill: 'electrician',
        caption: 'Call me at 9876543210 for best plumbing service in area',
        afterUrl: validAfterUrl,
      }),
    });
    assert.strictEqual(res2.status, 400);
    const body2 = await res2.json();
    assert.strictEqual(body2.error.code, 'VALIDATION_ERROR');
    assert.ok(body2.error.message.includes('phone numbers or links'));
  });

  it('POST /posts with linked completed booking sets verifiedJob: true and blocks duplicate linking', async () => {
    const { userId, accessToken } = await loginUser('9876500012', 'worker', true);
    const customer = await loginUser('9876500013', 'customer', true);

    // Create completed booking
    const booking = await Booking.create({
      customerId: customer.userId,
      workerId: userId,
      skill: 'electrician',
      status: 'completed',
      rate: 700,
      rateUnit: 'day',
      agreedRate: 700,
      hours: 4,
      amountPaid: 350,
      paidCash: true,
      startCodeEnc: 'enc_start',
      finishCodeEnc: 'enc_finish',
    });

    const validAfterUrl = `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${userId}/post/after.jpg`;

    const res = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        skill: 'electrician',
        caption: 'Installed inverter connection for home backup.',
        afterUrl: validAfterUrl,
        bookingId: booking.id,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.data.post.verifiedJob, true);
    assert.strictEqual(body.data.post.bookingId, booking.id);

    // Attempting to link the same booking a second time returns 409
    const res2 = await fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        skill: 'electrician',
        caption: 'Second post attempting to reuse same booking.',
        afterUrl: validAfterUrl,
        bookingId: booking.id,
      }),
    });

    assert.strictEqual(res2.status, 409);
    const body2 = await res2.json();
    assert.strictEqual(body2.error.code, 'VALIDATION_ERROR');
  });

  it('GET /posts/mine returns own posts with cursor pagination and DELETE /posts/:id deletes post', async () => {
    const { userId, accessToken } = await loginUser('9876500014', 'worker', true);
    const otherWorker = await loginUser('9876500015', 'worker', true);

    const validUrl = `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${userId}/post/after.jpg`;

    // Seed 2 posts
    const p1 = await Post.create({
      workerId: userId,
      workerName: 'Worker Name',
      workerArea: 'Kothrud',
      skill: 'electrician',
      caption: 'First post in history',
      afterUrl: validUrl,
      createdAt: new Date(Date.now() - 3600000),
    });

    const p2 = await Post.create({
      workerId: userId,
      workerName: 'Worker Name',
      workerArea: 'Kothrud',
      skill: 'electrician',
      caption: 'Second post newest',
      afterUrl: validUrl,
      createdAt: new Date(Date.now()),
    });

    // 1. GET /posts/mine
    const res = await fetch(`${baseUrl}/posts/mine`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.posts.length, 2);
    assert.strictEqual(body.data.posts[0].id, p2.id); // Newest first

    // 2. Non-owner DELETE gets 404
    const resDeleteOther = await fetch(`${baseUrl}/posts/${p1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${otherWorker.accessToken}` },
    });
    assert.strictEqual(resDeleteOther.status, 403);

    // 3. Owner DELETE succeeds
    const resDelete = await fetch(`${baseUrl}/posts/${p1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(resDelete.status, 200);

    const deleted = await Post.findById(p1.id);
    assert.strictEqual(deleted, null);
  });
});
