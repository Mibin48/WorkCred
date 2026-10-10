/**
 * WorkCred Authentication API Client (auth.api.js)
 * Phase B Real Backend Auth Client:
 * - Phone OTP request & verification
 * - Silent cookie-based session restoration on boot
 * - In-memory access token management
 * - Multi-tab logout coordination
 * - Dynamic mock isolation (no mock code bundled/imported in real mode)
 */

import { http, unwrap, setAccessToken, broadcastAuthEvent } from './http.js';
import { store } from '../store.js';
import { config } from '../config.js';
import { clearOfflineCache } from '../offline/cache.js';
import { clearQueue } from '../offline/queue.js';

export const authApi = {
  /**
   * Request 6-digit OTP delivery to phone.
   */
  async requestOtp(phone) {
    const res = await http.post('/auth/otp/request', { phone });
    return unwrap(res);
  },

  /**
   * Verify OTP and establish session.
   * Access token stored strictly in memory; refresh token set as HttpOnly cookie.
   */
  async verifyOtp(phone, code) {
    const res = await http.post('/auth/otp/verify', { phone, code });
    const data = unwrap(res);

    if (data?.accessToken) {
      setAccessToken(data.accessToken);
    }

    const session = {
      user: data.user,
      accessToken: data.accessToken,
    };

    store.setSession(session);

    // If running in mock mode, sync mock database session dynamically
    if (config.USE_MOCK) {
      const { readDb, writeDb } = await import('../mock/db.js');
      const db = readDb();
      db.session = { userId: data.user?.id, accessToken: data.accessToken };
      writeDb(db);
    }

    return session;
  },

  /**
   * Restore session on boot / reload.
   * Calls POST /auth/refresh with HttpOnly cookie.
   * Returns session object if valid, or null if unauthenticated.
   */
  async restoreSession() {
    try {
      if (config.USE_MOCK) {
        const { readDb } = await import('../mock/db.js');
        const mockSession = readDb().session;
        if (!mockSession) return null;
      }

      const res = await http.post('/auth/refresh', {});
      const data = unwrap(res);

      if (data?.accessToken) {
        setAccessToken(data.accessToken);
      }

      // Fetch fresh authenticated profile from /users/me
      let user = data.user;
      try {
        const meRes = await http.get('/users/me', { token: data.accessToken });
        const meData = unwrap(meRes);
        if (meData?.user) user = meData.user;
      } catch {
        // Fall back to user returned by refresh
      }

      const session = {
        user,
        accessToken: data.accessToken,
      };

      store.setSession(session);
      return session;
    } catch {
      setAccessToken(null);
      store.setSession(null);
      return null;
    }
  },

  /**
   * Logout user, clear in-memory token, and broadcast across tabs.
   */
  async logout() {
    try {
      await http.post('/auth/logout', {});
    } catch {
      // Ignore network errors during logout
    } finally {
      setAccessToken(null);
      store.setSession(null);
      void clearOfflineCache();
      clearQueue();
      broadcastAuthEvent('logout');

      if (config.USE_MOCK) {
        const { readDb, writeDb } = await import('../mock/db.js');
        const db = readDb();
        db.session = null;
        writeDb(db);
      }
    }
  },

  /**
   * Demo data reset for mock mode only.
   */
  async resetDemoData() {
    if (!config.USE_MOCK) return;
    const { resetDb } = await import('../mock/db.js');
    resetDb();
    void clearOfflineCache();
    clearQueue();
    store.setSession(null);
  },
};
