/**
 * WorkCred Phase B Full E2E Integration Verification Script
 * Validates the complete user journey against the live server:
 * 1. Health & Readiness checks
 * 2. Static PWA shell & CSP delivery
 * 3. Worker login (OTP) & profile verification
 * 4. Customer login (OTP) & profile verification
 * 5. Customer searches workers in Pune cluster (cursor pagination)
 * 6. Customer creates a booking (Idempotency-Key enforcement)
 * 7. Customer views booking & receives encrypted start code
 * 8. Worker accepts / confirms booking
 * 9. Worker starts booking with 4-digit startCode handshake
 * 10. Customer finishes booking with 4-digit finishCode handshake & ratings
 * 11. Cryptographic ledger block verification on Work Passport
 * 12. Public Work Passport retrieval & SHA-256 chain verification
 * 13. Free-Now radar activation, retrieval, and deactivation
 * 14. Fair rate Compass stats query
 * 
 * Usage: node scripts/e2e-integration.mjs --yes
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const API_BASE = `${BASE_URL}/api/v1`;

const args = process.argv.slice(2);
const hasYesFlag = args.includes('--yes');

if (!hasYesFlag) {
  console.error('❌ E2E ABORTED: Integration verification requires the --yes flag.');
  console.error('   Usage: node scripts/e2e-integration.mjs --yes');
  process.exit(1);
}

let passedSteps = 0;
let totalSteps = 0;

function report(name, ok, detail = '') {
  totalSteps++;
  if (ok) {
    passedSteps++;
    console.log(`  ✔ [PASS] ${name}${detail ? ' (' + detail + ')' : ''}`);
  } else {
    console.error(`  ✖ [FAIL] ${name}${detail ? ' (' + detail + ')' : ''}`);
  }
}

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'workcred',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, data };
}

async function login(phone) {
  await request('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

  const verifyRes = await request('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code: '123456' }),
  });

  if (!verifyRes.data.success) {
    throw new Error(`Login failed for ${phone}: ${JSON.stringify(verifyRes.data.error)}`);
  }

  return {
    user: verifyRes.data.data.user,
    token: verifyRes.data.data.accessToken,
  };
}

async function run() {
  console.log('\n========================================================');
  console.log('🚀 WorkCred Phase B: Full End-to-End Integration Suite');
  console.log(`   Target Server: ${BASE_URL}`);
  console.log('========================================================\n');

  try {
    // 1. Health Probe
    const health = await request('/health');
    report('Liveness Health Probe', health.status === 200 && health.data.success);

    // 2. Readiness Probe (MongoDB status)
    const ready = await request('/health/ready');
    report('Readiness DB Probe', ready.status === 200 && ready.data.success);

    // 3. PWA App Shell Serving & Security Headers
    const appShell = await fetch(`${BASE_URL}/app`);
    const csp = appShell.headers.get('content-security-policy') || '';
    const hasCsp = csp.includes('default-src') && csp.includes('res.cloudinary.com');
    report('PWA Shell Delivery & CSP', appShell.status === 200 && hasCsp);

    // 4. Authenticate Worker (Ravi Kumar)
    const workerPhone = '9000000001';
    const worker = await login(workerPhone);
    report('Worker Authentication (OTP)', Boolean(worker.token && worker.user.role === 'worker'));

    // 5. Authenticate Customer (Meera Nair)
    const customerPhone = '9000000002';
    const customer = await login(customerPhone);
    report('Customer Authentication (OTP)', Boolean(customer.token && customer.user.role === 'customer'));

    // 6. Worker Search with Pune Coordinates & Cursor Pagination
    const searchRes = await request('/workers?lat=18.5204&lng=73.8567&radiusKm=10&limit=5', {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    const workersList = searchRes.data.data?.workers || [];
    report('Worker Discovery ($geoNear Pune Cluster)', workersList.length > 0, `${workersList.length} workers returned`);

    // 7. Privacy Assertion: No Plain Phone or Exact Coordinates in Worker Search
    const leaksPii = workersList.some((w) => w.phone || w.location?.coordinates);
    report('Discovery PII Privacy Guard (No phone or exact coordinates)', !leaksPii);

    // 8. Compass Rate Benchmark Query
    const compassRes = await request('/compass?skill=electrician&city=Pune&rate=250&rateUnit=hour');
    const hasCompass = compassRes.data.success && compassRes.data.data?.median > 0;
    report('Compass Fair Rate Quartiles (p25, median, p75)', hasCompass, `Median: ₹${compassRes.data.data?.median}`);

    // 9. Free-Now Radar Activation (Worker)
    const setAvail = await request('/availability', {
      method: 'POST',
      headers: { Authorization: `Bearer ${worker.token}` },
      body: JSON.stringify({ hours: 2, lat: 18.5304, lng: 73.8467 }),
    });
    report('Free-Now Radar Activation', setAvail.data.success, `Expires in 2 hours`);

    // 10. Free-Now Radar Status & Customer Nearby Query
    const nearbyAvail = await request('/availability/nearby?lat=18.5304&lng=73.8467&radiusKm=5', {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    const hasFreeWorker = (nearbyAvail.data.data?.workers || []).some((w) => w.id === worker.user.id);
    report('Free-Now Radar Spatial Query', hasFreeWorker, 'Worker found on customer radar');

    // 11. Customer Creates Direct Booking with Worker #3 (to avoid collision with demo worker's seeded in-progress booking)
    const worker2 = await login('9000000012');
    const bookingIdempotencyKey = `e2e-book-${Date.now()}`;
    const targetWorkerId = worker2.user.id;
    const createBookRes = await request('/bookings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customer.token}`,
        'Idempotency-Key': bookingIdempotencyKey,
      },
      body: JSON.stringify({
        workerId: targetWorkerId,
        skill: worker2.user.mainSkill || 'carpenter',
        rate: 200,
        rateUnit: 'hour',
        hours: 2,
        area: 'Shivajinagar',
        city: 'Pune',
      }),
    });
    const booking = createBookRes.data.data?.booking;
    report('Booking Creation with Idempotency Key', Boolean(booking?.id), `Booking ID: ${booking?.id}`);

    // 12. Idempotency Key Replay Validation
    const replayBookRes = await request('/bookings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customer.token}`,
        'Idempotency-Key': bookingIdempotencyKey,
      },
      body: JSON.stringify({
        workerId: targetWorkerId,
        skill: worker2.user.mainSkill || 'carpenter',
        rate: 200,
        rateUnit: 'hour',
        hours: 2,
        area: 'Shivajinagar',
        city: 'Pune',
      }),
    });
    const isIdempotent = replayBookRes.data.data?.booking?.id === booking.id;
    report('Booking Idempotency Key Replay Detection', isIdempotent);

    // 13. Worker Confirms Booking
    const confirmRes = await request(`/bookings/${booking.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${worker2.token}` },
    });
    report('Worker Confirms Booking', confirmRes.data.success);

    // 14. Customer Inspects Booking to Retrieve Decrypted Start Code
    const customerView = await request(`/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    const startCode = customerView.data.data?.booking?.startCode;
    report('Customer Handshake Start Code Decryption', Boolean(startCode && startCode.length === 4));

    // 15. Worker Inspects Booking (Assert Start Code NEVER Leaked to Worker)
    const workerView = await request(`/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${worker2.token}` },
    });
    const workerHasStartCode = Boolean(workerView.data.data?.booking?.startCode);
    report('Worker Zero-Knowledge Code Guard (Start Code hidden from worker)', !workerHasStartCode);

    // 16. Worker Starts Booking with Verbal Start Code Handshake and GPS
    const startRes = await request(`/bookings/${booking.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${worker2.token}` },
      body: JSON.stringify({ startCode, lat: 18.5304, lng: 73.8467 }),
    });
    const inProgress = startRes.data.data?.booking?.status === 'in_progress';
    report('Start Handshake Execution (status -> in_progress)', inProgress);

    // 17. Customer Inspects Booking to Retrieve Decrypted Finish Code
    const activeCustomerView = await request(`/bookings/${booking.id}`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    const finishCode = activeCustomerView.data.data?.booking?.finishCode;
    report('Customer Handshake Finish Code Decryption', Boolean(finishCode && finishCode.length === 4));

    // 18. Customer Completes Handshake with Finish Code & Star Rating
    const finishRes = await request(`/bookings/${booking.id}/finish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer.token}` },
      body: JSON.stringify({
        finishCode,
        paidCash: true,
        rating: 5,
        comment: 'Outstanding repair work in Shivajinagar.',
      }),
    });
    const isCompleted = finishRes.data.data?.booking?.status === 'completed';
    const passportEntry = finishRes.data.data?.passportEntry;
    report('Finish Handshake & Cash Payment Confirmation', isCompleted);
    report('Cryptographic Passport Block Chaining', Boolean(passportEntry?.hash), `Hash: ${passportEntry?.hash?.slice(0, 16)}...`);

    // 19. Work Passport Ledger Integrity Verification (SHA-256 Chain)
    const slug = worker.user.passportSlug;
    if (slug) {
      const verifyRes = await request(`/passport/${slug}/verify`);
      const chainValid = verifyRes.data.data?.valid === true;
      if (!chainValid) {
        console.error('DEBUG verifyRes:', JSON.stringify(verifyRes.data));
      }
      report('Independent SHA-256 Ledger Chain Verification', chainValid, `${verifyRes.data.data?.checkedEntries} blocks validated`);

      // 20. Public Passport Ledger Presentation
      const publicPassport = await request(`/passport/${slug}`);
      const hasEntries = (publicPassport.data.data?.entries || []).length > 0;
      if (!hasEntries) {
        console.error('DEBUG publicPassport:', JSON.stringify(publicPassport.data));
      }
      report('Public Work Passport Presentation', hasEntries);
    } else {
      report('Independent SHA-256 Ledger Chain Verification', false, 'Missing passportSlug');
    }

    // 21. Stop Free-Now Radar (Worker 1)
    const stopAvail = await request('/availability', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${worker.token}` },
    });
    report('Free-Now Radar Deactivation', stopAvail.data.success);

  } catch (err) {
    console.error('\n💥 Unexpected Integration Test Failure:', err);
  }

  console.log('\n--------------------------------------------------------');
  console.log(`Results: ${passedSteps}/${totalSteps} checks passed (${Math.round((passedSteps / totalSteps) * 100)}%)`);
  console.log('--------------------------------------------------------\n');

  if (passedSteps === totalSteps) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME INTEGRATION TESTS FAILED.\n');
    process.exit(1);
  }
}

run();
