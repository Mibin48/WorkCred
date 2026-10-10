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
  const firstName = (user.name || 'Worker').split(' ')[0];
  const greetingText = hour < 12
    ? en.worker.greetingMorning.replace('{name}', firstName)
    : hour < 17
    ? en.worker.greetingAfternoon.replace('{name}', firstName)
    : en.worker.greetingEvening.replace('{name}', firstName);

  const greetingEl = h('div', { className: 'wc-worker-greeting-bar' },
    h('div', {},
      h('p', { className: 'wc-eyebrow' }, en.brand.tagline),
      h('h2', { className: 'wc-page-title' }, greetingText)
    ),
    Button({
      label: `📍 ${currentArea} ⌄`,
      variant: 'ghost',
      className: 'wc-locality-btn',
      onClick: (e) => LocalityPicker({
        value: currentArea,
        trigger: e.currentTarget,
        onSelect: (newArea) => {
          currentArea = newArea;
          greetingEl.querySelector('.wc-locality-btn').textContent = `📍 ${newArea} ⌄`;
          void load();
        }
      })
    })
  );

  const freeNowSlot = h('div', { className: 'wc-freenow-slot' }, Skeleton({ rows: 3 }));
  const requestsSlot = h('div', { className: 'wc-requests-section' });
  const jobsSlot = h('div', { className: 'wc-jobs-section' });

  root.append(greetingEl, freeNowSlot, requestsSlot, jobsSlot);

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
        h('div', { className: 'wc-section-header' },
          h('h3', {}, en.worker.needsAnswer),
          h('span', { className: 'wc-badge wc-badge--clay' }, `${bookings.length} new`)
        ),
        h('div', { className: 'wc-requests-list' }, ...requestCards)
      );
    } catch {
      requestsSlot.replaceChildren();
    }
  }

  async function loadJobs() {
    jobsSlot.replaceChildren(
      h('div', { className: 'wc-section-header' },
        h('h3', {}, en.worker.jobsNearYou),
        Button({ label: en.worker.refresh, variant: 'ghost', onClick: loadJobs })
      ),
      Skeleton({ rows: 3 })
    );

    try {
      const point = coordinatesForLocality(currentArea);
      const { jobs = [] } = await jobsApi.getOpenJobs({
        lat: point?.lat ?? 18.5204,
        lng: point?.lng ?? 73.8567,
        radiusKm: user.radiusKm || 5,
      }, token());

      if (disposed) return;

      if (!jobs.length) {
        jobsSlot.replaceChildren(
          h('div', { className: 'wc-section-header' },
            h('h3', {}, en.worker.jobsNearYou),
            Button({ label: en.worker.refresh, variant: 'ghost', onClick: loadJobs })
          ),
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
        h('div', { className: 'wc-section-header' },
          h('h3', {}, en.worker.jobsNearYou),
          Button({ label: en.worker.refresh, variant: 'ghost', onClick: loadJobs })
        ),
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
