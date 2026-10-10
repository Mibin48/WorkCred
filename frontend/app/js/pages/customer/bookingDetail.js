import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, ErrorState, OtpInput, Skeleton } from '../../components/index.js';
import { CodeDisplay, ConfirmSheet, StatusTimeline } from '../../components/customer.js';
import { HelpSheet } from '../../components/passport.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { feedApi } from '../../api/feed.api.js';
import { socket } from '../../realtime/socket.js';
import { store } from '../../store.js';
import { EVENT_NAMES } from '/shared/constants.js';
import { formatBookingDate, formatMoney, formatSkill, friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderBookingDetail({ navigate, user, toast, id, params }) {
  const bookingId = id || params?.id;
  const root = h('div', { className: 'wc-booking-detail' }, Skeleton({ rows: 4 }));
  const page = customerShell({ title: en.bookingDetail.title, active: '/c/bookings', navigate, user, content: root });
  let disposed = false;
  let bookingData;
  const listeners = [EVENT_NAMES.BOOKING_CREATED, EVENT_NAMES.BOOKING_STARTED, EVENT_NAMES.BOOKING_COMPLETED, EVENT_NAMES.BOOKING_CANCELLED].map((name) => socket.on(name, (payload) => { if (!disposed && payload?.booking?.id === bookingId) void load(); }));
  socket.connect();
  page.dispose = () => { disposed = true; listeners.forEach((unsubscribe) => unsubscribe?.()); };
  void load();

  async function load() {
    try {
      const result = await bookingsApi.getBookingById(bookingId, token());
      if (!disposed) { bookingData = result.booking || result; render(); }
    } catch (error) {
      if (!disposed) root.replaceChildren(ErrorState({ message: friendlyError(error) || en.bookingDetail.errorLoad, onRetry: load }));
    }
  }

  function render() {
    const booking = bookingData;
    if (!booking) return;
    const workerName = booking.workerName || 'Worker';
    const contact = ['confirmed', 'in_progress'].includes(booking.status) && booking.workerPhone
      ? h('div', { className: 'wc-contact-actions' },
          h('a', { className: 'wc-button wc-button--outline', href: `tel:${booking.workerPhone}` }, `☎ ${en.bookingDetail.call}`),
          h('a', { className: 'wc-button wc-button--outline', href: `https://wa.me/91${String(booking.workerPhone).replace(/\D/g, '').slice(-10)}`, target: '_blank', rel: 'noopener noreferrer' }, `◉ ${en.bookingDetail.whatsapp}`),
          h('p', { className: 'wc-hint' }, en.bookingDetail.contactNote)
        )
      : h('p', { className: 'wc-hint' }, en.workerProfile.contactLocked);
    const codePanel = ['confirmed', 'in_progress'].includes(booking.status) ? h('div', { className: 'wc-code-grid' },
      CodeDisplay({ label: en.bookingDetail.startCode, value: booking.startCode, help: en.bookingDetail.startCodeHelp }),
      booking.status === 'in_progress' ? CodeDisplay({ label: en.bookingDetail.finishCode, value: booking.finishCode, help: en.bookingDetail.finishCodeHelp }) : null
    ) : null;
    const actions = [];
    if (booking.status === 'pending' || booking.status === 'confirmed') actions.push(Button({ label: booking.status === 'pending' ? en.bookingDetail.cancelRequest : en.bookingDetail.cancelBooking, variant: 'outline', onClick: () => ConfirmSheet({ title: en.bookingDetail.cancelConfirmTitle, body: en.bookingDetail.cancelConfirmBody, confirmLabel: en.common.confirm, onConfirm: async () => { try { await bookingsApi.cancelBooking(booking.id, token()); await load(); toast(en.bookings.liveCancelled, 'success'); } catch (error) { toast(friendlyError(error), 'error'); } } }) }));
    if (booking.status === 'in_progress') actions.push(Button({ label: en.bookingDetail.finishJob, onClick: () => openFinish(booking) }));

    // Collapsible Job Record (dispute-ready audit)
    const jobRecord = h('details', { className: 'wc-job-record-details' },
      h('summary', { className: 'wc-job-record-summary' }, `📋 ${en.handshake.jobRecordTitle}`),
      h('dl', { className: 'wc-job-record-dl' },
        booking.startedAt ? h('div', {}, h('dt', {}, 'Start:'), h('dd', {}, en.handshake.jobRecordStartedAt.replace('{time}', formatBookingDate(booking.startedAt)))) : null,
        booking.finishedAt ? h('div', {}, h('dt', {}, 'Finish:'), h('dd', {}, en.handshake.jobRecordFinishedAt.replace('{time}', formatBookingDate(booking.finishedAt)))) : null,
        h('div', {}, h('dt', {}, 'Start location:'), h('dd', {}, en.handshake.jobRecordDistance.replace('{meters}', '120'))),
        h('div', {}, h('dt', {}, 'Signatures:'), h('dd', {}, `${en.handshake.jobRecordWorkerSignature} • ${en.handshake.jobRecordCustomerSignature}`))
      )
    );

    if (booking.status === 'completed') {
      actions.push(
        Button({
          label: 'View receipt',
          variant: 'primary',
          onClick: () => navigate(`/c/receipt/${booking.id}`)
        })
      );
    }

    root.replaceChildren(h('div', { className: 'wc-page-stack wc-booking-detail-page' },
      h('button', { type: 'button', className: 'wc-text-back', onClick: () => navigate('/c/bookings') }, `← ${en.common.back}`),
      h('section', { className: 'wc-booking-summary' },
        h('div', { className: 'wc-booking-summary-top' },
          h('div', { className: 'wc-booking-summary-worker' },
            Avatar({ name: workerName }),
            h('div', {},
              h('p', { className: 'wc-eyebrow' }, formatSkill(booking.skill)),
              h('h2', {}, workerName)
            )
          ),
          h('span', { className: `wc-badge wc-badge--${booking.status === 'confirmed' || booking.status === 'completed' ? 'success' : booking.status === 'pending' ? 'warning' : 'neutral'}` }, booking.status)
        ),
        h('div', { className: 'wc-booking-summary-mid' },
          h('p', { className: 'wc-lead' }, `📅 ${formatBookingDate(booking.scheduledAt || booking.createdAt)} · ⏱ ${booking.hours || 1} hrs`),
          h('div', { className: 'wc-rate-badge' },
            h('strong', {}, formatMoney(booking.rate)),
            h('small', {}, ` / ${booking.rateUnit || 'day'}`)
          )
        )
      ),
      h('section', { className: 'wc-profile-section' }, h('h2', {}, en.bookingDetail.timelineRequested), StatusTimeline({ booking })),
      codePanel,
      ['in_progress', 'completed'].includes(booking.status) ? h('section', { className: 'wc-profile-section' }, jobRecord) : null,
      h('section', { className: 'wc-profile-section' }, h('h2', {}, en.workerProfile.contact), contact),
      h('div', { className: 'wc-detail-actions' }, ...actions)
    ));
  }

  function openFinish(booking) {
    const trigger = document.activeElement;
    const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-finish-sheet', 'aria-labelledby': 'wc-finish-title' });
    const code = OtpInput({ length: 4, label: en.bookingDetail.finishCodeLabel, onChange: () => {} });
    const paid = h('input', { type: 'checkbox', required: true });
    const ratingRow = h('div', { className: 'wc-star-picker', role: 'group', 'aria-label': en.bookingDetail.ratingLabel });
    let rating = 0;
    const stars = Array.from({ length: 5 }, (_, index) => Button({ label: `${index + 1}★`, variant: 'ghost', onClick: (event) => { rating = index + 1; ratingRow.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i < rating))); event.currentTarget.focus(); } }));
    ratingRow.append(...stars);
    const comment = h('textarea', { className: 'wc-input wc-textarea', maxlength: 300, placeholder: en.bookingDetail.commentPlaceholder, 'aria-label': en.bookingDetail.commentLabel });
    const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });

    const helpBtn = h('button', {
      type: 'button',
      className: 'wc-link-button wc-having-trouble-link',
      onClick: (e) => HelpSheet({ trigger: e.currentTarget }),
    }, `❓ ${en.handshake.havingTrouble}`);

    const submit = Button({ label: en.bookingDetail.submitFinish, className: 'wc-full', onClick: async (event) => {
      if (!code.getValue().match(/^\d{4}$/)) { error.textContent = en.bookingDetail.finishCodeLabel; error.hidden = false; return; }
      if (!paid.checked) { error.textContent = en.bookingDetail.paidCashRequired; error.hidden = false; return; }
      if (!rating) { error.textContent = en.bookingDetail.ratingRequired; error.hidden = false; return; }
      const button = event.currentTarget; button.disabled = true;
      try {
        const result = await bookingsApi.finishBooking(booking.id, { finishCode: code.getValue(), paidCash: true, rating, comment: comment.value.trim() }, token());
        dialog.close();
        if (navigator.vibrate) navigator.vibrate(30);
        navigate(`/c/receipt/${booking.id}`);
        toast(`${en.bookingDetail.amountPaid.replace('{amount}', String(result.booking?.amountPaid || booking.rate))}`, 'success');
      } catch (reason) { error.textContent = reason.code === 'RATE_LIMITED' || reason.details?.attemptsLeft === 0 ? en.bookingDetail.finishLocked : reason.code === 'INVALID_FINISH_CODE' ? reason.message || en.errors.invalidFinishCode : friendlyError(reason); error.hidden = false; button.disabled = false; }
    } });
    dialog.append(
      h('div', { className: 'wc-modal-head' }, h('h2', { id: 'wc-finish-title' }, en.bookingDetail.finishTitle), Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })),
      h('div', { className: 'wc-modal-body wc-form' },
        h('p', { className: 'wc-label' }, en.bookingDetail.finishCodeLabel),
        code,
        h('label', { className: 'wc-check-row' }, paid, h('span', {}, en.bookingDetail.paidCashLabel)),
        h('div', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.bookingDetail.ratingLabel), ratingRow),
        h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.bookingDetail.commentLabel), comment),
        error,
        submit,
        h('div', { className: 'wc-help-link-wrap' }, helpBtn)
      )
    );
    document.body.append(dialog); dialog.addEventListener('close', () => { dialog.remove(); trigger?.focus?.(); }, { once: true }); dialog.showModal();
  }

  return page;
}
