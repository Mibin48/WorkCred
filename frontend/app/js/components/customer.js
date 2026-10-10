import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { Avatar, Badge, Button, Chip, StarRating } from './index.js';
import { formatBookingDate, formatDistance, formatMoney, formatSkill, formatStatus } from '../utils/format.js';

function showSheet(dialog, trigger) {
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger?.focus?.();
  }, { once: true });
  dialog.showModal();
}

export function SegmentedTabs({ items, active, onChange, label }) {
  const tabs = items.map((item) => h('button', {
    type: 'button', role: 'tab', className: `wc-segment-tab${item.id === active ? ' is-active' : ''}`,
    'aria-selected': String(item.id === active), tabindex: item.id === active ? '0' : '-1',
    onClick: () => onChange(item.id),
    onKeydown: (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = (items.findIndex((entry) => entry.id === active) + delta + items.length) % items.length;
      onChange(items[next].id);
      event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
    },
  }, item.label));
  return h('div', { className: 'wc-segmented-tabs', role: 'tablist', 'aria-label': label }, tabs);
}

export function RangeSlider({ label, min = 0, max = 2000, minValue = 0, maxValue = 2000, onChange }) {
  let lower = Number(minValue);
  let upper = Number(maxValue);
  const lowOutput = h('output', { className: 'wc-range-value' }, formatMoney(lower));
  const highOutput = h('output', { className: 'wc-range-value' }, formatMoney(upper));
  const lowInput = h('input', { type: 'range', min, max, value: lower, 'aria-label': `${label} minimum`, onInput: (event) => {
    lower = Math.min(Number(event.currentTarget.value), upper);
    event.currentTarget.value = String(lower);
    lowOutput.textContent = formatMoney(lower);
    onChange?.({ min: lower, max: upper });
  } });
  const highInput = h('input', { type: 'range', min, max, value: upper, 'aria-label': `${label} maximum`, onInput: (event) => {
    upper = Math.max(Number(event.currentTarget.value), lower);
    event.currentTarget.value = String(upper);
    highOutput.textContent = formatMoney(upper);
    onChange?.({ min: lower, max: upper });
  } });
  return h('div', { className: 'wc-range-field' }, h('span', { className: 'wc-label' }, label), h('div', { className: 'wc-dual-range' }, lowInput, highInput), h('div', { className: 'wc-range-values' }, lowOutput, highOutput));
}

