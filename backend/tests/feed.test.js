/**
 * WorkCred Activity Feed Module Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Job } from '../src/models/Job.js';
import { Post } from '../src/models/Post.js';
import { Availability } from '../src/models/Availability.js';
import { Follow } from '../src/models/Follow.js';

const FORBIDDEN_KEYS = new Set([
  'phone',
  'coordinates',
  'localityKey',
  'startCode',
  'finishCode',
  'startCodeEnc',
  'finishCodeEnc',
  'hash',
  'prevHash',
  'email',
]);

function assertNoForbiddenKeys(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoForbiddenKeys(item, `${path}[${idx}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${k}` : k;
    assert.ok(
      !FORBIDDEN_KEYS.has(k),
      `Privacy violation: forbidden key '${k}' found at '${currentPath}' in public feed response.`
    );
    assertNoForbiddenKeys(v, currentPath);
  }
}

describe('Activity Feed Module', () => {
  let server;
  let baseUrl;

  before(async () => {
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

  async function loginUser(phone = '9876543210', role = 'worker', loc = { lat: 18.5204, lng: 73.8567 }) {
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
      name: role === 'worker' ? 'Worker Test' : 'Customer Test',
      skills: ['electrician', 'helper'],
      mainSkill: 'electrician',
      rate: 700,
      rateUnit: 'day',
      area: 'Shivajinagar',
      city: 'Pune',
      location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      profileComplete: true,
    });

    return {
      userId,
      accessToken: token,
    };
  }

  it('GET /feed returns role-specific items and passes privacy scanner', async () => {
    const worker = await loginUser('9876500040', 'worker', { lat: 18.5204, lng: 73.8567 });
    const customer = await loginUser('9876500041', 'customer', { lat: 18.5204, lng: 73.8567 });

    // Seed Open Job near Shivajinagar
    await Job.create({
      customerId: customer.userId,
      title: 'Electrician needed for office wiring',
      skill: 'electrician',
      area: 'Shivajinagar',
      status: 'open',
      slotsLeft: 1,
      scheduledAt: new Date(Date.now() + 86400000),
      location: { type: 'Point', coordinates: [73.8567, 18.5204] },
      rate: 800,
      createdAt: new Date(Date.now() - 10000),
    });

    // Seed Free-Now worker near Shivajinagar
    await Availability.create({
      workerId: worker.userId,
      skill: 'electrician',
      hours: 4,
      rate: 700,
      rateUnit: 'day',
      active: true,
      expiresAt: new Date(Date.now() + 4 * 3600000),
      startsAt: new Date(Date.now() - 5000),
      location: { type: 'Point', coordinates: [73.8567, 18.5204] },
    });

    // Seed Post
    await Post.create({
      workerId: worker.userId,
      workerName: 'Worker Test',
      workerArea: 'Shivajinagar',
      skill: 'electrician',
      caption: 'Completed safe distribution board installation.',
      afterUrl: `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${worker.userId}/post/after.jpg`,
      location: { type: 'Point', coordinates: [73.8567, 18.5204] },
      createdAt: new Date(Date.now() - 2000),
    });

    // 1. Worker Feed: includes open_job and post
    const wRes = await fetch(`${baseUrl}/feed`, {
      headers: { Authorization: `Bearer ${worker.accessToken}` },
    });
    assert.strictEqual(wRes.status, 200);
    const wBody = await wRes.json();
    assert.strictEqual(wBody.success, true);
    const wTypes = wBody.data.feed.map((i) => i.type);
    assert.ok(wTypes.includes('open_job'));
    assert.ok(wTypes.includes('post'));
    assert.ok(!wTypes.includes('free_now')); // Workers don't see free_now
    assertNoForbiddenKeys(wBody.data);

    // 2. Customer Feed: includes free_now and post
    const cRes = await fetch(`${baseUrl}/feed`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    assert.strictEqual(cRes.status, 200);
    const cBody = await cRes.json();
    assert.strictEqual(cBody.success, true);
    const cTypes = cBody.data.feed.map((i) => i.type);
    assert.ok(cTypes.includes('free_now'));
    assert.ok(cTypes.includes('post'));
    assert.ok(!cTypes.includes('open_job')); // Customers don't see open_job
    assertNoForbiddenKeys(cBody.data);
  });

  it('GET /feed includes followed workers posts regardless of distance', async () => {
    const customer = await loginUser('9876500042', 'customer', { lat: 18.5204, lng: 73.8567 }); // Pune
    const farWorker = await loginUser('9876500043', 'worker', { lat: 19.0760, lng: 72.8777 }); // Mumbai (~120km away)

    // Follow far worker
    await Follow.create({
      fromUserId: customer.userId,
      toUserId: farWorker.userId,
      type: 'follow',
    });

    // Far worker posts work
    const farPost = await Post.create({
      workerId: farWorker.userId,
      workerName: 'Far Worker',
      workerArea: 'Mumbai',
      skill: 'electrician',
      caption: 'Commercial substation work done in Mumbai.',
      afterUrl: `https://res.cloudinary.com/workcred-cloud/image/upload/workcred/${farWorker.userId}/post/after.jpg`,
      location: { type: 'Point', coordinates: [72.8777, 19.0760] },
      createdAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/feed?radiusKm=5`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    const postIds = body.data.feed.map((i) => i.id);
    assert.ok(postIds.includes(farPost.id), 'Followed worker post should appear in feed despite distance.');
    assert.strictEqual(body.data.feed[0].item.isFollowing, true);
  });
});
