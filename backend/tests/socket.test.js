/**
 * WorkCred Socket.io Realtime Integration Tests
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { setupTestDb, teardownTestDb, clearTestDb } from './helper.js';
import { initSocketServer, closeSocketServer } from '../src/realtime/socket.js';
import { realtimeEmitter } from '../src/realtime/events.js';
import { EVENT_NAMES } from '../../shared/constants.js';
import { localityKey } from '../../shared/geo.js';
import { User } from '../src/models/User.js';

describe('Socket.io Realtime Server', () => {
  let server;
  let baseUrl;
  let socketUrl;

  before(async () => {
    await setupTestDb();
    server = http.createServer(app);
    initSocketServer(server, { appOrigin: 'http://localhost:3000' });
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;
    socketUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await closeSocketServer();
    await new Promise((resolve) => server.close(resolve));
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  async function loginUser(phone = '9876543210', role = 'worker', skills = ['electrician']) {
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
      name: 'Socket User',
      skills,
      mainSkill: skills[0] || 'helper',
      profileComplete: true,
    });

    return {
      userId,
      accessToken: token,
    };
  }

  function createClient(token) {
    return ioClient(socketUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      autoConnect: true,
    });
  }

  it('rejects connection without token or with invalid token', async () => {
    const socket = ioClient(socketUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: 'invalid_token_format' },
    });

    await new Promise((resolve) => {
      socket.on('connect_error', (err) => {
        assert.ok(err.message.includes('token'));
        socket.close();
        resolve();
      });
    });
  });

  it('authenticates valid connection and joins user room', async () => {
    const { accessToken } = await loginUser('9876500050', 'worker');
    const client = createClient(accessToken);

    await new Promise((resolve, reject) => {
      client.on('connect', () => {
        assert.ok(client.id);
        client.close();
        resolve();
      });
      client.on('connect_error', reject);
    });
  });

  it('area:join computes rooms on server and handles role-separated broadcasts', async () => {
    const worker = await loginUser('9876500051', 'worker', ['electrician']);
    const customer = await loginUser('9876500052', 'customer');

    const workerClient = createClient(worker.accessToken);
    const customerClient = createClient(customer.accessToken);

    await Promise.all([
      new Promise((res) => workerClient.on('connect', res)),
      new Promise((res) => customerClient.on('connect', res)),
    ]);

    // Join Shivajinagar area (18.5204, 73.8567)
    await Promise.all([
      new Promise((res) => {
        workerClient.emit('area:join', { lat: 18.5204, lng: 73.8567, radiusKm: 3 }, (ack) => {
          assert.strictEqual(ack.ok, true);
          assert.ok(ack.cells > 0);
          res();
        });
      }),
      new Promise((res) => {
        customerClient.emit('area:join', { lat: 18.5204, lng: 73.8567, radiusKm: 3 }, (ack) => {
          assert.strictEqual(ack.ok, true);
          assert.ok(ack.cells > 0);
          res();
        });
      }),
    ]);

    const targetCell = localityKey(18.5204, 73.8567);

    // 1. Broadcast job:new -> Only worker should receive
    const jobPromise = new Promise((resolve) => {
      workerClient.on(EVENT_NAMES.JOB_NEW, (data) => {
        assert.strictEqual(data.job.skill, 'electrician');
        resolve();
      });
    });

    let customerGotJob = false;
    customerClient.on(EVENT_NAMES.JOB_NEW, () => {
      customerGotJob = true;
    });

    realtimeEmitter.emit(
      EVENT_NAMES.JOB_NEW,
      { job: { id: 'job-socket-1', title: 'Need Electrician', skill: 'electrician', rate: 700, rateUnit: 'day' } },
      { areaKeys: [targetCell] }
    );

    await jobPromise;
    assert.strictEqual(customerGotJob, false, 'Customer must not receive worker job notifications.');

    // 2. Broadcast radar:worker_free -> Only customer should receive
    const radarPromise = new Promise((resolve) => {
      customerClient.on(EVENT_NAMES.WORKER_FREE, (data) => {
        assert.strictEqual(data.workerId, worker.userId);
        resolve();
      });
    });

    realtimeEmitter.emit(
      EVENT_NAMES.WORKER_FREE,
      { workerId: worker.userId, availability: { id: 'avail-1', workerId: worker.userId, skill: 'electrician' } },
      { areaKeys: [targetCell] }
    );

    await radarPromise;

    // 3. Targeted user event: booking:request -> Only target worker receives
    const bookingPromise = new Promise((resolve) => {
      workerClient.on(EVENT_NAMES.BOOKING_REQUEST, (data) => {
        assert.strictEqual(data.booking.workerId, worker.userId);
        resolve();
      });
    });

    realtimeEmitter.emit(
      EVENT_NAMES.BOOKING_REQUEST,
      { booking: { id: 'b-sock-1', customerId: customer.userId, workerId: worker.userId, skill: 'electrician' } },
      { userIds: [worker.userId] }
    );

    await bookingPromise;

    workerClient.close();
    customerClient.close();
  });

  it('auth:refresh accepts token for same user and disconnects on user mismatch', async () => {
    const u1 = await loginUser('9876500053', 'worker');
    const u2 = await loginUser('9876500054', 'worker');

    const client = createClient(u1.accessToken);
    await new Promise((res) => client.on('connect', res));

    // Valid refresh
    const ack1 = await new Promise((res) => {
      client.emit('auth:refresh', { token: u1.accessToken }, res);
    });
    assert.strictEqual(ack1.ok, true);

    // Mismatched user token disconnects socket
    const disconnectPromise = new Promise((res) => client.on('disconnect', res));
    client.emit('auth:refresh', { token: u2.accessToken });
    await disconnectPromise;
  });
});
