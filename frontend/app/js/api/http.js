/**
 * WorkCred Robust HTTP Client (http.js)
 * Phase B Real Backend Client:
 * - Credentials: same-origin with HttpOnly cookie support
 * - In-memory access token storage (zero browser storage persistence)
 * - Single-flight refresh token mutex across tabs (navigator.locks)
 * - Dynamic server clock offset tracking (Date header)
 * - Typed ApiError and error code to i18n translation
 * - Idempotency key replay handling
 * - Zero mock module imports in production/real mode
 */

import { config } from '../config.js';
import { store } from '../store.js';
import { en } from '../i18n/en.js';
import { cacheResponse, getCachedResponse, isWhitelistedPath } from '../offline/cache.js';
import { setRefreshSessionHint } from './sessionHint.js';

// In-memory access token storage
let inMemoryAccessToken = null;

export function setAccessToken(token) {
  inMemoryAccessToken = token || null;
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

// Cross-tab broadcast channel for auth state coordination
let authChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    authChannel = new BroadcastChannel('workcred_auth');
    authChannel.onmessage = (event) => {
      if (event.data?.type === 'logout') {
        inMemoryAccessToken = null;
        store.setSession(null);
        setRefreshSessionHint('none');
        if (typeof location !== 'undefined' && location.hash !== '#/welcome') {
          location.hash = '#/welcome';
        }
      }
    };
  } catch {
    // BroadcastChannel unsupported or blocked
  }
}

export function broadcastAuthEvent(type, payload = {}) {
  try {
    authChannel?.postMessage({ type, ...payload });
  } catch {
    // Ignore postMessage failure
  }
}

/**
 * Typed API Error
 */
export class ApiError extends Error {
  constructor(err = {}, status = 400) {
    const message = err.message || en.errors.generic;
    super(message);
    this.name = 'ApiError';
    this.code = err.code || 'UNKNOWN_ERROR';
    this.status = status;
    this.details = err.details || null;
    this.retryAfterSeconds = err.retryAfterSeconds ?? null;
  }
}

/**
 * Maps error codes to localized plain-English strings
 */
export function getLocalizedErrorMessage(code, defaultMessage = null) {
  if (!code) return defaultMessage || en.errors.generic;

  const codeMap = {
    UNAUTHENTICATED: en.errors.unauthenticated,
    FORBIDDEN: en.errors.forbidden,
    WRONG_ROLE: en.errors.customerOnly,
    INVALID_PHONE: en.errors.invalidPhone,
    INVALID_CODE: en.errors.invalidCode,
    RATE_LIMITED: en.errors.rateLimit,
    NOT_FOUND: en.errors.notFound,
    ALREADY_BOOKED: en.errors.alreadyBooked,
    OVERLAPPING_BOOKING: en.errors.conflictBooking,
    SCHEDULE_CONFLICT: en.errors.conflictBooking,
    INVALID_START_CODE: en.errors.invalidStartCode,
    INVALID_FINISH_CODE: en.errors.invalidFinishCode,
    DUPLICATE_ENDORSEMENT: en.errors.duplicateEndorsement,
    ALREADY_ENDORSED: en.errors.duplicateEndorsement,
    JOB_FILLED: en.errors.jobFilled,
    INVALID_STATE: en.errors.invalidState,
    INVALID_TRANSITION: en.errors.invalidState,
    ROLE_ALREADY_SET: en.errors.roleAlreadySet,
    INVALID_ROLE: en.errors.invalidRole,
    ACCOUNT_DISABLED: en.errors.accountDisabled,
    SMS_UNAVAILABLE: en.errors.smsUnavailable,
    REQUEST_IN_PROGRESS: en.errors.requestInProgress,
    IDEMPOTENCY_KEY_REUSED: en.errors.idempotencyKeyReused,
    IMAGE_NOT_ALLOWED: en.errors.imageNotAllowed,
    POST_NOT_FOUND: en.errors.postNotFound,
    SELF_ACTION_FORBIDDEN: en.errors.selfActionForbidden,
    TOKEN_REUSED: en.errors.tokenReused,
    TOKEN_EXPIRED: en.errors.tokenExpired,
    VALIDATION_ERROR: en.errors.validationError,
  };

  return codeMap[code] || defaultMessage || en.errors.generic;
}

