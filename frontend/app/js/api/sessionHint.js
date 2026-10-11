const REFRESH_SESSION_HINT_KEY = 'workcred.refresh_session_hint';

/**
 * Store only whether a refresh cookie is likely to exist. The cookie itself
 * remains HttpOnly and is never copied into browser storage.
 */
export function getRefreshSessionHint() {
  try {
    return localStorage.getItem(REFRESH_SESSION_HINT_KEY);
  } catch {
    return null;
  }
}

export function setRefreshSessionHint(value) {
  try {
    if (value === null) localStorage.removeItem(REFRESH_SESSION_HINT_KEY);
    else localStorage.setItem(REFRESH_SESSION_HINT_KEY, value);
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
}
