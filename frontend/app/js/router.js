const exactRoutes = new Set([
  '/welcome', '/login', '/otp', '/role', '/onboarding', '/feed',
  '/w/home', '/w/work', '/w/passport', '/w/post', '/w/me',
  '/c/find', '/c/free-now', '/c/post-job', '/c/bookings', '/c/saved', '/c/me',
]);

const paramRoutes = [
  { pattern: /^\/c\/worker\/([^/]+)$/, route: '/c/worker/:id', param: 'id' },
  { pattern: /^\/c\/booking\/([^/]+)$/, route: '/c/booking/:id', param: 'id' },
  { pattern: /^\/w\/booking\/([^/]+)$/, route: '/w/booking/:id', param: 'id' },
  { pattern: /^\/w\/receipt\/([^/]+)$/, route: '/w/receipt/:bookingId', param: 'bookingId' },
  { pattern: /^\/c\/receipt\/([^/]+)$/, route: '/c/receipt/:bookingId', param: 'bookingId' },
  { pattern: /^\/p\/([^/]+)$/, route: '/p/:slug', param: 'slug' },
];

function matchRoute(path) {
  if (exactRoutes.has(path)) return { route: path, params: {} };
  for (const pr of paramRoutes) {
    const m = path.match(pr.pattern);
    if (m) return { route: pr.route, params: { [pr.param]: m[1] } };
  }
  return null;
}

export function createRouter(render) {
  const pathFromHash = () => {
    try { return decodeURIComponent(location.hash.replace(/^#/, '').split('?')[0] || '/'); }
    catch { return '/404'; }
  };

  const navigate = (path, { replace = false, role, phone } = {}) => {
    if (typeof window !== 'undefined' && typeof window.workcredLeaveGuard === 'function' && !window.workcredLeaveGuard(path)) return;
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
    const match = matchRoute(path);
    const context = {
      navigate,
      path,
      route: match?.route ?? path,
      params: match?.params ?? {},
      known: Boolean(match),
      search: new URLSearchParams(location.search),
      hashParams: new URLSearchParams(location.hash.split('?')[1] ?? ''),
    };
    await render(context);
  };

  window.addEventListener('hashchange', () => void dispatch());
  return { navigate, start: dispatch, current: pathFromHash, isKnown: (p) => Boolean(matchRoute(p)) };
}
