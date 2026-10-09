import { en } from './i18n/en.js';
import { store } from './store.js';
import { createRouter } from './router.js';
import { focusHeading, h } from './utils/dom.js';
import { authApi } from './api/auth.api.js';
import { usersApi } from './api/users.api.js';
import { renderWelcome } from './pages/shared/welcome.js';
import { renderLogin } from './pages/shared/login.js';
import { renderOtp } from './pages/shared/otp.js';
import { renderRole } from './pages/shared/role.js';
import { renderOnboarding } from './pages/shared/onboarding.js';
import { renderNotFound } from './pages/shared/notFound.js';
import { renderFeed } from './pages/shared/feed.js';
import { renderMe } from './pages/shared/me.js';
import { renderWorkerHome } from './pages/worker/home.js';
import { renderWorkerPlaceholder } from './pages/worker/placeholder.js';
import { renderFind } from './pages/customer/find.js';
import { renderCustomerPlaceholder } from './pages/customer/placeholder.js';
import { Button, Toast } from './components/index.js';

const root = document.querySelector('#app');
const liveRegion = document.querySelector('#app-live');
const flow = {
  get phone() { return sessionStorage.getItem('workcred.phone') ?? ''; },
  set phone(value) { sessionStorage.setItem('workcred.phone', value); },
  get pendingRole() { return sessionStorage.getItem('workcred.pendingRole') ?? ''; },
  clearPhone() { sessionStorage.removeItem('workcred.phone'); },
};
let protectedDestination = '';
let toastTimer;
function toast(message, kind = 'info') {
  if (!liveRegion) return;
  clearTimeout(toastTimer);
  liveRegion.replaceChildren(Toast({ message, kind }));
  toastTimer = setTimeout(() => liveRegion.replaceChildren(), 4200);
}

