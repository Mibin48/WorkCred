import { config } from '../config.js';
import { handleMockRequest } from '../mock/handlers.js';
import { cacheResponse, getCachedResponse, isWhitelistedPath } from '../offline/cache.js';

async function request(method, path, body, options = {}) {
  const { token, headers = {}, query } = typeof options === 'string' ? { token: options } : options;

  let queryString = '';
  if (query && typeof query === 'object') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.append(k, String(v));
    }
    const qStr = params.toString();
    if (qStr) queryString = `?${qStr}`;
  }
  const fullPath = `${path}${queryString}`;

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  // Derive user identifier from token if available
  let userId = 'anon';
  if (token && token.startsWith('mock-access-')) {
    const parts = token.split('-');
    if (parts[2]) userId = parts.slice(2, -1).join('-');
  }

  // Check if offline and method is GET with whitelisted path
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (method === 'GET' && isOffline && isWhitelistedPath(path)) {
    const cached = await getCachedResponse(userId, fullPath);
    if (cached) {
      return {
        success: true,
        data: cached.data,
        isFromCache: true,
        cachedAt: cached.cachedAt,
      };
    }
  }

  let result;
  if (config.USE_MOCK) {
    result = await handleMockRequest(method, fullPath, body, requestHeaders);
  } else {
    try {
      const response = await fetch(`${config.API_BASE}${fullPath}`, {
        method,
        credentials: 'include',
        headers: requestHeaders,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await response.json();
      if (json && typeof json.success === 'boolean') result = json;
      else result = { success: false, error: { code: 'BAD_RESPONSE', message: 'The server returned an unexpected response.' } };
    } catch {
      result = { success: false, error: { code: 'NETWORK_ERROR', message: 'We could not connect. Check your connection and try again.' } };
    }
  }

  // If request succeeded and was GET, save to IndexedDB whitelist cache
  if (result && result.success && method === 'GET' && isWhitelistedPath(path)) {
    void cacheResponse(userId, fullPath, result.data);
  }

  // If live network failed for whitelisted GET, attempt fallback to cached record
  if (result && !result.success && method === 'GET' && isWhitelistedPath(path)) {
    const fallback = await getCachedResponse(userId, fullPath);
    if (fallback) {
      return {
        success: true,
        data: fallback.data,
        isFromCache: true,
        cachedAt: fallback.cachedAt,
      };
    }
  }

  return result;
}

export const http = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  delete: (path, options) => request('DELETE', path, undefined, options),
};

export function unwrap(result) {
  if (!result.success) throw result.error;
  return result.data;
}

