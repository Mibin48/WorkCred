import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { BookingCard, ConfirmSheet, SegmentedTabs } from '../../components/customer.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { jobsApi } from '../../api/jobs.api.js';
import { socket } from '../../realtime/socket.js';
import { store } from '../../store.js';
import { EVENT_NAMES } from '/shared/constants.js';
import { friendlyError, formatMoney } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderBookings({ navigate, user, toast, hashParams }) {
  let active = hashParams?.get('tab') || 'upcoming';
  let disposed = false;
  const root = h('div', { className: 'wc-page-stack wc-bookings-page' }, h('div', { className: 'wc-segment-tabs-slot' }), h('div', { className: 'wc-bookings-content' }, Skeleton({ rows: 4 })));
  const page = customerShell({ title: en.bookings.title, active: '/c/bookings', navigate, user, content: root });
  page.dispose = () => { disposed = true; unsubscribers.forEach((unsubscribe) => unsubscribe?.()); };
  const tabsSlot = root.querySelector('.wc-segment-tabs-slot');
  let content = root.querySelector('.wc-bookings-content');
  const unsubscribers = [EVENT_NAMES.BOOKING_CREATED, EVENT_NAMES.BOOKING_STARTED, EVENT_NAMES.BOOKING_COMPLETED, EVENT_NAMES.BOOKING_CANCELLED].map((name) => socket.on(name, (payload) => {
    if (disposed) return;
    if (payload?.booking?.customerId === user.id) {
      const workerName = payload.booking.workerName || 'Worker';
      const action = name === EVENT_NAMES.BOOKING_STARTED ? en.bookings.liveStarted : name === EVENT_NAMES.BOOKING_COMPLETED ? en.bookings.liveCompleted : name === EVENT_NAMES.BOOKING_CANCELLED ? en.bookings.liveCancelled : en.bookings.liveConfirmed;
      toast(en.bookings.liveUpdate.replace('{name}', workerName).replace('{action}', action), 'success');
      void load();
    }
  }));
  socket.connect();

  function setTab(tab) {
    active = tab;
    history.replaceState(null, '', `#/c/bookings?tab=${encodeURIComponent(tab)}`);
    renderTabs();
    void load();
  }
  function renderTabs() {
    tabsSlot.replaceChildren(SegmentedTabs({ label: en.bookings.title, active, items: [
      { id: 'upcoming', label: en.bookings.tabUpcoming }, { id: 'active', label: en.bookings.tabActive }, { id: 'done', label: en.bookings.tabDone }, { id: 'jobs', label: en.bookings.tabMyJobs },
    ], onChange: setTab }));
  }

  async function load() {
    content.replaceChildren(Skeleton({ rows: 4 }));
    try {
      if (active === 'jobs') {
        const { jobs = [] } = await jobsApi.getCustomerJobs(token());
        if (disposed) return;
        content.replaceChildren(...(jobs.length ? jobs.map(renderJob) : [EmptyState({ title: en.bookings.emptyJobs, body: en.bookings.emptyJobsBody, action: Button({ label: en.nav.postJob, onClick: () => navigate('/c/post-job') }) })]));
        return;
      }
      const { bookings = [] } = await bookingsApi.getBookings(undefined, token());
      if (disposed) return;
      const filtered = bookings.filter((booking) => active === 'upcoming' ? ['pending', 'confirmed'].includes(booking.status) : active === 'active' ? booking.status === 'in_progress' : ['completed', 'cancelled', 'no_show'].includes(booking.status));
      content.replaceChildren(...(filtered.length ? filtered.map((booking) => BookingCard({ booking, worker: { name: booking.workerName }, onOpen: () => navigate(`/c/booking/${booking.id}`), onAction: () => {
        if (booking.status === 'in_progress') navigate(`/c/booking/${booking.id}`);
        else ConfirmSheet({ title: en.bookingDetail.cancelConfirmTitle, body: en.bookingDetail.cancelConfirmBody, confirmLabel: booking.status === 'pending' ? en.bookingDetail.cancelRequest : en.bookingDetail.cancelBooking, onConfirm: async () => { try { await bookingsApi.cancelBooking(booking.id, token()); toast(en.bookings.liveCancelled, 'success'); await load(); } catch (error) { toast(friendlyError(error), 'error'); } } });
      } })) : [EmptyState({ title: active === 'upcoming' ? en.bookings.emptyUpcoming : active === 'active' ? en.bookings.emptyActive : en.bookings.emptyDone, body: active === 'upcoming' ? en.bookings.emptyUpcomingBody : '', action: active === 'upcoming' ? Button({ label: en.nav.find, onClick: () => navigate('/c/find') }) : null })]));
    } catch (error) {
      if (!disposed) content.replaceChildren(ErrorState({ message: friendlyError(error), onRetry: load }));
    }
  }

  function renderJob(job) {
    const statusLabels = { open: en.bookings.jobOpen, filled: en.bookings.jobFilled, cancelled: en.bookings.jobCancelled, expired: en.bookings.jobExpired };
    const cancel = job.status === 'open' ? Button({ label: en.bookings.cancelJob, variant: 'outline', onClick: () => ConfirmSheet({ title: en.bookings.cancelJob, body: en.bookings.cancelJobConfirm, onConfirm: async () => { try { await jobsApi.cancelJob(job.id, token()); await load(); toast(en.bookings.jobCancelled, 'success'); } catch (error) { toast(friendlyError(error), 'error'); } } }) }) : null;
    return h('article', { className: `wc-job-card wc-job-card--${job.status}` },
      h('div', { className: 'wc-job-card-main' },
        h('div', { className: 'wc-job-card-head' },
          h('h2', {}, job.title),
          h('span', { className: `wc-badge wc-badge--${job.status === 'open' ? 'success' : 'neutral'}` }, statusLabels[job.status] || job.status)
        ),
        h('p', { className: 'wc-job-card-location' },
          h('span', { className: 'wc-pin-icon', 'aria-hidden': 'true' }, '📍'),
          `${job.area}, ${job.city} · ${job.slotsFilled}/${job.slotsNeeded} workers filled`
        ),
        h('div', { className: 'wc-job-rate-badge' },
          h('strong', {}, formatMoney(job.rate)),
          h('small', {}, ` / ${job.rateUnit || 'hour'}`)
        )
      ),
      cancel ? h('div', { className: 'wc-job-card-actions' }, cancel) : null
    );
  }

  renderTabs();
  void load();
  return page;
}