// Single-flight in-tab refresh promise
let inTabRefreshPromise = null;

/**
 * Executes token refresh using cross-tab mutex (navigator.locks) or in-tab single-flight.
 */
export async function executeTokenRefresh() {
  if (inTabRefreshPromise) {
    return inTabRefreshPromise;
  }

  inTabRefreshPromise = (async () => {
    const doRefreshNetworkCall = async () => {
      const response = await fetch(`${config.API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'workcred',
        },
        body: JSON.stringify({}),
      });

      // Update server clock offset if Date header present
      const dateHeader = response.headers.get('date');
      if (dateHeader) {
        const serverMs = new Date(dateHeader).getTime();
        if (!isNaN(serverMs)) {
          store.setServerClockOffset(serverMs - Date.now());
        }
      }

      const body = await response.json().catch(() => ({}));
      if (response.ok && body.success && body.data?.accessToken) {
        setAccessToken(body.data.accessToken);
        store.setSession({
          user: body.data.user,
          accessToken: body.data.accessToken,
        });

        // Trigger realtime socket auth refresh if active
        if (typeof window !== 'undefined' && window.__workcred_socket_refresh) {
          window.__workcred_socket_refresh(body.data.accessToken);
        }

        return body.data.accessToken;
      }

      // Handle refresh failure
      const errCode = body.error?.code || 'UNAUTHENTICATED';
      if (errCode === 'TOKEN_EXPIRED') {
        // Multi-tab grace period window: brief delay and re-check in-memory token
        await new Promise((r) => setTimeout(r, 250));
        if (inMemoryAccessToken) return inMemoryAccessToken;
      }

      // Token reused or unrecoverable refresh failure: clear session
      setAccessToken(null);
      store.setSession(null);
      if (response.status === 401) setRefreshSessionHint('none');
      broadcastAuthEvent('logout');

      const localizedMsg =
        errCode === 'ACCOUNT_DISABLED'
          ? en.errors.accountDisabled
          : en.errors.sessionExpired;

      throw new ApiError(
        {
          code: errCode,
          message: localizedMsg,
        },
        response.status
      );
    };

    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('workcred_token_refresh', { mode: 'exclusive' }, async () => {
        return doRefreshNetworkCall();
      });
    }

    return doRefreshNetworkCall();
  })().finally(() => {
    inTabRefreshPromise = null;
  });

  return inTabRefreshPromise;
}

/**
 * Universal HTTP Request Handler
 */
async function request(method, path, body, options = {}) {
  const normalizedOptions = typeof options === 'string' ? { token: options } : { ...options };
  const {
    token,
    headers = {},
    query,
    timeoutMs = 15000,
    _retry = false,
  } = normalizedOptions;

  // Append query string if present
  let queryString = '';
  if (query && typeof query === 'object') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, String(v));
      }
    }
    const qStr = params.toString();
    if (qStr) queryString = `?${qStr}`;
  }
  const fullPath = `${path}${queryString}`;

  const currentToken = token || inMemoryAccessToken;
  const currentUserId = store.get().session?.user?.id || 'anon';

  // Check offline cache for whitelisted GET
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (method === 'GET' && isOffline && isWhitelistedPath(path)) {
    const cached = await getCachedResponse(currentUserId, fullPath);
    if (cached) {
      return {
        success: true,
        data: cached.data,
        isFromCache: true,
        cachedAt: cached.cachedAt,
      };
    }
  }

  // 1. Mock Mode (Dynamic Import ONLY when USE_MOCK is true)
  if (config.USE_MOCK) {
    const { handleMockRequest } = await import('../mock/handlers.js');
    return handleMockRequest(method, fullPath, body, {
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      ...headers,
    });
  }

  // 2. Real Backend Network Request
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  // Attach X-Requested-With for state-changing requests and auth endpoints
  if (method !== 'GET' || path === '/auth/refresh' || path === '/auth/logout') {
    requestHeaders['X-Requested-With'] = 'workcred';
  }

  // Attach in-memory Authorization token
  if (currentToken) {
    requestHeaders.Authorization = `Bearer ${currentToken}`;
  }

  // Attach Content-Type for JSON body
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  let response;
  let responseBody;
  try {
    response = await fetch(`${config.API_BASE}${fullPath}`, {
      method,
      credentials: 'same-origin',
      headers: requestHeaders,
      signal: controller.signal,
      ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
    });
    clearTimeout(timer);

    // Compute and sync server clock offset
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      const serverMs = new Date(dateHeader).getTime();
      if (!isNaN(serverMs)) {
        store.setServerClockOffset(serverMs - Date.now());
      }
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      const text = await response.text();
      responseBody = { success: response.ok, message: text };
    }
  } catch (fetchErr) {
    clearTimeout(timer);

    // If live network failed for whitelisted GET, attempt fallback to offline cache
    if (method === 'GET' && isWhitelistedPath(path)) {
      const fallback = await getCachedResponse(currentUserId, fullPath);
      if (fallback) {
        return {
          success: true,
          data: fallback.data,
          isFromCache: true,
          cachedAt: fallback.cachedAt,
        };
      }
    }

    if (fetchErr.name === 'AbortError') {
      throw new ApiError({ code: 'TIMEOUT', message: 'Request timed out. Please try again.' }, 408);
    }

    throw new ApiError({ code: 'NETWORK_ERROR', message: en.errors.network }, 0);
  }

  // Parse Retry-After header if present
  let retryAfterSeconds = null;
  const retryHeader = response.headers.get('retry-after');
  if (retryHeader) {
    const parsed = parseInt(retryHeader, 10);
    if (!isNaN(parsed) && parsed > 0) retryAfterSeconds = parsed;
  }

  // 3. Handle 401 & Silent Refresh
  if (response.status === 401 && !_retry && path !== '/auth/refresh' && path !== '/auth/login' && path !== '/auth/otp/verify') {
    const errCode = responseBody?.error?.code;
    const hasLiveSession = Boolean(inMemoryAccessToken || store.get().session);

    if (errCode === 'TOKEN_EXPIRED' || (hasLiveSession && errCode === 'UNAUTHENTICATED')) {
      try {
        const freshToken = await executeTokenRefresh();
        // Retry original request exactly once
        return request(method, path, body, {
          ...normalizedOptions,
          token: freshToken,
          _retry: true,
        });
      } catch (refreshErr) {
        throw refreshErr;
      }
    }
  }

  // 4. Handle Account Disabled
  if (responseBody?.error?.code === 'ACCOUNT_DISABLED') {
    setAccessToken(null);
    store.setSession(null);
    broadcastAuthEvent('logout');
    throw new ApiError(
      {
        code: 'ACCOUNT_DISABLED',
        message: en.errors.accountDisabled,
      },
      response.status
    );
  }

  // 5. Handle Successful Response
  if (response.ok && responseBody && responseBody.success !== false) {
    // If idempotent replay header present, tag response
    const isReplay =
      response.headers.get('idempotent-replayed') === 'true' ||
      response.headers.get('idempotent-replay') === 'true';

    const result = {
      ...responseBody,
      isReplay,
    };

    // Cache whitelisted GET data to IndexedDB
    if (method === 'GET' && isWhitelistedPath(path)) {
      void cacheResponse(currentUserId, fullPath, responseBody.data);
    }

    return result;
  }

  // 6. Handle Erroneous Response
  const errCode = responseBody?.error?.code || 'SERVER_ERROR';
  const serverMsg = responseBody?.error?.message;
  const localizedMsg = getLocalizedErrorMessage(errCode, serverMsg);

  throw new ApiError(
    {
      code: errCode,
      message: localizedMsg,
      details: responseBody?.error?.details || null,
      retryAfterSeconds: responseBody?.error?.retryAfterSeconds || retryAfterSeconds,
    },
    response.status
  );
}

export const http = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  delete: (path, options) => request('DELETE', path, undefined, options),
  setAccessToken,
  getAccessToken,
  executeTokenRefresh,
};

export function unwrap(result) {
  if (!result || result.success === false) {
    throw new ApiError(result?.error || {});
  }
  return result.data !== undefined ? result.data : result;
}
