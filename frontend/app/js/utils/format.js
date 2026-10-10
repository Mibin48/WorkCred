/** Format ₹ with Indian digit grouping */
export const formatMoney = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount) || 0);

/** Alias kept for backward compat */
export const formatRupees = formatMoney;

/**
 * Format a booking date/time as "Today 4 PM", "Tomorrow 9 AM", "Mon 12 Oct, 9 AM".
 * @param {string|Date} date
 */
export function formatBookingDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '—';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const dayAfterStart = new Date(todayStart.getTime() + 2 * 86400000);

  const timeStr = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d).replace(':00', '').replace('am', 'AM').replace('pm', 'PM').trim();

  if (d >= todayStart && d < tomorrowStart) return `Today ${timeStr}`;
  if (d >= tomorrowStart && d < dayAfterStart) return `Tomorrow ${timeStr}`;

  const dayName = new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(d);
  const dayNum = d.getDate();
  const monthName = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(d);
  return `${dayName} ${dayNum} ${monthName}, ${timeStr}`;
}

/**
 * Format a date only as "Today", "Tomorrow", or "Mon 12 Oct".
 */
export function formatDateOnly(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '—';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const dayAfterStart = new Date(todayStart.getTime() + 2 * 86400000);
  if (d >= todayStart && d < tomorrowStart) return 'Today';
  if (d >= tomorrowStart && d < dayAfterStart) return 'Tomorrow';
  const dayName = new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(d);
  const dayNum = d.getDate();
  const monthName = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(d);
  return `${dayName} ${dayNum} ${monthName}`;
}

/** Format today's time */
export function formatToday(date = new Date()) {
  return `Today ${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(date)}`;
}

/**
 * Approximate distance label — uses shared roundedDistanceLabel pattern.
 * @param {number} km
 */
export function formatDistance(km) {
  const n = Number(km);
  if (isNaN(n)) return '';
  if (n < 0.5) return 'less than 1 km away';
  if (n < 1.5) return 'about 1 km away';
  return `about ${Math.round(n)} km away`;
}

/** Convert skill key to display label */
export function formatSkill(skillKey) {
  const map = {
    helper: 'Helper', electrician: 'Electrician', plumber: 'Plumber',
    mason: 'Mason', painter: 'Painter', carpenter: 'Carpenter',
    cook: 'Cook', cleaner: 'Cleaner', driver: 'Driver', vendor: 'Vendor', other: 'Other',
  };
  return map[String(skillKey).toLowerCase()] ?? skillKey;
}

/** Format rate as "₹750 / day" or "₹95 / hr" */
export function formatRate(rate, rateUnit) {
  const unit = rateUnit === 'hour' ? 'hr' : 'day';
  return `${formatMoney(rate)} / ${unit}`;
}

/** Booking status → display label */
export function formatStatus(status) {
  const map = {
    pending: 'Requested', confirmed: 'Confirmed', in_progress: 'In progress',
    completed: 'Done', cancelled: 'Cancelled', no_show: 'No show',
  };
  return map[status] ?? status;
}

/** Map API error code to a plain-English message */
export function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const code = err.code ?? err;
  const msgMap = {
    NETWORK_ERROR: 'We could not connect. Check your connection and try again.',
    UNAUTHENTICATED: 'Please log in to continue.',
    FORBIDDEN: 'You do not have permission for this action.',
    NOT_FOUND: 'Could not find that. It may have been removed.',
    ALREADY_BOOKED: 'This worker is already busy at that time. Try a different time.',
    OVERLAPPING_BOOKING: 'You already have a booking at that time.',
    INVALID_START_CODE: err.message || 'That start code is not correct.',
    INVALID_FINISH_CODE: err.message || 'That finish code is not correct.',
    RATE_LIMITED: 'Too many attempts. This is now locked.',
    DUPLICATE_ENDORSEMENT: 'You have already endorsed this worker for that skill.',
    JOB_FILLED: 'This job has already been filled.',
    INVALID_TRANSITION: 'This action is not allowed in the current status.',
    VALIDATION_ERROR: err.message || 'Please check your inputs.',
    SERVER_ERROR: 'Something went wrong on our end. Please try again.',
  };
  return msgMap[code] ?? err.message ?? 'Something went wrong. Please try again.';
}
