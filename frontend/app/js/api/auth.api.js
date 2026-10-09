import { http, unwrap } from './http.js';
import { store } from '../store.js';
import { readDb, writeDb, resetDb } from '../mock/db.js';
import { config } from '../config.js';

function saveMockSession(session) {
  if (!config.USE_MOCK) return;
  const db = readDb();
  db.session = { userId: session.user.id, refreshToken: session.refreshToken };
  writeDb(db);
}

function clearMockSession() {
  if (!config.USE_MOCK) return;
  const db = readDb();
  db.session = null;
  writeDb(db);
}

export const authApi = {
  async requestOtp(phone) { return unwrap(await http.post('/auth/otp/request', { phone })); },
  async verifyOtp(phone, code) {
    const session = unwrap(await http.post('/auth/otp/verify', { phone, code }));
    saveMockSession(session);
    store.setSession(session);
    return session;
  },
  async restoreSession() {
    const refreshToken = config.USE_MOCK ? readDb().session?.refreshToken : undefined;
    if (config.USE_MOCK && !refreshToken) return null;
    try {
      const session = unwrap(await http.post('/auth/refresh', { refreshToken }));
      saveMockSession(session);
      store.setSession(session);
      return session;
    } catch {
      clearMockSession();
      store.setSession(null);
      return null;
    }
  },
  async logout() {
    const token = store.get().session?.accessToken;
    try { unwrap(await http.post('/auth/logout', {}, token)); } finally {
      clearMockSession();
      store.setSession(null);
    }
  },
  resetDemoData() {
    if (!config.USE_MOCK) return;
    resetDb();
    store.setSession(null);
  },
};
