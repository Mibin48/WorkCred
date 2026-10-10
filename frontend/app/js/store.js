/**
 * WorkCred Application State Store
 * Holds in-memory session, role, UI state, and calculated server clock offset.
 * Never writes tokens to storage.
 */

const initial = {
  session: null,
  role: null,
  location: null,
  ui: { toast: null, pendingRole: null },
  serverClockOffset: 0,
};

let state = structuredClone(initial);
const listeners = new Set();

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn(state));
  },
  setSession(session) {
    const user = session?.user ?? null;
    state = {
      ...state,
      session,
      role: user?.role ?? null,
      location: user?.city ?? null,
    };
    listeners.forEach((fn) => fn(state));
  },
  setServerClockOffset(offset) {
    state = { ...state, serverClockOffset: Number(offset) || 0 };
  },
  getServerTime() {
    return Date.now() + (state.serverClockOffset || 0);
  },
  setUi(patch) {
    state = { ...state, ui: { ...state.ui, ...patch } };
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset() {
    state = structuredClone(initial);
    listeners.forEach((fn) => fn(state));
  },
};
