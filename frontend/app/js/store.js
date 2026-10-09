const initial = { session: null, role: null, location: null, ui: { toast: null, pendingRole: null } };
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
    state = { ...state, session, role: user?.role ?? null, location: user?.city ?? null };
    listeners.forEach((fn) => fn(state));
  },
  setUi(patch) {
    state = { ...state, ui: { ...state.ui, ...patch } };
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset() { state = structuredClone(initial); listeners.forEach((fn) => fn(state)); },
};
