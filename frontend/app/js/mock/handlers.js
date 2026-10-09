/**
 * WorkCred Mock API Router & Handlers
 * Maps HTTP method and path to service controllers.
 * Formats standard response envelope: { success, data, message } / { success: false, error }.
 * Pure ES module.
 */

import { readDb, writeDb } from './db.js';
import * as authService from './services/authService.js';
import * as userService from './services/userService.js';
import * as jobService from './services/jobService.js';
import * as bookingService from './services/bookingService.js';
import * as passportService from './services/passportService.js';
import * as radarService from './services/radarService.js';
import * as compassService from './services/compassService.js';
import * as feedService from './services/feedService.js';
import * as uploadService from './services/uploadService.js';
import { generateQrDataUrl } from '../utils/qr.js';
import { AppError } from '../../../shared/errors.js';
import { LIMITS } from '../../../shared/constants.js';

const ok = (data = {}, message = '') => ({ success: true, data, message });
const fail = (code, message, status = 400, details = null) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
});

export async function handleMockRequest(method, path, body = {}, headers = {}) {
  // Latency simulation (300ms - 700ms)
  await new Promise((resolve) => setTimeout(resolve, 300 + Math.floor(Math.random() * 401)));

  // Chaos testing flag check (?chaos=1 or X-Chaos header)
  let isChaos = false;
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('chaos') === '1') isChaos = true;
  if (headers['X-Chaos'] === '1') isChaos = true;
  if (isChaos && Math.random() < 0.25) {
    return fail('NETWORK_ERROR', 'Simulated chaos network error.', 500);
  }

  const db = readDb();
  const cleanPath = path.replace(/^\/api\/v1/, '').split('?')[0];
  const queryStr = path.includes('?') ? path.split('?')[1] : '';
  const query = Object.fromEntries(new URLSearchParams(queryStr).entries());

  // Idempotency-Key support on POST endpoints
  const idempotencyKey = headers['Idempotency-Key'] || headers['idempotency-key'] || query['idempotencyKey'];
  if (method.toUpperCase() === 'POST' && idempotencyKey) {
    if (!db.idempotencyKeys) db.idempotencyKeys = {};
    const cached = db.idempotencyKeys[idempotencyKey];
    if (cached) {
      if (Date.now() - cached.timestamp < LIMITS.IDEMPOTENCY_TTL_MS) {
        return cached.response;
      }
    }
  }

  // Session User Extraction
  let sessionUserId = db.session?.userId;
  const authHeader = headers.Authorization || headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer mock-access-')) {
    const parts = authHeader.split('-');
    if (parts[2]) sessionUserId = parts.slice(2, -1).join('-');
  }

  try {
    let result;

    // --- AUTH & USERS ---
    if (method === 'POST' && cleanPath === '/auth/otp/request') {
      result = ok(authService.requestOtp(body));
    } else if (method === 'POST' && cleanPath === '/auth/otp/verify') {
      result = ok(authService.verifyOtp(body));
    } else if (method === 'POST' && cleanPath === '/auth/refresh') {
      result = ok(authService.refreshSession(body, sessionUserId));
    } else if (method === 'POST' && cleanPath === '/auth/logout') {
      result = ok(authService.logout());
    } else if (method === 'GET' && cleanPath === '/users/me') {
      result = ok(userService.getMe(requireAuth(sessionUserId)));
    } else if (method === 'PATCH' && cleanPath === '/users/me') {
      result = ok(userService.updateMe(requireAuth(sessionUserId), body));
    } else if (method === 'PATCH' && cleanPath === '/users/me/role') {
      result = ok(userService.setRole(requireAuth(sessionUserId), body.role));
    } else if (method === 'GET' && cleanPath === '/workers') {
      result = ok(userService.searchWorkers(query));
    } else if (method === 'GET' && cleanPath.match(/^\/workers\/[^/]+$/)) {
      const wId = cleanPath.split('/')[2];
      result = ok(userService.getWorkerById(wId, sessionUserId));
    }

    // --- JOBS ---
    else if (method === 'POST' && cleanPath === '/jobs') {
      result = ok(jobService.createJob(requireAuth(sessionUserId), body));
    } else if (method === 'GET' && cleanPath === '/jobs') {
      result = ok(jobService.getOpenJobs(requireAuth(sessionUserId), query));
    } else if (method === 'GET' && cleanPath === '/jobs/mine') {
      result = ok(jobService.getCustomerJobs(requireAuth(sessionUserId)));
    } else if (method === 'POST' && cleanPath.match(/^\/jobs\/[^/]+\/accept$/)) {
      const jId = cleanPath.split('/')[2];
      result = ok(jobService.acceptJob(requireAuth(sessionUserId), jId));
    } else if (method === 'POST' && cleanPath.match(/^\/jobs\/[^/]+\/cancel$/)) {
      const jId = cleanPath.split('/')[2];
      result = ok(jobService.cancelJob(requireAuth(sessionUserId), jId));
    }

    // --- BOOKINGS ---
    else if (method === 'POST' && cleanPath === '/bookings') {
      result = ok(bookingService.createBooking(requireAuth(sessionUserId), body));
    } else if (method === 'POST' && cleanPath.match(/^\/bookings\/[^/]+\/confirm$/)) {
      const bId = cleanPath.split('/')[2];
      result = ok(bookingService.confirmBooking(requireAuth(sessionUserId), bId));
    } else if (method === 'GET' && cleanPath === '/bookings') {
      const uId = requireAuth(sessionUserId);
      const user = db.users.find((u) => u.id === uId);
      result = ok(bookingService.getBookings(uId, user?.role || 'customer', query.status));
    } else if (method === 'GET' && cleanPath.match(/^\/bookings\/[^/]+$/)) {
      const bId = cleanPath.split('/')[2];
      const uId = requireAuth(sessionUserId);
      const user = db.users.find((u) => u.id === uId);
      result = ok(bookingService.getBookingById(bId, uId, user?.role || 'customer'));
    } else if (method === 'POST' && cleanPath.match(/^\/bookings\/[^/]+\/start$/)) {
      const bId = cleanPath.split('/')[2];
      result = ok(bookingService.startBooking(requireAuth(sessionUserId), bId, body));
    } else if (method === 'POST' && cleanPath.match(/^\/bookings\/[^/]+\/finish$/)) {
      const bId = cleanPath.split('/')[2];
      result = ok(await bookingService.finishBooking(requireAuth(sessionUserId), bId, body));
    } else if (method === 'POST' && cleanPath.match(/^\/bookings\/[^/]+\/cancel$/)) {
      const bId = cleanPath.split('/')[2];
      const uId = requireAuth(sessionUserId);
      const user = db.users.find((u) => u.id === uId);
      result = ok(bookingService.cancelBooking(uId, user?.role || 'customer', bId));
    }

    // --- PASSPORT ---
    else if (method === 'GET' && cleanPath === '/passport/me') {
      result = ok(passportService.getMyPassport(requireAuth(sessionUserId)));
    } else if (method === 'PATCH' && cleanPath.match(/^\/passport\/entries\/[^/]+$/)) {
      const eId = cleanPath.split('/')[3];
      result = ok(passportService.updatePassportEntry(requireAuth(sessionUserId), eId, body));
    } else if (method === 'GET' && cleanPath.match(/^\/passport\/[^/]+\/verify$/)) {
      const slug = cleanPath.split('/')[2];
      result = ok(await passportService.verifyPassportChain(slug));
    } else if (method === 'GET' && cleanPath.match(/^\/passport\/[^/]+\/qr$/)) {
      const slug = cleanPath.split('/')[2];
      const qrUrl = generateQrDataUrl(`https://workcred.in/passport/${slug}`);
      result = ok({ qrDataUrl: qrUrl, passportSlug: slug });
    } else if (method === 'GET' && cleanPath.match(/^\/passport\/[^/]+$/)) {
      const slug = cleanPath.split('/')[2];
      result = ok(passportService.getPublicPassport(slug));
    }

    // --- RADAR / FREE NOW ---
    else if (method === 'POST' && cleanPath === '/availability') {
      result = ok(radarService.setAvailability(requireAuth(sessionUserId), body));
    } else if (method === 'DELETE' && cleanPath === '/availability') {
      result = ok(radarService.clearAvailability(requireAuth(sessionUserId)));
    } else if (method === 'GET' && cleanPath === '/availability/nearby') {
      result = ok(radarService.getNearbyAvailability(query));
    }

    // --- COMPASS ---
    else if (method === 'GET' && cleanPath === '/compass') {
      result = ok(compassService.getCompassStats(query));
    }

    // --- FEED & SOCIAL ---
    else if (method === 'GET' && cleanPath === '/feed') {
      const uId = requireAuth(sessionUserId);
      const user = db.users.find((u) => u.id === uId);
      result = ok(feedService.getFeed(uId, user?.role || 'customer', query));
    } else if (method === 'POST' && cleanPath === '/posts') {
      result = ok(feedService.createPost(requireAuth(sessionUserId), body));
    } else if (method === 'POST' && cleanPath === '/follows') {
      result = ok(feedService.toggleFollow(requireAuth(sessionUserId), body));
    } else if (method === 'DELETE' && cleanPath.match(/^\/follows\/[^/]+$/)) {
      const toId = cleanPath.split('/')[2];
      result = ok(feedService.toggleFollow(requireAuth(sessionUserId), { toUserId: toId, type: 'follow' }));
    } else if (method === 'POST' && cleanPath === '/endorsements') {
      result = ok(feedService.addEndorsement(requireAuth(sessionUserId), body));
    } else if (method === 'POST' && cleanPath === '/uploads/sign') {
      result = ok(uploadService.signUpload(body));
    } else if (method === 'POST' && cleanPath === '/push/subscribe') {
      result = ok({ message: 'Push subscription registered.' });
    }

    // --- DEV ACTIONS ---
    else if (method === 'POST' && cleanPath === '/dev/tamper-passport') {
      result = ok(passportService.tamperEntry(body.workerId || 'user-worker-ravi', body.seq || 1));
    }

    else {
      return fail('NOT_FOUND', `Endpoint ${method} ${cleanPath} not found.`, 404);
    }

    // Cache idempotency response if applicable
    if (method.toUpperCase() === 'POST' && idempotencyKey) {
      if (!db.idempotencyKeys) db.idempotencyKeys = {};
      db.idempotencyKeys[idempotencyKey] = {
        timestamp: Date.now(),
        response: result,
      };
      writeDb(db);
    }

    return result;
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message, err.status, err.details);
    }
    return fail('SERVER_ERROR', err.message || 'An unexpected error occurred.', 500);
  }
}

function requireAuth(userId) {
  if (!userId) throw new AppError('UNAUTHENTICATED', 'Authentication required.', 401);
  return userId;
}