export function SearchField({ value = '', onInput, suggestions = [] }) {
  const listId = `wc-suggestions-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', { className: 'wc-input wc-search-input', type: 'search', value, placeholder: 'Master Electrician, Indiranagar', autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': listId, 'aria-expanded': 'false', onInput: (event) => { renderSuggestions(event.currentTarget.value); onInput(event.currentTarget.value); } });
  const list = h('div', { id: listId, className: 'wc-search-suggestions', role: 'listbox', hidden: true });
  function renderSuggestions(query) {
    const matches = query.trim() ? suggestions.filter((entry) => entry.label.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [];
    list.replaceChildren(...matches.map((entry) => h('button', { type: 'button', role: 'option', className: 'wc-search-suggestion', onClick: () => { input.value = entry.label; list.hidden = true; input.setAttribute('aria-expanded', 'false'); onInput(entry.value); } }, entry.label)));
    list.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(matches.length > 0));
  }
  return h('div', { className: 'wc-search-field' }, h('span', { className: 'wc-search-icon', 'aria-hidden': 'true' }, '⌕'), input, list);
}

export function FilterSheet({ state, count = 0, trigger, onApply, onPreview }) {
  const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-filter-sheet', 'aria-labelledby': 'wc-filter-title' });
  let skills = [...(state.skills || [])];
  const km = h('input', { type: 'range', min: 1, max: 10, value: state.radiusKm ?? 5, 'aria-label': en.filters.distance, onInput: (event) => { kmValue.textContent = `${event.currentTarget.value} km`; } });
  const kmValue = h('output', { className: 'wc-range-value' }, `${km.value} km`);
  const minRate = h('input', { className: 'wc-input', type: 'number', min: 0, max: 2000, value: state.minRate || '', placeholder: '0', 'aria-label': en.filters.priceMin });
  const maxRate = h('input', { className: 'wc-input', type: 'number', min: 0, max: 2000, value: state.maxRate || '', placeholder: '2000', 'aria-label': en.filters.priceMax });
  const priceSlider = RangeSlider({ label: en.filters.priceRange, min: 0, max: 2000, minValue: state.minRate || 0, maxValue: state.maxRate || 2000, onChange: ({ min, max }) => { minRate.value = String(min); maxRate.value = max >= 2000 ? '' : String(max); } });
  const skillGroup = h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': en.filters.skill }, en.skillsArray.map((label, index) => {
    const value = Object.keys(en.skills)[index];
    return Chip({ label, selected: skills.includes(value), onClick: (event) => { const button = event.currentTarget; if (skills.includes(value)) skills = skills.filter((skill) => skill !== value); else skills.push(value); button.classList.toggle('is-selected', skills.includes(value)); button.setAttribute('aria-pressed', String(skills.includes(value))); schedulePreview(); } });
  }));
  const rating = h('select', { className: 'wc-input', 'aria-label': en.filters.minRating }, [
    ['0', en.filters.ratingAny], ['3', en.filters.rating3], ['4', en.filters.rating4], ['4.5', en.filters.rating4h],
  ].map(([value, label]) => h('option', { value, selected: String(state.minRating ?? 0) === value }, label)));
  const sort = h('select', { className: 'wc-input', 'aria-label': en.filters.sortBy }, [
    ['distance', en.filters.sortNearest], ['rating', en.filters.sortRated], ['price', en.filters.sortPrice],
  ].map(([value, label]) => h('option', { value, selected: (state.sortBy || 'distance') === value }, label)));
  const apply = Button({ label: en.filters.showResults.replace('{count}', String(count)), className: 'wc-full', onClick: () => { onApply(draft()); dialog.close(); } });
  let previewTimer;
  let previewVersion = 0;
  function draft() { return { ...state, skills, radiusKm: Number(km.value), minRate: Number(minRate.value) || 0, maxRate: Number(maxRate.value) || 0, minRating: Number(rating.value), sortBy: sort.value }; }
  function schedulePreview() {
    if (!onPreview) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const version = ++previewVersion;
      try { const nextCount = await onPreview(draft()); if (version === previewVersion) apply.textContent = en.filters.showResults.replace('{count}', String(nextCount)); }
      catch { /* keep the last available count when preview is temporarily unavailable */ }
    }, 250);
  }
  [km, minRate, maxRate, rating, sort].forEach((input) => input.addEventListener('input', schedulePreview));
  [rating, sort].forEach((input) => input.addEventListener('change', schedulePreview));
  priceSlider.querySelectorAll?.('input').forEach((input) => input.addEventListener('input', schedulePreview));
  dialog.append(h('div', { className: 'wc-modal-head' }, h('h2', { id: 'wc-filter-title' }, en.filters.title), Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })),
    h('div', { className: 'wc-modal-body wc-filter-fields' },
      h('section', { className: 'wc-section-block' }, h('h3', {}, en.filters.skill), skillGroup),
      h('label', { className: 'wc-range-field' }, h('span', { className: 'wc-label' }, en.filters.distance), km, kmValue),
      h('fieldset', { className: 'wc-range-pair' }, h('legend', { className: 'wc-label' }, en.filters.priceRange), priceSlider, minRate, maxRate),
      h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.filters.minRating), rating),
      h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.filters.sortBy), sort),
      h('div', { className: 'wc-sheet-actions' }, Button({ label: en.filters.clearAll, variant: 'ghost', onClick: () => { skills = []; onApply({ ...state, q: '', skills: [], radiusKm: 5, minRate: 0, maxRate: 0, minRating: 0, sortBy: 'distance' }); dialog.close(); } }), apply)
    ));
  showSheet(dialog, trigger);
  return dialog;
}

export function LocalityPicker({ value = '', trigger, onSelect }) {
  const choices = ['Indiranagar', 'Koramangala', 'HSR Layout', 'Whitefield', 'Jayanagar', 'Shivajinagar', 'Kothrud', 'Deccan', 'Baner'];
  const select = h('select', { className: 'wc-input', value: choices.includes(value) ? value : 'Indiranagar', 'aria-label': en.location.pickArea }, choices.map((area) => h('option', { value: area }, area)));
  const status = h('p', { className: 'wc-hint', role: 'status', hidden: true });
  const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet', 'aria-labelledby': 'wc-locality-title' },
    h('div', { className: 'wc-modal-head' }, h('h2', { id: 'wc-locality-title' }, en.location.pickArea), Button({ label: en.common.close, variant: 'ghost', onClick: (event) => event.currentTarget.closest('dialog').close() })),
    h('div', { className: 'wc-modal-body wc-form' },
      Button({ label: en.location.useLocation, variant: 'outline', onClick: async (event) => { const button = event.currentTarget; button.disabled = true; try { const { requestLocation, localityFromCoords } = await import('../utils/geo.js'); const point = await requestLocation(); select.value = localityFromCoords(point.lat, point.lng); } catch { status.textContent = en.location.denied; status.hidden = false; } finally { button.disabled = false; } } }),
      status, select,
      Button({ label: en.common.save, className: 'wc-full', onClick: () => { onSelect(select.value); dialog.close(); } })
    ));
  showSheet(dialog, trigger);
  return dialog;
}

export function DayTimePicker({ onChange, date = '', time = '' }) {
  const base = new Date();
  const localDate = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const dateValue = date || localDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
  const dateInput = h('input', { className: 'wc-input', type: 'date', min: localDate(base), max: localDate(new Date(Date.now() + 30 * 86400000)), value: dateValue, 'aria-label': en.bookingSheet.pickDate, onChange: update });
  const timeInput = h('input', { className: 'wc-input', type: 'time', value: time || '09:00', 'aria-label': en.bookingSheet.custom, onChange: update });
  const quickDays = h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': en.bookingSheet.dayLabel }, [0, 1, 2].map((offset) => {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const value = localDate(day);
    const label = offset === 0 ? en.bookingSheet.today : offset === 1 ? en.bookingSheet.tomorrow : day.toLocaleDateString('en-IN', { weekday: 'short' });
    return Chip({ label, selected: dateValue === value, onClick: () => { dateInput.value = value; update(); } });
  }));
  const quickTimes = h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': en.bookingSheet.timeLabel }, [[8, en.bookingSheet.morning], [13, en.bookingSheet.afternoon], [17, en.bookingSheet.evening]].map(([hour, label]) => Chip({ label, selected: timeInput.value === `${String(hour).padStart(2, '0')}:00`, onClick: () => { timeInput.value = `${String(hour).padStart(2, '0')}:00`; update(); } })));
  function update() { onChange?.({ date: dateInput.value, time: timeInput.value }); }
  return h('div', { className: 'wc-day-time-picker' }, h('div', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.bookingSheet.dayLabel), quickDays, dateInput), h('div', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.bookingSheet.timeLabel), quickTimes, timeInput));
}

export function Stepper({ label, value = 1, min = 1, max = 12, onChange }) {
  const output = h('output', { 'aria-live': 'polite' }, String(value));
  const change = (next) => { value = Math.min(max, Math.max(min, next)); output.textContent = String(value); onChange?.(value); };
  return h('div', { className: 'wc-stepper' }, h('span', { className: 'wc-label' }, label), h('div', { className: 'wc-stepper-controls' },
    h('button', { type: 'button', className: 'wc-stepper-button', 'aria-label': `${en.common.decrease} ${label}`, onClick: () => change(value - 1) }, '−'), output,
    h('button', { type: 'button', className: 'wc-stepper-button', 'aria-label': `${en.common.increase} ${label}`, onClick: () => change(value + 1) }, '+')
  ));
}

export function CompassBar({ data, rate }) {
  const verdict = data?.verdict?.level ?? data?.verdict ?? 'fair';
  const label = verdict === 'low' ? en.compass.low : verdict === 'high' ? en.compass.high : en.compass.fair;
  const low = Number(data?.low ?? data?.p25 ?? 500);
  const high = Number(data?.high ?? data?.p75 ?? 650);
  const marker = Math.max(3, Math.min(97, ((Number(rate) - low) / Math.max(1, high - low)) * 100));
  const kind = verdict === 'low' ? 'warning' : verdict === 'high' ? 'clay' : 'success';
  return h('section', { className: `wc-compass wc-compass--${kind}`, 'aria-label': `${label}, between ${low} and ${high} rupees` },
    h('div', { className: 'wc-compass-heading' }, h('strong', {}, `${verdict === 'low' ? '↓' : verdict === 'high' ? '↑' : '✓'} ${label}`), h('span', {}, `${formatMoney(low)} — ${formatMoney(high)}`)),
    h('div', { className: 'wc-compass-track' }, h('span', { className: 'wc-compass-marker', style: `left:${marker}%` })),
    data?.isSeed || data?.source === 'seed' ? h('p', { className: 'wc-hint' }, en.compass.sample) : null
  );
}

/**
 * Civic Credential Registry Worker Card
 */
export function WorkerCard({ worker, onOpen, onSave, onBook }) {
  const save = h('button', {
    type: 'button',
    className: `wc-save-button${worker.isSaved ? ' is-saved' : ''}`,
    'aria-label': worker.isSaved ? en.find.unsave : en.find.saved,
    'aria-pressed': String(Boolean(worker.isSaved)),
    onClick: (event) => {
      event.stopPropagation();
      onSave?.(worker, event.currentTarget);
    }
  }, worker.isSaved ? '♥' : '♡');

  const distanceStr = worker.distanceKm != null ? formatDistance(worker.distanceKm) : '1.2 km away';
  const areaStr = worker.area || 'HAL 2nd Stg';
  const locationLabel = `${distanceStr} (${areaStr})`;
  const hourlyRate = worker.rateUnit === 'hour' ? worker.rate : Math.round((worker.rate || 1400) / 8);

  // Skill specializations tags
  const specTags = worker.specializations || [
    'MCB Tripping',
    'Inverter Setup',
    'Three-Phase Balance',
    'Concealed Wiring'
  ];

  const entriesCount = worker.jobsCompleted ?? worker.passportEntriesCount ?? 32;
  const content = h('div', { className: 'wc-registry-card-inner' },
    // Worker Identity & Avatar + Save Heart Button
    h('div', { className: 'wc-registry-card-identity' },
      h('div', { className: 'wc-avatar-wrap' },
        worker.photoUrl
          ? h('img', { className: 'wc-avatar wc-avatar-photo', src: worker.photoUrl, alt: '' })
          : Avatar({ name: worker.name }),
        h('span', { className: 'wc-avatar-badge-icon' }, '✓')
      ),
      h('div', { className: 'wc-identity-copy' },
        h('div', { className: 'wc-identity-name-row' },
          h('h3', { className: 'wc-artisan-name' }, worker.name),
          worker.tier ? h('span', { className: 'wc-tier-tag' }, worker.tier) : (worker.area ? h('span', { className: 'wc-exp-tag' }, worker.area) : null)
        ),
        h('p', { className: 'wc-trade-subtitle' }, worker.tradeTitle || formatSkill(worker.skills?.[0] || 'electrician')),
        h('div', { className: 'wc-civic-meta-row' },
          h('span', { className: 'wc-rating-star' }, `★ ${worker.rating ?? '4.9'}`),
          h('span', { className: 'wc-jobs-count-text' }, `(${entriesCount} jobs)`),
          h('span', { className: 'wc-meta-dot' }, '•'),
          h('span', { className: 'wc-distance-text' }, `📍 about ${distanceStr}`)
        )
      ),
      save
    ),

    // Status Pills: Verified Passport + Free Now / Timing
    h('div', { className: 'wc-registry-card-status' },
      h('span', { className: 'wc-civic-badge' },
        h('span', { className: 'wc-badge-icon', 'aria-hidden': 'true' }, '✓'),
        `Verified Passport (${entriesCount} entries)`
      ),
      worker.isFreeNow
        ? h('span', { className: 'wc-free-pill' }, h('span', { className: 'wc-live-dot' }), 'Free now')
        : h('span', { className: 'wc-time-pill' }, '⏱ Next slot: Today, 3:30 PM')
    ),

    // Bottom Row: Rate + Ledger Button + Book Button
    h('div', { className: 'wc-card-bottom-row' },
      h('div', { className: 'wc-card-rate-block' },
        h('div', { className: 'wc-card-rate-main' },
          h('strong', { className: 'wc-rate-amount' }, `₹${hourlyRate}`),
          h('span', { className: 'wc-rate-unit' }, '/hr')
        ),
        h('span', { className: 'wc-fair-rate-badge' }, '⚖ Fair rate')
      ),
      h('div', { className: 'wc-card-actions-group' },
        h('button', {
          type: 'button',
          className: 'wc-button wc-button--outline wc-ledger-btn-mobile',
          onClick: (e) => {
            e.stopPropagation();
            onOpen?.();
          }
        }, h('span', {}, '📖 Ledger')),
        h('button', {
          type: 'button',
          className: 'wc-button wc-button--primary wc-book-btn-mobile',
          onClick: (e) => {
            e.stopPropagation();
            if (onBook) onBook(worker);
            else onOpen?.();
          }
        }, 'Book Now →')
      )
    )
  );

  const card = h('article', {
    className: 'wc-registry-card',
    'aria-label': `${worker.name}, ${formatSkill(worker.skills?.[0] || 'helper')}`,
    onClick: onOpen
  }, content);

  return card;
}

export function BookingCard({ booking, worker, onOpen, onAction }) {
  const status = booking.status;
  const action = status === 'pending' ? en.bookings.actionCancel : status === 'confirmed' ? en.bookings.actionCancelConfirmed : status === 'in_progress' ? en.bookings.actionFinish : en.bookings.actionViewDetail;
  const workerName = worker?.name || booking.workerName || 'Worker';
  return h('article', { className: `wc-booking-card wc-booking-card--${status}` },
    h('button', { type: 'button', className: 'wc-booking-card-main', onClick: onOpen },
      h('div', { className: 'wc-booking-head' },
        Avatar({ name: workerName }),
        h('div', { className: 'wc-booking-info' },
          h('strong', {}, workerName),
          h('span', { className: 'wc-booking-skill-tag' }, `${formatSkill(booking.skill || worker?.skills?.[0])}`),
          h('span', { className: 'wc-booking-date' }, `📅 ${formatBookingDate(booking.scheduledAt || booking.createdAt)}`)
        )
      ),
      h('div', { className: 'wc-booking-details-row' },
        h('span', { className: 'wc-booking-hours' }, `⏱ ${booking.hours || 1} hrs`),
        h('strong', { className: 'wc-booking-amount' }, formatMoney(booking.rate)),
        Badge({ label: formatStatus(status), kind: status === 'confirmed' || status === 'completed' ? 'success' : status === 'pending' ? 'warning' : 'neutral' })
      )
    ),
    h('div', { className: 'wc-booking-actions' },
      Button({ label: action, variant: status === 'in_progress' ? 'primary' : 'outline', onClick: (event) => { event.stopPropagation(); onAction?.(booking); } })
    )
  );
}

export function CodeDisplay({ label, value, help }) {
  let timer;
  const digits = h('span', { className: 'wc-code-digits', 'aria-live': 'polite' }, '••••');
  let visible = false;

  const toggleBtn = Button({
    label: en.bookingDetail.showCode,
    variant: 'outline',
    onClick: () => {
      visible = !visible;
      clearTimeout(timer);
      digits.textContent = visible ? String(value || '----') : '••••';
      toggleBtn.textContent = visible ? en.handshake.hideNow : en.bookingDetail.showCode;
      if (visible) {
        timer = setTimeout(() => {
          visible = false;
          digits.textContent = '••••';
          toggleBtn.textContent = en.bookingDetail.showCode;
        }, 30000);
      }
    }
  });

  return h('section', { className: 'wc-code-display' },
    h('h3', {}, label),
    digits,
    help ? h('p', { className: 'wc-hint' }, help) : null,
    toggleBtn
  );
}

export function StatusTimeline({ booking }) {
  const stages = [
    ['pending', en.bookingDetail.timelineRequested, booking.createdAt], ['confirmed', en.bookingDetail.timelineConfirmed, booking.confirmedAt],
    ['in_progress', en.bookingDetail.timelineStarted, booking.startedAt], ['completed', en.bookingDetail.timelineFinished, booking.finishedAt],
  ];
  const order = ['pending', 'confirmed', 'in_progress', 'completed'];
  const current = order.indexOf(booking.status);
  return h('ol', { className: 'wc-status-timeline' }, stages.map(([, label, date], index) => h('li', { className: index <= current ? 'is-complete' : '' }, h('span', { className: 'wc-timeline-mark', 'aria-hidden': 'true' }, index <= current ? '✓' : '·'), h('span', {}, label), date ? h('time', { datetime: date }, formatBookingDate(date)) : null)));
}

export function PassportPreview({ entries = [] }) {
  if (!entries.length) return h('section', { className: 'wc-section-block' }, h('h2', {}, en.workerProfile.workPassport), h('p', { className: 'wc-empty-inline' }, en.workerProfile.noPassport));
  return h('section', { className: 'wc-section-block' }, h('h2', {}, en.workerProfile.workPassport), h('ul', { className: 'wc-passport-preview' }, entries.map((entry) => h('li', {}, h('span', { className: 'wc-passport-check', 'aria-hidden': 'true' }, '✓'), h('div', {}, h('strong', {}, formatSkill(entry.skill)), h('span', {}, `${formatBookingDate(entry.createdAt)} · ${entry.hoursWorked} hrs · ${entry.rating}★`), h('small', {}, entry.customerNameMasked || 'Local Customer'))))));
}

export function IntegrityBadge({ valid, loading = false }) {
  return Badge({ label: loading ? en.workerProfile.integrityChecking : valid ? `✓ ${en.workerProfile.integrityBadge}` : en.workerProfile.integrityFailed, kind: loading ? 'neutral' : valid ? 'success' : 'warning' });
}

export function ConfirmSheet({ title, body, confirmLabel = en.common.confirm, trigger = document.activeElement, onConfirm }) {
  const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet', 'aria-labelledby': 'wc-confirm-title' },
    h('div', { className: 'wc-modal-head' }, h('h2', { id: 'wc-confirm-title' }, title), Button({ label: en.common.close, variant: 'ghost', onClick: (event) => event.currentTarget.closest('dialog').close() })),
    h('div', { className: 'wc-modal-body wc-form' }, h('p', { className: 'wc-lead' }, body), h('div', { className: 'wc-sheet-actions' }, Button({ label: en.common.cancel, variant: 'ghost', onClick: (event) => event.currentTarget.closest('dialog').close() }), Button({ label: confirmLabel, onClick: async (event) => { event.currentTarget.disabled = true; try { await onConfirm?.(); dialog.close(); } finally { event.currentTarget.disabled = false; } } })))
  );
  showSheet(dialog, trigger);
  return dialog;
}
