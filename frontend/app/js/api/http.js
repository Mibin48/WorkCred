import { config } from '../config.js';
import { handleMockRequest } from '../mock/handlers.js';

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

  if (config.USE_MOCK) return handleMockRequest(method, fullPath, body, requestHeaders);

  try {
    const response = await fetch(`${config.API_BASE}${fullPath}`, {
      method,
      credentials: 'include',
      headers: requestHeaders,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (result && typeof result.success === 'boolean') return result;
    return { success: false, error: { code: 'BAD_RESPONSE', message: 'The server returned an unexpected response.' } };
  } catch {
    return { success: false, error: { code: 'NETWORK_ERROR', message: 'We could not connect. Check your connection and try again.' } };
  }
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
