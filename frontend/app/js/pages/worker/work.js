import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Button, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { SegmentedTabs, ConfirmSheet } from '../../components/customer.js';
import { RequestCard, StartCodeSheet, ReportSheet } from '../../components/worker.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { socket } from '../../realtime/socket.js';
import { store } from '../../store.js';
import { EVENT_NAMES } from '/shared/constants.js';
import { formatBookingDate, formatMoney, formatSkill, formatStatus, friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderWorkerWork({ navigate, user, toast, hashParams }) {
  let activeTab = hashParams?.get('tab') || 'requests';
  let disposed = false;

  const root = h('div', { className: 'wc-page-stack wc-worker-work-page' });
  const tabsSlot = h('div', { className: 'wc-segment-tabs-slot' });
  const contentSlot = h('div', { className: 'wc-work-content-slot' }, Skeleton({ rows: 4 }));

  root.append(tabsSlot, contentSlot);

  const page = workerShell({ title: en.nav.work, active: '/w/work', navigate, user, content: root });

  const unsubscribers = [
    socket.on(EVENT_NAMES.BOOKING_REQUEST, (payload) => {
      if (disposed) return;
      if (payload?.booking?.workerId === user.id) {
        toast(en.worker.newRequestToast.replace('{name}', payload.booking.customerName || 'Customer'), 'info');
        void load();
      }
    }),
    socket.on(EVENT_NAMES.BOOKING_STARTED, () => { if (!disposed) void load(); }),
    socket.on(EVENT_NAMES.BOOKING_COMPLETED, () => { if (!disposed) void load(); }),
    socket.on(EVENT_NAMES.BOOKING_CANCELLED, () => { if (!disposed) void load(); })
  ];
  socket.connect();

  page.dispose = () => {
    disposed = true;
    unsubscribers.forEach((unsub) => unsub?.());
  };

  function setTab(tab) {
    activeTab = tab;
    history.replaceState(null, '', `#/w/work?tab=${encodeURIComponent(tab)}`);
    renderTabs();
    void load();
  }

  function renderTabs() {
    tabsSlot.replaceChildren(SegmentedTabs({
      label: 'Work tabs',
      active: activeTab,
      items: [
        { id: 'requests', label: en.worker.tabsRequests },
        { id: 'upcoming', label: en.worker.tabsUpcoming },
        { id: 'active', label: en.worker.tabsActive },
        { id: 'done', label: en.worker.tabsDone },
      ],
      onChange: setTab
    }));
  }

  async function load() {
    contentSlot.replaceChildren(Skeleton({ rows: 4 }));
    try {
      const { bookings = [] } = await bookingsApi.getBookings(undefined, token());
      if (disposed) return;

      const filtered = bookings.filter((b) => {
        if (activeTab === 'requests') return b.status === 'pending';
        if (activeTab === 'upcoming') return b.status === 'confirmed';
        if (activeTab === 'active') return b.status === 'in_progress';
        return ['completed', 'cancelled', 'no_show'].includes(b.status);
      });

      if (!filtered.length) {
        contentSlot.replaceChildren(EmptyState({
          title: activeTab === 'requests' ? en.worker.emptyRequests : activeTab === 'upcoming' ? en.worker.emptyUpcoming : activeTab === 'active' ? en.worker.emptyActive : en.worker.emptyDone,
          body: activeTab === 'requests' ? 'Check back soon for new booking requests from customers.' : '',
        }));
        return;
      }

      if (activeTab === 'requests') {
        contentSlot.replaceChildren(...filtered.map((b) => RequestCard({
          booking: b,
          onAccept: async () => {
            try {
              await bookingsApi.confirmBooking(b.id, token());
              toast(en.worker.requestAccepted, 'success');
              await load();
            } catch (err) { toast(friendlyError(err), 'error'); }
          },
          onDecline: async () => {
            try {
              await bookingsApi.cancelBooking(b.id, token());
              toast(en.worker.requestDeclined, 'info');
              await load();
            } catch (err) { toast(friendlyError(err), 'error'); }
          }
        })));
        return;
      }

      contentSlot.replaceChildren(...filtered.map((b) => renderWorkerBookingCard(b)));
    } catch (err) {
      if (!disposed) {
        contentSlot.replaceChildren(ErrorState({ message: friendlyError(err), onRetry: load }));
      }
    }
  }

  function renderWorkerBookingCard(booking) {
    const customerFirstName = (booking.customerName || 'Customer').split(' ')[0];
    const totalEst = Math.round((Number(booking.rate) / (booking.rateUnit === 'hour' ? 1 : 8)) * (booking.hours || 1));

    let actionBtn = null;
    if (booking.status === 'confirmed') {
      actionBtn = Button({
        label: en.worker.arrivedBtn,
        variant: 'primary',
        onClick: (e) => StartCodeSheet({
          booking,
          trigger: e.currentTarget,
          onStart: async (data) => {
            const res = await bookingsApi.startBooking(booking.id, data, token());
            toast(en.worker.startSuccess, 'success');
            await load();
            return res;
          }
        })
      });
    } else if (booking.status === 'in_progress') {
      actionBtn = Button({
        label: 'View active job',
        variant: 'primary',
        onClick: () => navigate(`/w/booking/${booking.id}`)
      });
    } else {
      actionBtn = Button({
        label: en.bookings.actionViewDetail,
        variant: 'outline',
        onClick: () => navigate(`/w/booking/${booking.id}`)
      });
    }

    return h('article', { className: `wc-worker-booking-card wc-worker-booking-card--${booking.status}`, onClick: () => navigate(`/w/booking/${booking.id}`) },
      h('div', { className: 'wc-worker-booking-main' },
        h('div', { className: 'wc-worker-booking-head' },
          h('div', {},
            h('strong', {}, customerFirstName),
            h('span', { className: 'wc-booking-skill-tag' }, formatSkill(booking.skill))
          ),
          Badge({ label: formatStatus(booking.status), kind: booking.status === 'confirmed' || booking.status === 'completed' ? 'success' : booking.status === 'in_progress' ? 'clay' : 'neutral' })
        ),
        h('p', { className: 'wc-worker-booking-meta' },
          h('span', {}, `📅 ${formatBookingDate(booking.scheduledAt || booking.createdAt)}`),
          h('span', {}, `⏱ ${booking.hours || 1} hrs`),
          h('span', {}, `📍 ${booking.area || 'Pune'}`)
        ),
        h('div', { className: 'wc-worker-booking-foot' },
          h('div', { className: 'wc-rate-badge' },
            h('strong', {}, formatMoney(totalEst)),
            h('small', {}, `(${formatMoney(booking.rate)}/${booking.rateUnit || 'day'})`)
          ),
          h('div', { className: 'wc-card-action-slot', onClick: (e) => e.stopPropagation() }, actionBtn)
        )
      )
    );
  }

  renderTabs();
  void load();
  return page;
}

export function renderWorkerBookingDetail({ navigate, user, toast, id, params }) {
  const bookingId = id || params?.id;
  const root = h('div', { className: 'wc-page-stack wc-booking-detail-page' }, Skeleton({ rows: 4 }));
  const page = workerShell({ title: en.bookingDetail.title, active: '/w/work', navigate, user, content: root });

  let disposed = false;
  let bookingData = null;
  let timerInterval = null;

  const listeners = [
    socket.on(EVENT_NAMES.BOOKING_STARTED, (payload) => {
      if (!disposed && payload?.booking?.id === bookingId) void load();
    }),
    socket.on(EVENT_NAMES.BOOKING_COMPLETED, (payload) => {
      if (!disposed && payload?.booking?.id === bookingId) {
        bookingData = payload.booking;
        renderCompletionSheet(payload.booking);
      }
    }),
    socket.on(EVENT_NAMES.BOOKING_CANCELLED, (payload) => {
      if (!disposed && payload?.booking?.id === bookingId) void load();
    })
  ];
  socket.connect();

  page.dispose = () => {
    disposed = true;
    clearInterval(timerInterval);
    listeners.forEach((unsub) => unsub?.());
  };

  async function load() {
    try {
      const res = await bookingsApi.getBookingById(bookingId, token());
      if (disposed) return;
      bookingData = res.booking || res;
      render();
    } catch (err) {
      if (!disposed) root.replaceChildren(ErrorState({ message: friendlyError(err), onRetry: load }));
    }
  }

  function render() {
    const booking = bookingData;
    if (!booking) return;

    const customerFirstName = (booking.customerName || 'Customer').split(' ')[0];
    const isConfirmedOrActive = ['confirmed', 'in_progress'].includes(booking.status);
    const totalCash = Math.round((Number(booking.rate) / (booking.rateUnit === 'hour' ? 1 : 8)) * (booking.hours || 1));

    // Privacy rule: No customer phone/exact location before confirmation
    const contactSection = isConfirmedOrActive && booking.customerPhone
      ? h('div', { className: 'wc-contact-actions' },
          h('a', { className: 'wc-button wc-button--outline', href: `tel:${booking.customerPhone}` }, `☎ ${en.bookingDetail.call}`),
          h('a', { className: 'wc-button wc-button--outline', href: `https://wa.me/91${String(booking.customerPhone).replace(/\D/g, '').slice(-10)}`, target: '_blank', rel: 'noopener noreferrer' }, `◉ ${en.bookingDetail.whatsapp}`),
          h('p', { className: 'wc-hint' }, en.bookingDetail.contactNote)
        )
      : h('p', { className: 'wc-hint' }, 'Customer contact details will unlock once confirmed.');

    const directionsSection = isConfirmedOrActive
      ? h('div', { className: 'wc-directions-block' },
          h('p', {}, `📍 Job location: ${booking.area || 'Pune'}`),
          h('a', { className: 'wc-button wc-button--outline', href: `https://maps.google.com/?q=${encodeURIComponent(booking.area || 'Pune')}`, target: '_blank', rel: 'noopener noreferrer' }, `🗺 ${en.worker.getDirections}`)
        )
      : h('p', { className: 'wc-hint' }, en.worker.approxArea.replace('{area}', booking.area || 'Pune'));

    let activeJobTimerBlock = null;
    if (booking.status === 'in_progress' && booking.startedAt) {
      const timerOutput = h('output', { className: 'wc-elapsed-timer', 'aria-live': 'off' }, getElapsed(booking.startedAt));
      timerInterval = setInterval(() => {
        timerOutput.textContent = getElapsed(booking.startedAt);
      }, 1000);

      activeJobTimerBlock = h('section', { className: 'wc-active-job-banner' },
        h('div', { className: 'wc-timer-row' },
          h('span', { className: 'wc-live-dot' }),
          timerOutput
        ),
        h('p', { className: 'wc-lead' }, en.worker.workInProgress),
        Button({
          label: `⚠ ${en.worker.reportProblem}`,
          variant: 'outline',
          onClick: (e) => ReportSheet({
            booking,
            trigger: e.currentTarget,
            onReport: async (rep) => {
              await bookingsApi.reportBooking(booking.id, rep, token());
              toast(en.worker.reportSuccess, 'success');
            }
          })
        })
      );
    }

    const actions = [];
    if (booking.status === 'confirmed') {
      actions.push(
        Button({
          label: en.worker.arrivedBtn,
          className: 'wc-full',
          onClick: (e) => StartCodeSheet({
            booking,
            trigger: e.currentTarget,
            onStart: async (data) => {
              const res = await bookingsApi.startBooking(booking.id, data, token());
              toast(en.worker.startSuccess, 'success');
              await load();
              return res;
            }
          })
        }),
        Button({
          label: en.bookings.actionCancelConfirmed,
          variant: 'ghost',
          onClick: () => ConfirmSheet({
            title: en.bookingDetail.cancelConfirmTitle,
            body: `${en.bookingDetail.cancelConfirmBody} ${en.worker.cancelWarning}`,
            confirmLabel: en.common.confirm,
            onConfirm: async () => {
              try {
                const res = await bookingsApi.cancelBooking(booking.id, token());
                toast(res.penaltyMessage || en.bookings.liveCancelled, 'warning');
                navigate('/w/work');
              } catch (err) {
                toast(friendlyError(err), 'error');
              }
            }
          })
        })
      );
    }

    root.replaceChildren(
      h('button', { type: 'button', className: 'wc-text-back', onClick: () => navigate('/w/work') }, `← ${en.common.back}`),
      h('section', { className: 'wc-booking-summary' },
        h('div', { className: 'wc-booking-summary-top' },
          h('div', { className: 'wc-booking-summary-worker' },
            Avatar({ name: customerFirstName }),
            h('div', {},
              h('p', { className: 'wc-eyebrow' }, formatSkill(booking.skill)),
              h('h2', {}, customerFirstName)
            )
          ),
          Badge({ label: formatStatus(booking.status), kind: booking.status === 'confirmed' || booking.status === 'completed' ? 'success' : booking.status === 'in_progress' ? 'clay' : 'neutral' })
        ),
        h('div', { className: 'wc-booking-summary-mid' },
          h('p', { className: 'wc-lead' }, `📅 ${formatBookingDate(booking.scheduledAt || booking.createdAt)} · ⏱ ${booking.hours || 1} hrs`),
          h('div', { className: 'wc-rate-badge' },
            h('strong', {}, formatMoney(totalCash)),
            h('small', {}, `(${formatMoney(booking.rate)}/${booking.rateUnit || 'day'})`)
          )
        )
      ),
      activeJobTimerBlock,
      h('section', { className: 'wc-profile-section' },
        h('h2', {}, 'Cash Collection'),
        h('p', { className: 'wc-cash-notice' }, `💵 ${en.worker.collectCash.replace('{amount}', formatMoney(totalCash).replace('₹', ''))}`)
      ),
      booking.status === 'confirmed' ? h('section', { className: 'wc-profile-section' },
        h('h2', {}, 'Start Code'),
        h('p', { className: 'wc-hint' }, en.worker.askStartCode)
      ) : null,
      h('section', { className: 'wc-profile-section' },
        h('h2', {}, 'Contact Customer'),
        contactSection
      ),
      h('section', { className: 'wc-profile-section' },
        h('h2', {}, 'Location'),
        directionsSection
      ),
      actions.length ? h('div', { className: 'wc-detail-actions' }, ...actions) : null
    );
  }

  function renderCompletionSheet(booking) {
    const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-completion-sheet' });
    dialog.append(
      h('div', { className: 'wc-modal-head' },
        h('h2', {}, '🎉 Job Finished!'),
        Button({ label: en.common.close, variant: 'ghost', onClick: () => { dialog.close(); dialog.remove(); } })
      ),
      h('div', { className: 'wc-modal-body wc-form' },
        h('p', { className: 'wc-lead' }, en.worker.jobDoneTitle.replace('{amount}', String(booking.amountPaid || booking.rate))),
        h('p', { className: 'wc-hint' }, en.worker.jobDonePassport),
        booking.rating ? h('p', { className: 'wc-rating' }, `Rating received: ${booking.rating}★`) : null,
        Button({
          label: en.worker.viewPassport,
          className: 'wc-full',
          onClick: () => { dialog.close(); dialog.remove(); navigate('/w/passport'); }
        })
      )
    );
    document.body.append(dialog);
    dialog.showModal();
  }

  function getElapsed(startedIso) {
    const ms = Math.max(0, Date.now() - new Date(startedIso).getTime());
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  void load();
  return page;
}
