import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Button, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { LocalityPicker } from '../../components/customer.js';
import { FreeNowCard, RequestCard, WorkerJobCard, JobDetailSheet } from '../../components/worker.js';
import { radarApi } from '../../api/radar.api.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { jobsApi } from '../../api/jobs.api.js';
import { socket } from '../../realtime/socket.js';
import { store } from '../../store.js';
import { EVENT_NAMES } from '/shared/constants.js';
import { friendlyError } from '../../utils/format.js';
import { coordinatesForLocality } from '../../utils/geo.js';

const token = () => store.get().session?.accessToken;

export function renderWorkerHome({ navigate, user, toast }) {
  let disposed = false;
  let currentArea = user.area || 'Deccan';
  let activeFreeNow = null;
  let isOffline = !navigator.onLine;

  const root = h('div', { className: 'wc-page-stack wc-worker-home' });

  // Time-of-day greeting
  const hour = new Date().getHours();
  const firstName = (user.name || 'Ravi Kumar').split(' ')[0];
  const greetingText = hour < 12
    ? `Good morning, ${firstName}`
    : hour < 17
    ? `Good afternoon, ${firstName}`
    : `Good evening, ${firstName}`;

  const greetingEl = h('div', { className: 'wc-worker-header-block' },
    h('div', { className: 'wc-worker-guild-row' },
      h('span', { className: 'wc-guild-id-badge' }, 'VERIFIED CIVIC GUILD • ID #4812'),
      h('span', { className: 'wc-active-ledger-badge' },
        h('span', { className: 'wc-ledger-check-icon' }, '✓'),
        h('strong', {}, 'Active Ledger')
      )
    ),
    h('h1', { className: 'wc-worker-greeting-heading' }, greetingText),
    h('div', { className: 'wc-worker-zone-row' },
      h('button', {
        type: 'button',
        className: 'wc-worker-jurisdiction-pill',
        onClick: (e) => LocalityPicker({
          value: currentArea,
          trigger: e.currentTarget,
          onSelect: (newArea) => {
            currentArea = newArea;
            greetingEl.querySelector('.wc-worker-jurisdiction-pill strong').textContent = `${newArea}, Ward 174 ▾`;
            void load();
          }
        })
      },
        h('span', { className: 'wc-pin-dot' }, '📍'),
        h('strong', {}, `${currentArea}, Ward 174 ▾`)
      ),
      h('span', { className: 'wc-zone-coverage-text' }, 'Zone 4 Coverage')
    )
  );

  const freeNowSlot = h('div', { className: 'wc-freenow-slot' }, Skeleton({ rows: 3 }));
  const requestsSlot = h('div', { className: 'wc-requests-section' });
  const jobsSlot = h('div', { className: 'wc-jobs-section' });

  const charterFooter = h('div', { className: 'wc-charter-protected-banner' },
    h('span', { className: 'wc-charter-shield' }, '🛡️'),
    h('p', {}, 'Protected under Bengaluru Civic Trades Charter • Fair wage guaranteed')
  );

  root.append(greetingEl, freeNowSlot, requestsSlot, jobsSlot, charterFooter);


  const page = workerShell({ title: en.nav.home, active: '/w/home', navigate, user, content: root });

  // Realtime listeners
  const unsubscribers = [
    socket.on(EVENT_NAMES.JOB_NEW, (payload) => {
      if (disposed) return;
      toast(en.worker.newJobToast.replace('{title}', payload?.job?.title || 'New work'), 'info');
      void loadJobs();
    }),
    socket.on(EVENT_NAMES.JOB_FILLED, () => { if (!disposed) void loadJobs(); }),
    socket.on(EVENT_NAMES.BOOKING_REQUEST, (payload) => {
      if (disposed) return;
      if (payload?.booking?.workerId === user.id) {
        toast(en.worker.newRequestToast.replace('{name}', (payload.booking.customerName || 'Customer').split(' ')[0]), 'success');
        void loadRequests();
        void loadFreeNow();
      }
    }),
    socket.on(EVENT_NAMES.BOOKING_CANCELLED, (payload) => {
      if (disposed) return;
      if (payload?.booking?.workerId === user.id) {
        void loadRequests();
      }
    })
  ];
  socket.connect();

  const onOnline = () => { isOffline = false; void load(); };
  const onOffline = () => { isOffline = true; void load(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  page.dispose = () => {
    disposed = true;
    unsubscribers.forEach((unsub) => unsub?.());
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };

  async function loadFreeNow() {
    try {
      const res = await radarApi.getMyAvailability(token());
      activeFreeNow = res.availability;
      renderFreeNow();
    } catch {
      renderFreeNow();
    }
  }

  function renderFreeNow() {
    const isLive = Boolean(activeFreeNow && new Date(activeFreeNow.expiresAt).getTime() > Date.now());
    const card = FreeNowCard({
      state: isLive ? 'active' : 'idle',
      durationHours: activeFreeNow?.hours || 2,
      expiresAt: activeFreeNow?.expiresAt,
      isOffline,
      onStart: async (hours) => {
        try {
          const point = coordinatesForLocality(currentArea);
          const res = await radarApi.setAvailability({
            hours,
            lat: point?.lat ?? user.location?.coordinates?.[1] ?? 18.5204,
            lng: point?.lng ?? user.location?.coordinates?.[0] ?? 73.8567,
          }, token());
          activeFreeNow = res.availability;
          toast('You are now Free for work!', 'success');
          renderFreeNow();
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      },
      onExtend: async () => {
        try {
          const currentHours = activeFreeNow?.hours || 2;
          const nextHours = currentHours + 2;
          const point = coordinatesForLocality(currentArea);
          const res = await radarApi.setAvailability({
            hours: nextHours,
            lat: point?.lat ?? 18.5204,
            lng: point?.lng ?? 73.8567,
          }, token());
          activeFreeNow = res.availability;
          toast('Extended by 2 hours!', 'success');
          renderFreeNow();
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      },
      onStop: async () => {
        try {
          await radarApi.clearAvailability(token());
          activeFreeNow = null;
          toast(en.worker.freeNowStopped, 'info');
          renderFreeNow();
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      },
      onViewRequests: () => navigate('/w/work')
    });
    freeNowSlot.replaceChildren(card);
  }

  async function loadRequests() {
    try {
      const { bookings = [] } = await bookingsApi.getBookings('pending', token());
      if (disposed) return;
      if (!bookings.length) {
        requestsSlot.replaceChildren();
        return;
      }

      const requestCards = bookings.map((b) => RequestCard({
        booking: b,
        onAccept: async () => {
          try {
            await bookingsApi.confirmBooking(b.id, token());
            toast(en.worker.requestAccepted, 'success');
            await loadRequests();
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        },
        onDecline: async () => {
          try {
            await bookingsApi.cancelBooking(b.id, token());
            toast(en.worker.requestDeclined, 'info');
            await loadRequests();
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        }
      }));

      requestsSlot.replaceChildren(
        h('div', { className: 'wc-worker-section-header' },
          h('div', { className: 'wc-worker-section-title-wrap' },
            h('span', { className: 'wc-red-dot-indicator' }, '●'),
            h('h2', { className: 'wc-worker-section-title' }, 'Needs Your Answer')
          ),
          h('span', { className: 'wc-pending-badge' }, `${bookings.length} Pending`)
        ),
        h('div', { className: 'wc-requests-list' }, ...requestCards)
      );
    } catch {
      requestsSlot.replaceChildren();
    }
  }

  async function loadJobs() {
    try {
      const point = coordinatesForLocality(currentArea);
      const { jobs = [] } = await jobsApi.getOpenJobs({
        lat: point?.lat ?? 18.5204,
        lng: point?.lng ?? 73.8567,
        radiusKm: user.radiusKm || 5,
      }, token());

      if (disposed) return;

      const filterBar = h('div', { className: 'wc-jobs-filter-pills-row' },
        h('button', { type: 'button', className: 'wc-job-filter-pill is-active' }, '⚡ My Trades (Wiring, MCB)'),
        h('button', { type: 'button', className: 'wc-job-filter-pill' }, 'Full Day'),
        h('button', { type: 'button', className: 'wc-job-filter-pill' }, 'Nearest first ▾')
      );

      const header = h('div', { className: 'wc-worker-jobs-header-block' },
        h('div', { className: 'wc-jobs-title-row' },
          h('div', {},
            h('h2', { className: 'wc-worker-section-title' }, 'Jobs Near You'),
            h('p', { className: 'wc-jobs-subtext' }, 'Live civic ledger opportunities')
          ),
          h('button', {
            type: 'button',
            className: 'wc-jobs-refresh-circle-btn',
            'aria-label': 'Refresh jobs',
            onClick: loadJobs
          }, '🔄')
        ),
        filterBar
      );

      if (!jobs.length) {
        jobsSlot.replaceChildren(
          header,
          EmptyState({
            title: en.worker.jobsNearYou,
            body: en.worker.noJobsNearYou,
          })
        );
        return;
      }

      const cards = jobs.map((job) => WorkerJobCard({
        job,
        onOpen: () => JobDetailSheet({
          job,
          trigger: document.activeElement,
          onAccept: async () => {
            try {
              const idempotencyKey = crypto.randomUUID();
              await jobsApi.acceptJob(job.id, idempotencyKey, token());
              toast(en.worker.jobAccepted, 'success');
              navigate('/w/work');
            } catch (err) {
              toast(friendlyError(err), 'error');
              void loadJobs();
            }
          }
        })
      }));

      jobsSlot.replaceChildren(
        header,
        h('div', { className: 'wc-worker-jobs-grid' }, ...cards)
      );
    } catch (err) {
      if (!disposed) {
        jobsSlot.replaceChildren(ErrorState({ message: friendlyError(err), onRetry: loadJobs }));
      }
    }
  }


  async function load() {
    await Promise.all([loadFreeNow(), loadRequests(), loadJobs()]);
  }

  void load();
  return page;
}