const router = createRouter(async (route) => {
  if (!root) return;
  let { path } = route;
  let session = store.get().session;
  let user = session?.user ?? null;
  const queryRole = route.search.get('role');
  if (['worker', 'customer'].includes(queryRole)) sessionStorage.setItem('workcred.pendingRole', queryRole);
  if (user && ['/', '/welcome', '/login'].includes(path)) {
    router.navigate(!user.role ? '/role' : !user.profileComplete ? '/onboarding' : user.role === 'worker' ? '/w/home' : '/c/find', { replace: true });
    return;
  }

  const protectedRoute = path === '/feed' || path.startsWith('/w/') || path.startsWith('/c/');
  if (protectedRoute && !user) {
    protectedDestination = path;
    router.navigate('/login', { replace: true });
    return;
  }
  if ((path === '/role' || path === '/onboarding') && !user) {
    router.navigate('/login', { replace: true }); return;
  }
  if (user && path === '/role') {
    if (user.role) { router.navigate(user.profileComplete ? (user.role === 'worker' ? '/w/home' : '/c/find') : '/onboarding', { replace: true }); return; }
  }
  if (user && path === '/onboarding' && !user.role) { router.navigate('/role', { replace: true }); return; }
  if (user && path === '/otp') {
    router.navigate(!user.role ? '/role' : !user.profileComplete ? '/onboarding' : user.role === 'worker' ? '/w/home' : '/c/find', { replace: true });
    return;
  }
  if (user && protectedRoute && (!user.role || !user.profileComplete)) {
    router.navigate(!user.role ? '/role' : '/onboarding', { replace: true }); return;
  }
  if (user && path === '/onboarding' && user.profileComplete) {
    router.navigate(user.role === 'worker' ? '/w/home' : '/c/find', { replace: true }); return;
  }
  if (user && (path.startsWith('/w/') || path.startsWith('/c/'))) {
    const intendedRole = path.startsWith('/w/') ? 'worker' : 'customer';
    if (user.role !== intendedRole) {
      toast(intendedRole === 'customer' ? en.errors.customerOnly : en.errors.workerOnly, 'warning');
      router.navigate(user.role === 'worker' ? '/w/home' : '/c/find', { replace: true }); return;
    }
  }
  if (path === '/otp' && !flow.phone) { router.navigate('/login', { replace: true }); return; }
  if (!route.known) path = '/404';
  if (path === '/404') {
    root.replaceChildren(h('div', { className: 'wc-app-view' }, renderNotFound({ navigate: router.navigate, homePath: user?.role === 'worker' ? '/w/home' : user?.role === 'customer' ? '/c/find' : '/welcome' })));
  } else {
    const ctx = { navigate: router.navigate, user: user ?? {}, phone: flow.phone, pendingRole: flow.pendingRole, toast, dev: route.search.get('dev') === '1' };
    let view;
    switch (path) {
      case '/': case '/welcome': view = renderWelcome(ctx); break;
      case '/login': view = renderLogin({ ...ctx, setPhone: (phone) => { flow.phone = phone; } }); break;
      case '/otp': view = renderOtp({ ...ctx, onSuccess: (loggedInUser) => {
        flow.clearPhone();
        if (!loggedInUser.role) router.navigate('/role', { role: flow.pendingRole, replace: true });
        else if (!loggedInUser.profileComplete) router.navigate('/onboarding', { replace: true });
        else {
          const matchingPrefix = `/${loggedInUser.role === 'worker' ? 'w' : 'c'}/`;
          if (protectedDestination && protectedDestination !== '/feed' && !protectedDestination.startsWith(matchingPrefix)) toast(loggedInUser.role === 'worker' ? en.errors.customerOnly : en.errors.workerOnly, 'warning');
          const destination = protectedDestination && (protectedDestination.startsWith(matchingPrefix) || protectedDestination === '/feed') ? protectedDestination : loggedInUser.role === 'worker' ? '/w/home' : '/c/find';
          protectedDestination = '';
          router.navigate(destination, { replace: true });
        }
      } }); break;
      case '/role': view = renderRole({ ...ctx, pendingRole: flow.pendingRole }); break;
      case '/onboarding': view = renderOnboarding(ctx); break;
      case '/feed': view = renderFeed(ctx); break;
      case '/w/home': view = renderWorkerHome(ctx); break;
      case '/w/me': case '/c/me': view = renderMe(ctx); break;
      case '/w/work': case '/w/passport': case '/w/post': view = renderWorkerPlaceholder({ ...ctx, path }); break;
      case '/c/find': view = renderFind(ctx); break;
      case '/c/free-now': case '/c/post-job': case '/c/bookings': case '/c/saved': view = renderCustomerPlaceholder({ ...ctx, path }); break;
      default: view = renderNotFound({ navigate: router.navigate });
    }
    root.replaceChildren(h('div', { className: 'wc-app-view' }, view));
    if (route.search.get('dev') === '1') root.append(devMenu(router));
  }
  document.title = `${root.querySelector('h1')?.textContent ?? en.brand.name} · ${en.brand.name}`;
  focusHeading(root);
  if (liveRegion && !liveRegion.hasChildNodes()) liveRegion.setAttribute('aria-label', en.common.navigation);
});

import { DevInspector, logDevRequest } from './components/devInspector.js';

function devMenu(router) {
  return DevInspector({ navigate: router.navigate });
}

window.workcred = { auth: authApi, users: usersApi, toast };
root?.replaceChildren(h('section', { className: 'wc-boot-screen', role: 'status' },
  h('img', { src: '/assets/workcred-mark.png', alt: '', width: 52, height: 52 }),
  h('p', { className: 'wc-eyebrow' }, en.brand.name),
  h('h1', {}, en.boot.title),
  h('p', { className: 'wc-lead' }, en.boot.body),
  h('span', { className: 'wc-boot-track', 'aria-hidden': 'true' }, h('span', {}))
));
await authApi.restoreSession();
if (!location.hash) {
  const role = new URLSearchParams(location.search).get('role');
  router.navigate(['worker', 'customer'].includes(role) ? '/login' : '/welcome', { replace: true, role: ['worker', 'customer'].includes(role) ? role : undefined });
} else await router.start();
