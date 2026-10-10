/**
 * WorkCred Step 13 Realtime Socket.io Verification Script
 * Validates socket connections, area room joins, and event delivery across roles.
 * 
 * Usage: node scripts/e2e-realtime.mjs --yes
 */

import { io as ioClient } from 'socket.io-client';

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const SOCKET_BASE = process.env.SOCKET_BASE || 'http://localhost:4000';

const args = process.argv.slice(2);
const hasYesFlag = args.includes('--yes');

if (!hasYesFlag) {
  console.error('❌ E2E ABORTED: Realtime verification requires the --yes flag.');
  console.error('   Usage: node scripts/e2e-realtime.mjs --yes');
  process.exit(1);
}

let passedSteps = 0;
let totalSteps = 0;

function reportStep(stepName, success, detail = '') {
  totalSteps++;
  if (success) {
    passedSteps++;
    console.log(`  [PASS] ${stepName}${detail ? ' - ' + detail : ''}`);
  } else {
    console.error(`  [FAIL] ${stepName}${detail ? ' - ' + detail : ''}`);
  }
}

async function login(phone) {
  await fetch(`${API_BASE}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  const res = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });

  const body = await res.json();
  if (!body.success) {
    throw new Error(`Login failed for ${phone}: ${body.error?.message}`);
  }
  return { user: body.data.user, token: body.data.accessToken };
}

function connectSocket(token) {
  return ioClient(SOCKET_BASE, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
  });
}

async function run() {
  console.log('\n⚡ Starting WorkCred Step 13 Socket.io Realtime Verification...');
  console.log(`   Socket Endpoint: ${SOCKET_BASE}/socket.io\n`);

  try {
    // 1. Login demo worker and customer
    const worker = await login('9000000001');
    const customer = await login('9000000002');
    reportStep('1. Login Demo Accounts', true);

    // 2. Connect Sockets
    const workerSocket = connectSocket(worker.token);
    const customerSocket = connectSocket(customer.token);

    await Promise.all([
      new Promise((res, rej) => {
        workerSocket.on('connect', res);
        workerSocket.on('connect_error', rej);
      }),
      new Promise((res, rej) => {
        customerSocket.on('connect', res);
        customerSocket.on('connect_error', rej);
      }),
    ]);
    reportStep('2. Socket.io Handshake & Auth', true, `Worker: ${workerSocket.id}, Customer: ${customerSocket.id}`);

    // 3. Join Shivajinagar Area (18.5204, 73.8567)
    const joinWorker = await new Promise((res) => {
      workerSocket.emit('area:join', { lat: 18.5204, lng: 73.8567, radiusKm: 5 }, res);
    });
    const joinCustomer = await new Promise((res) => {
      customerSocket.emit('area:join', { lat: 18.5204, lng: 73.8567, radiusKm: 5 }, res);
    });

    reportStep('3. Area Room Subscriptions', joinWorker.ok && joinCustomer.ok, `Joined ${joinWorker.cells} cells`);

    // 4. Test Free-Now State Change & Realtime Event Delivery
    const eventPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for radar:worker_free')), 5000);
      customerSocket.on('radar:worker_free', (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    // Trigger Free Now via REST
    const freeRes = await fetch(`${API_BASE}/availability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${worker.token}`,
      },
      body: JSON.stringify({ hours: 4, lat: 18.5204, lng: 73.8567 }),
    });
    const freeBody = await freeRes.json();

    const receivedPayload = await eventPromise;
    reportStep('4. Realtime Free-Now Event Delivery', receivedPayload.workerId === worker.user.id, `Worker ${receivedPayload.workerId}`);

    // Cleanup
    workerSocket.close();
    customerSocket.close();

    console.log(`\n📊 Verification Summary: ${passedSteps}/${totalSteps} Steps Passed.`);
    if (passedSteps === totalSteps) {
      console.log('🎉 Step 13 Realtime E2E Suite Passed Successfully!\n');
      process.exit(0);
    } else {
      console.error('❌ Some realtime steps failed.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Fatal error during Realtime execution:', err.message);
    process.exit(1);
  }
}

run();
