/**
 * Job Receipt Screen (/app/w/receipt/:bookingId & /app/c/receipt/:bookingId)
 * Summary card for completed cash payments and Work Passport records.
 */

import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { workerShell } from '../../layouts/workerShell.js';
import { EmptyState, Skeleton } from '../../components/index.js';
import { ReceiptCard } from '../../components/passport.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { store } from '../../store.js';
import { friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderReceiptPage({ navigate, user, params }) {
  const bookingId = params.bookingId;
  const isWorker = user.role === 'worker';

  const root = h('div', { className: 'wc-page-stack wc-receipt-page' }, Skeleton({ rows: 4 }));

  const page = isWorker
    ? workerShell({ title: en.receipt.title, active: '/w/work', navigate, user, content: root })
    : customerShell({ title: en.receipt.title, active: '/c/bookings', navigate, user, content: root });

  async function load() {
    try {
      const res = await bookingsApi.getBookingById(bookingId, token());
      const booking = res.booking;

      const receipt = ReceiptCard({
        booking,
        isWorker,
        workerName: booking.workerName || 'Worker',
        onViewPassport: () => {
          if (isWorker) {
            navigate('/w/passport');
          } else {
            const slug = booking.workerPassportSlug || `worker-${booking.workerId}`;
            navigate(`/p/${slug}`);
          }
        },
        onBookAgain: !isWorker
          ? () => navigate(`/c/worker/${booking.workerId}`)
          : null,
      });

      root.replaceChildren(receipt);
    } catch (err) {
      root.replaceChildren(
        EmptyState({
          title: en.errors.generic,
          body: friendlyError(err),
          actionLabel: 'Back',
          onAction: () => navigate(isWorker ? '/w/work' : '/c/bookings'),
        })
      );
    }
  }

  void load();
  return page;
}
