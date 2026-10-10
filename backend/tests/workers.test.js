/**
 * WorkCred Worker Search & Discovery Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Availability } from '../src/models/Availability.js';
import { PassportEntry } from '../src/models/PassportEntry.js';
import { clock } from '../src/utils/clock.js';

describe('Workers Discovery & Search Module', () => {
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

  async function loginUser(phone = '9876543210') {
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
    return {
      user: body.data.user,
      accessToken: body.data.accessToken,
    };
  }

  it('GET /workers returns workers with 2dsphere proximity, filters, sorting and privacy projection', async () => {
    // Seed 2 workers and 1 customer
    const w1 = await User.create({
      phone: '9876500001',
      name: 'Ramesh Kumar',
      role: 'worker',
      profileComplete: true,
      skills: ['helper', 'electrician'],
      mainSkill: 'electrician',
      rate: 400,
      rateUnit: 'day',
      rating: 4.8,
      jobsCompleted: 15,
      location: { type: 'Point', coordinates: [77.5946, 12.9716] }, // MG Road Bangalore
      area: 'MG Road',
      city: 'Bangalore',
    });

    const w2 = await User.create({
      phone: '9876500002',
      name: 'Suresh Patel',
      role: 'worker',
      profileComplete: true,
      skills: ['plumber'],
      mainSkill: 'plumber',
      rate: 600,
      rateUnit: 'day',
      rating: 4.2,
      jobsCompleted: 5,
      location: { type: 'Point', coordinates: [77.6412, 12.9784] }, // Indiranagar Bangalore (~5km away)
      area: 'Indiranagar',
      city: 'Bangalore',
    });

    // Inactive worker should be excluded
    await User.create({
      phone: '9876500003',
      name: 'Inactive Worker',
      role: 'worker',
      profileComplete: true,
      isActive: false,
      skills: ['helper'],
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    // Worker with incomplete profile should be excluded
    await User.create({
      phone: '9876500004',
      name: 'Incomplete Worker',
      role: 'worker',
      profileComplete: false,
      skills: ['helper'],
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    const customer = await loginUser('9876599999');
    await User.findByIdAndUpdate(customer.user.id, { role: 'customer', profileComplete: true });

    // 1. Unauthenticated or authenticated search near MG Road
    const res = await fetch(`${baseUrl}/workers?lat=12.9716&lng=77.5946&radiusKm=10`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.workers.length, 2);
    // Closest first
    assert.strictEqual(body.data.workers[0].id, w1.id);
    assert.strictEqual(body.data.workers[0].name, 'Ramesh Kumar');
    assert.strictEqual(body.data.workers[0].phone, undefined); // Privacy: phone never leaked
    assert.strictEqual(body.data.workers[0].location, undefined); // Privacy: exact coords never leaked
    assert.ok(body.data.workers[0].distanceKm !== undefined);

    // 2. Filter by skill
    const skillRes = await fetch(`${baseUrl}/workers?skills=plumber`);
    const skillBody = await skillRes.json();
    assert.strictEqual(skillBody.data.workers.length, 1);
    assert.strictEqual(skillBody.data.workers[0].id, w2.id);

    // 3. Filter by minRate / maxRate (hourly normalized: 400/8 = 50, 600/8 = 75)
    const rateRes = await fetch(`${baseUrl}/workers?minRate=60&maxRate=80`);
    const rateBody = await rateRes.json();
    assert.strictEqual(rateBody.data.workers.length, 1);
    assert.strictEqual(rateBody.data.workers[0].id, w2.id);

    // 4. Sort by rating
    const sortRes = await fetch(`${baseUrl}/workers?sortBy=rating`);
    const sortBody = await sortRes.json();
    assert.strictEqual(sortBody.data.workers[0].id, w1.id); // 4.8 > 4.2
  });

  it('GET /workers/:id returns worker profile with masked passport and calendar', async () => {
    const worker = await User.create({
      phone: '9876500005',
      name: 'Gopal Verma',
      role: 'worker',
      profileComplete: true,
      skills: ['carpenter'],
      mainSkill: 'carpenter',
      rate: 700,
      rateUnit: 'day',
      rating: 4.9,
      jobsCompleted: 10,
      totalHoursWorked: 80,
      calendar: { monday: 'full', tuesday: 'off' },
      blockedDates: ['2026-10-15'],
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    });

    const employer = await User.create({
      phone: '9876500006',
      name: 'Rohan Khanna',
      role: 'customer',
      profileComplete: true,
    });

    await PassportEntry.create({
      bookingId: 'booking-test-123',
      workerId: worker._id,
      seq: 1,
      prevHash: 'genesis',
      hash: 'abc123hash',
      fields: {
        bookingId: 'booking-test-123',
        workerId: worker._id,
        customerId: employer._id,
        skill: 'carpenter',
        hoursWorked: 8,
        amountPaid: 700,
        rating: 5,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
      customerNameMasked: 'R*** K.',
    });

    const res = await fetch(`${baseUrl}/workers/${worker.id}`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.worker.name, 'Gopal Verma');
    assert.strictEqual(body.data.worker.phone, undefined); // Phone omitted
    assert.strictEqual(body.data.worker.totalHoursWorked, 80);
    assert.strictEqual(body.data.worker.passportEntries.length, 1);
    assert.strictEqual(body.data.worker.passportEntries[0].customerNameMasked, 'R*** K.');
    assert.strictEqual(body.data.worker.calendar.tuesday, 'off');
    assert.deepStrictEqual(body.data.worker.blockedDates, ['2026-10-15']);
  });
});
