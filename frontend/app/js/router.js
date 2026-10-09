const routes = new Set([
  '/welcome', '/login', '/otp', '/role', '/onboarding', '/feed',
  '/w/home', '/w/work', '/w/passport', '/w/post', '/w/me',
  '/c/find', '/c/free-now', '/c/post-job', '/c/bookings', '/c/saved', '/c/me',
]);

export function createRouter(render) {
  const pathFromHash = () => {
    try { return decodeURIComponent(location.hash.replace(/^#/, '').split('?')[0] || '/'); }
    catch { return '/404'; }
  };
  const navigate = (path, { replace = false, role, phone } = {}) => {
    if (role) sessionStorage.setItem('workcred.pendingRole', role);
    if (phone) sessionStorage.setItem('workcred.phone', phone);
    const next = `#${path}`;
    if (replace) { history.replaceState(null, '', next); void dispatch(); }
    else if (location.hash === next) void dispatch();
    else location.hash = next;
  };
  const dispatch = async () => {
    let path = pathFromHash();
    if (path === '/') path = '/welcome';
    const context = { navigate, path, known: routes.has(path), search: new URLSearchParams(location.search), params: new URLSearchParams(location.hash.split('?')[1] ?? '') };
    await render(context);
  };
  window.addEventListener('hashchange', () => void dispatch());
  return { navigate, start: dispatch, current: pathFromHash, isKnown: (path) => routes.has(path) };
}
