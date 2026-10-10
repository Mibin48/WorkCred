/**
 * WorkCred Job Broadcast & Acceptance Integration Tests
 * Tests job posting, worker feed proximity, and concurrent race-free slot claiming.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { User } from '../src/models/User.js';
import { Job } from '../src/models/Job.js';
import { Booking } from '../src/models/Booking.js';

describe('Jobs Module & Slot Race Protection', () => {
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

  async function loginUser(phone = '9876543210', role = 'customer') {
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

      const updatePayload =
        role === 'customer'
          ? {
              name: `Customer ${phone.slice(-4)}`,
              area: 'Central',
              city: 'Bangalore',
              location: { lat: 12.9716, lng: 77.5946 },
            }
          : {
              name: `Worker ${phone.slice(-4)}`,
              skills: ['helper'],
              mainSkill: 'helper',
              rate: 500,
              rateUnit: 'day',
              area: 'Central',
              city: 'Bangalore',
              location: { lat: 12.9716, lng: 77.5946 },
              calendar: {
                monday: 'full',
                tuesday: 'full',
                wednesday: 'full',
                thursday: 'full',
                friday: 'full',
                saturday: 'full',
                sunday: 'full',
              },
            };

      await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatePayload),
      });
    }

    return {
      user: body.data.user,
      accessToken: token,
    };
  }

  it('POST /jobs allows customer to post job and lists in GET /jobs/mine', async () => {
    const customer = await loginUser('9800000001', 'customer');

    const futureDate = new Date(Date.now() + 2 * 3600000).toISOString();
    const createRes = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        title: 'Need 2 Helpers for Unloading',
        skill: 'helper',
        description: 'Clean boxes moving inside store',
        offeredRate: 600,
        rateUnit: 'day',
        workersNeeded: 2,
        hours: 6,
        scheduledAt: futureDate,
        lat: 12.9716,
        lng: 77.5946,
        area: 'Central',
        city: 'Bangalore',
      }),
    });

    assert.strictEqual(createRes.status, 200);
    const body = await createRes.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.job.workersNeeded, 2);
    assert.strictEqual(body.data.job.slotsFilled, 0);
    assert.strictEqual(body.data.job.status, 'open');

    // Check customer's jobs list
    const mineRes = await fetch(`${baseUrl}/jobs/mine`, {
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    const mineBody = await mineRes.json();
    assert.strictEqual(mineBody.data.jobs.length, 1);
    assert.strictEqual(mineBody.data.jobs[0].id, body.data.job.id);
  });

  it('Concurrent slot claiming: 5 workers accept a 2-slot job in parallel -> exactly 2 succeed, 3 fail with SLOTS_FULL', async () => {
    const customer = await loginUser('9800000002', 'customer');

    // Create job with 2 slots
    const futureDate = new Date(Date.now() + 3 * 3600000).toISOString();
    const createRes = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        title: 'Painting store front',
        skill: 'helper',
        offeredRate: 500,
        rateUnit: 'day',
        workersNeeded: 2,
        hours: 4,
        scheduledAt: futureDate,
        lat: 12.9716,
        lng: 77.5946,
      }),
    });
    const { data: { job } } = await createRes.json();

    // Create 5 workers
    const workers = [];
    for (let i = 1; i <= 5; i++) {
      const w = await loginUser(`980000001${i}`, 'worker');
      workers.push(w);
    }

    // Fire all 5 accept requests concurrently
    const acceptPromises = workers.map((w) =>
      fetch(`${baseUrl}/jobs/${job.id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${w.accessToken}`,
        },
      })
    );

    const responses = await Promise.all(acceptPromises);
    const bodies = await Promise.all(responses.map((r) => r.json()));

    const successful = bodies.filter((b) => b.success === true);
    const failed = bodies.filter((b) => b.success === false && (b.error?.code === 'JOB_FILLED' || b.error?.code === 'SLOTS_FULL'));

    assert.strictEqual(successful.length, 2, 'Exactly 2 workers must successfully claim slots');
    assert.strictEqual(failed.length, 3, 'Remaining 3 workers must receive JOB_FILLED error');

    // Check job state in database
    const updatedJob = await Job.findById(job.id);
    assert.strictEqual(updatedJob.slotsFilled, 2);
    assert.strictEqual(updatedJob.status, 'filled');

    // Check bookings created
    const createdBookings = await Booking.find({ jobId: job.id });
    assert.strictEqual(createdBookings.length, 2);
    for (const b of createdBookings) {
      assert.strictEqual(b.status, 'confirmed');
    }
  });

  it('POST /jobs/:id/cancel cascades cancellation to all attached confirmed bookings', async () => {
    const customer = await loginUser('9800000003', 'customer');
    const worker = await loginUser('9800000004', 'worker');

    const futureDate = new Date(Date.now() + 4 * 3600000).toISOString();
    const createRes = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
      body: JSON.stringify({
        title: 'Carpentry helper needed',
        skill: 'helper',
        offeredRate: 500,
        rateUnit: 'day',
        workersNeeded: 1,
        hours: 4,
        scheduledAt: futureDate,
        lat: 12.9716,
        lng: 77.5946,
      }),
    });
    const { data: { job } } = await createRes.json();

    // Worker accepts
    await fetch(`${baseUrl}/jobs/${job.id}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.accessToken}`,
      },
    });

    // Customer cancels job
    const cancelRes = await fetch(`${baseUrl}/jobs/${job.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customer.accessToken}`,
      },
    });
    assert.strictEqual(cancelRes.status, 200);

    // Verify job is cancelled
    const updatedJob = await Job.findById(job.id);
    assert.strictEqual(updatedJob.status, 'cancelled');

    // Verify booking is cancelled
    const booking = await Booking.findOne({ jobId: job.id });
    assert.strictEqual(booking.status, 'cancelled');
    assert.strictEqual(booking.cancellationReason, 'Job cancelled by customer.');
  });
});
