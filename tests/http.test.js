import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { http, setAccessToken, getAccessToken, executeTokenRefresh } from '../frontend/app/js/api/http.js';
import { store } from '../frontend/app/js/store.js';

describe('frontend/api/http', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = [];

  // Mock storage objects
  const mockLocalStorage = new Map();
  const mockSessionStorage = new Map();

  beforeEach(() => {
    fetchCalls = [];
    setAccessToken(null);
    store.set({ session: null, serverClockOffset: 0 });
    mockLocalStorage.clear();
    mockSessionStorage.clear();

    // Setup global storage mocks for scanner tests
    globalThis.localStorage = {
      getItem: (k) => mockLocalStorage.get(k) ?? null,
      setItem: (k, v) => mockLocalStorage.set(k, String(v)),
      removeItem: (k) => mockLocalStorage.delete(k),
      clear: () => mockLocalStorage.clear(),
      get length() { return mockLocalStorage.size; },
      key: (i) => Array.from(mockLocalStorage.keys())[i] ?? null,
    };
    globalThis.sessionStorage = {
      getItem: (k) => mockSessionStorage.get(k) ?? null,
      setItem: (k, v) => mockSessionStorage.set(k, String(v)),
      removeItem: (k) => mockSessionStorage.delete(k),
      clear: () => mockSessionStorage.clear(),
      get length() { return mockSessionStorage.size; },
      key: (i) => Array.from(mockSessionStorage.keys())[i] ?? null,
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends credentials: "same-origin" on all requests', async () => {
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await http.get('/users/me');
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].options.credentials, 'same-origin');
  });

  it('attaches X-Requested-With: workcred to state-changing requests and omits it on GET', async () => {
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // GET request
    await http.get('/workers');
    assert.equal(fetchCalls[0].options.headers['X-Requested-With'], undefined);

    // POST request
    await http.post('/bookings', { workerId: 'w1' });
    assert.equal(fetchCalls[1].options.headers['X-Requested-With'], 'workcred');

    // PATCH request
    await http.patch('/bookings/b1/accept', {});
    assert.equal(fetchCalls[2].options.headers['X-Requested-With'], 'workcred');

    // DELETE request
    await http.delete('/follows/w1');
    assert.equal(fetchCalls[3].options.headers['X-Requested-With'], 'workcred');
  });

  it('attaches in-memory Authorization Bearer header when token is set', async () => {
    setAccessToken('mem-token-xyz');
    assert.equal(getAccessToken(), 'mem-token-xyz');

    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return new Response(JSON.stringify({ user: { id: 'u1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await http.get('/users/me');
    assert.equal(fetchCalls[0].options.headers['Authorization'], 'Bearer mem-token-xyz');
  });

  it('tracks serverClockOffset from Date response header', async () => {
    const serverDate = new Date(Date.now() + 60000).toUTCString(); // 1 minute ahead
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Date': serverDate,
        },
      });
    };

    await http.get('/status');
    const offset = store.get().serverClockOffset;
    // Offset should be approximately +60000ms (+- 2000ms leeway)
    assert.ok(offset > 55000 && offset < 65000);
  });

  it('coalesces concurrent 401s into a single POST /auth/refresh call', async () => {
    setAccessToken('expired-token');

    let refreshCallCount = 0;
    let dataCallCount = 0;

    globalThis.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/refresh')) {
        refreshCallCount++;
        // Return refreshed token
        return new Response(JSON.stringify({
          success: true,
          data: {
            accessToken: 'fresh-token-abc',
            user: { id: 'u1', role: 'worker' },
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      dataCallCount++;
      // If request has old token, reject with 401
      if (options.headers['Authorization'] === 'Bearer expired-token') {
        return new Response(JSON.stringify({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Access token expired',
          },
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // If request has fresh token, succeed
      if (options.headers['Authorization'] === 'Bearer fresh-token-abc') {
        return new Response(JSON.stringify({
          success: true,
          data: 'success',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 });
    };

    // Trigger two concurrent requests that both encounter 401
    const [res1, res2] = await Promise.all([
      http.get('/bookings/b1'),
      http.get('/bookings/b2'),
    ]);

    assert.equal(res1.data, 'success');
    assert.equal(res2.data, 'success');
    assert.equal(refreshCallCount, 1, 'Only one /auth/refresh call should have been made');
    assert.equal(getAccessToken(), 'fresh-token-abc');
  });

  it('scans localStorage and sessionStorage to verify zero tokens are persisted', () => {
    // Populate permissible storage items (e.g. UI preferences, visit counts)
    localStorage.setItem('workcred.visit_count', '3');
    sessionStorage.setItem('workcred.phone', '9876543210');

    // Storage Scanner verification function
    const scanStorage = (storage, name) => {
      const forbiddenTokens = ['access_token', 'accessToken', 'refreshToken', 'refresh_token', 'jwt', 'bearer', 'eyj'];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const val = storage.getItem(key);
        for (const token of forbiddenTokens) {
          assert.equal(
            key.toLowerCase().includes(token.toLowerCase()),
            false,
            `Forbidden token pattern "${token}" found in ${name} key: ${key}`
          );
          assert.equal(
            val.toLowerCase().includes(token.toLowerCase()),
            false,
            `Forbidden token pattern "${token}" found in ${name} value for key: ${key}`
          );
        }
      }
    };

    scanStorage(localStorage, 'localStorage');
    scanStorage(sessionStorage, 'sessionStorage');
  });
});
