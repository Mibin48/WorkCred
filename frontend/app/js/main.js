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
import { renderWorkerWork, renderWorkerBookingDetail } from './pages/worker/work.js';
import { renderWorkerMe } from './pages/worker/me.js';
import { renderWorkerPassport } from './pages/worker/passport.js';
import { renderWorkerPost } from './pages/worker/post.js';
import { renderFind } from './pages/customer/find.js';
import { renderCustomerFreeNow } from './pages/customer/freeNow.js';
import { renderWorkerProfile } from './pages/customer/workerProfile.js';
import { renderPostJob } from './pages/customer/postJob.js';
import { renderBookings } from './pages/customer/bookings.js';
import { renderBookingDetail } from './pages/customer/bookingDetail.js';
import { renderSaved } from './pages/customer/saved.js';
import { renderPublicPassport } from './pages/public/passport.js';
import { renderReceiptPage } from './pages/shared/receipt.js';
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
let activeView = null;
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
  activeView?.dispose?.();
  activeView = null;
  if (path === '/404') {
    root.replaceChildren(h('div', { className: 'wc-app-view' }, renderNotFound({ navigate: router.navigate, homePath: user?.role === 'worker' ? '/w/home' : user?.role === 'customer' ? '/c/find' : '/welcome' })));
  } else {
    const ctx = { navigate: router.navigate, user: user ?? {}, phone: flow.phone, pendingRole: flow.pendingRole, toast, dev: route.search.get('dev') === '1', params: route.params, hashParams: route.hashParams };
    let view;
    switch (route.route) {
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
      case '/w/work': view = renderWorkerWork(ctx); break;
      case '/w/booking/:id': view = renderWorkerBookingDetail({ ...ctx, id: route.params.id }); break;
      case '/w/me': view = renderWorkerMe(ctx); break;
      case '/c/me': view = renderMe(ctx); break;
      case '/w/passport': view = renderWorkerPassport(ctx); break;
      case '/w/post': view = renderWorkerPost(ctx); break;
      case '/w/receipt/:bookingId': case '/c/receipt/:bookingId': view = renderReceiptPage(ctx); break;
      case '/c/find': view = renderFind(ctx); break;
      case '/c/worker/:id': view = renderWorkerProfile({ ...ctx, id: route.params.id }); break;
      case '/c/post-job': view = renderPostJob(ctx); break;
      case '/c/bookings': view = renderBookings(ctx); break;
      case '/c/booking/:id': view = renderBookingDetail({ ...ctx, id: route.params.id }); break;
      case '/c/saved': view = renderSaved(ctx); break;
      case '/p/:slug': view = renderPublicPassport({ ...ctx, slug: route.params.slug }); break;
      case '/c/free-now': view = renderCustomerFreeNow(ctx); break;
      default: view = renderNotFound({ navigate: router.navigate });

    }
    activeView = view;
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

import { flushQueue } from './offline/queue.js';
import { http } from './api/http.js';

// 1. Service Worker Registration & Update Notification
if ('serviceWorker' in navigator) {
  const isDevMode = new URLSearchParams(location.search).get('dev') === '1';
  if (!isDevMode) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Check if user is currently entering form data or code before offering update
                const isEnteringInput = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
                if (!isEnteringInput) {
                  const updateToast = h('div', { className: 'wc-toast wc-toast--info', role: 'status' },
                    h('span', {}, en.pwa.swUpdateReady),
                    Button({
                      label: en.pwa.swRefresh,
                      variant: 'primary',
                      onClick: () => location.reload(),
                    })
                  );
                  if (liveRegion) liveRegion.replaceChildren(updateToast);
                }
              }
            });
          }
        });
      } catch { /* ignore SW registration failures in unsupported dev environments */ }
    });
  }
}

// 2. Offline Action Queue auto-flush on online and focus
const handleQueueFlush = async () => {
  const session = store.get().session;
  if (session?.accessToken) {
    const res = await flushQueue(http, session.accessToken);
    if (res.flushed > 0) {
      toast(`Synced ${res.flushed} offline action(s).`, 'success');
    }
  }
};
window.addEventListener('online', () => void handleQueueFlush());
window.addEventListener('focus', () => void handleQueueFlush());

// 3. Custom PWA Add to Home Screen Prompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  // Track visit count (show only after 2nd visit)
  const visits = Number(localStorage.getItem('workcred.visit_count') || 0) + 1;
  localStorage.setItem('workcred.visit_count', String(visits));

  const dismissedUntil = Number(localStorage.getItem('workcred.install_dismissed_until') || 0);
  if (visits >= 2 && Date.now() > dismissedUntil) {
    const currentPath = location.hash.replace(/^#/, '');
    const isSensitiveScreen = currentPath.includes('/login') || currentPath.includes('/otp') || currentPath.includes('/booking/');
    if (!isSensitiveScreen) {
      const banner = h('aside', { className: 'wc-install-banner', role: 'dialog', 'aria-label': en.pwa.installTitle },
        h('div', { className: 'wc-install-banner-copy' },
          h('strong', {}, en.pwa.installTitle),
          h('p', {}, en.pwa.installBody)
        ),
        h('div', { className: 'wc-install-banner-actions' },
          Button({
            label: en.pwa.installDismiss,
            variant: 'ghost',
            onClick: () => {
              banner.remove();
              localStorage.setItem('workcred.install_dismissed_until', String(Date.now() + 30 * 86400000));
            },
          }),
          Button({
            label: en.pwa.installBtn,
            variant: 'primary',
            onClick: async () => {
              banner.remove();
              if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                await deferredInstallPrompt.userChoice;
                deferredInstallPrompt = null;
              }
            },
          })
        )
      );
      document.body.append(banner);
    }
  }
});

await authApi.restoreSession();
void handleQueueFlush();

if (!location.hash) {
  const role = new URLSearchParams(location.search).get('role');
  router.navigate(['worker', 'customer'].includes(role) ? '/login' : '/welcome', { replace: true, role: ['worker', 'customer'].includes(role) ? role : undefined });
} else await router.start();

