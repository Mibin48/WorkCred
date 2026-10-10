import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { Avatar, Badge, Button, Chip, OtpInput } from './index.js';
import { CompassBar } from './customer.js';
import { HelpSheet } from './passport.js';
import { formatBookingDate, formatDistance, formatMoney, formatSkill, formatStatus } from '../utils/format.js';
import { SKILLS } from '/shared/constants.js';

function showSheet(dialog, trigger) {
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger?.focus?.();
  }, { once: true });
  dialog.showModal();
}

/**
 * Free Now Worker Card (Idle, Active with live countdown & ring, Expired, Offline, Booked)
 */
export function FreeNowCard({
  state = 'idle',
  durationHours = 2,
  expiresAt = null,
  bookedNotice = null,
  isOffline = false,
  onStart,
  onExtend,
  onStop,
  onViewRequests,
}) {
  const card = h('section', { className: `wc-free-card wc-free-card--${state}${isOffline ? ' is-offline' : ''}` });

  if (isOffline) {
    card.append(
      h('div', { className: 'wc-offline-note', role: 'status' },
        h('span', { 'aria-hidden': 'true' }, '⚠'),
        h('span', {}, en.worker.freeNowOffline)
      )
    );
  }

  if (state === 'active') {
    let remainingMs = Math.max(0, new Date(expiresAt || Date.now()).getTime() - Date.now());
    const totalDurationMs = (Number(durationHours) || 2) * 3600000;

    const liveDot = h('span', { className: 'wc-live-indicator' },
      h('span', { className: 'wc-live-dot', 'aria-hidden': 'true' }),
      h('strong', {}, en.worker.freeNowLive)
    );

    const timeOutput = h('output', { className: 'wc-countdown-text', 'aria-live': 'polite' }, formatCountdown(remainingMs));
    const circle = h('circle', {
      className: 'wc-ring-bar',
      cx: 32,
      cy: 32,
      r: 28,
      'stroke-dasharray': 175.9,
      'stroke-dashoffset': String(175.9 * (1 - Math.min(1, remainingMs / totalDurationMs))),
    });

    const ringSvg = h('svg', { className: 'wc-countdown-ring', viewBox: '0 0 64 64', 'aria-hidden': 'true' },
      h('circle', { className: 'wc-ring-bg', cx: 32, cy: 32, r: 28 }),
      circle
    );

    const updateTimer = () => {
      remainingMs = Math.max(0, new Date(expiresAt || Date.now()).getTime() - Date.now());
      timeOutput.textContent = formatCountdown(remainingMs);
      const ratio = Math.max(0, Math.min(1, remainingMs / totalDurationMs));
      circle.setAttribute('stroke-dashoffset', String(175.9 * (1 - ratio)));
    };

    const interval = setInterval(updateTimer, 60000);
    card.cleanupTimer = () => clearInterval(interval);

    const actions = h('div', { className: 'wc-free-actions' },
      Button({ label: en.worker.freeNowExtend, variant: 'outline', onClick: onExtend, disabled: isOffline }),
      Button({ label: en.worker.freeNowStop, variant: 'ghost', onClick: onStop })
    );

    const banner = bookedNotice
      ? h('div', { className: 'wc-booked-banner', onClick: onViewRequests },
          h('strong', {}, bookedNotice),
          h('span', {}, 'View requests →')
        )
      : null;

    card.append(
      h('div', { className: 'wc-free-head' }, liveDot, timeOutput),
      h('div', { className: 'wc-free-body' },
        h('div', { className: 'wc-ring-wrap' }, ringSvg),
        h('div', {},
          h('h2', {}, 'You are Free Now'),
          h('p', { className: 'wc-lead' }, en.worker.freeNowActiveSubtitle)
        )
      ),
      banner,
      actions
    );
    return card;
  }

  // Idle state
  let selectedDuration = durationHours;
  const chip2h = Chip({ label: '2 hours', selected: selectedDuration === 2, onClick: () => select(2) });
  const chip4h = Chip({ label: '4 hours', selected: selectedDuration === 4, onClick: () => select(4) });
  const chip8h = Chip({ label: '8 hours', selected: selectedDuration === 8, onClick: () => select(8) });

  function select(hours) {
    selectedDuration = hours;
    [chip2h, chip4h, chip8h].forEach((c, idx) => {
      const active = [2, 4, 8][idx] === hours;
      c.classList.toggle('is-selected', active);
      c.setAttribute('aria-pressed', String(active));
    });
  }

  const startBtn = Button({
    label: en.worker.freeNowBtn,
    className: 'wc-full',
    disabled: isOffline,
    onClick: () => onStart?.(selectedDuration),
  });

  card.append(
    h('h2', {}, en.worker.freeNowTitle),
    h('p', { className: 'wc-lead' }, en.worker.freeNowSubtitle),
    h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': 'Select duration' }, chip2h, chip4h, chip8h),
    startBtn
  );
  return card;
}

function formatCountdown(ms) {
  if (ms <= 0) return '0 min left';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${minutes} min left`;
  return `${minutes} min left`;
}

/**
 * Compact Request Card for "Needs your answer"
 */
export function RequestCard({ booking, onAccept, onDecline }) {
  const customerName = (booking.customerName || 'Customer').split(' ')[0];
  const rateStr = formatMoney(booking.rate);
  const totalStr = formatMoney(Math.round((Number(booking.rate) / (booking.rateUnit === 'hour' ? 1 : 8)) * (booking.hours || 1)));

  return h('article', { className: 'wc-request-card', 'aria-label': `Request from ${customerName}` },
    h('div', { className: 'wc-request-head' },
      Avatar({ name: customerName }),
      h('div', { className: 'wc-request-info' },
        h('strong', {}, customerName),
        h('span', { className: 'wc-request-skill' }, formatSkill(booking.skill)),
        h('span', { className: 'wc-request-timing' }, `📅 ${formatBookingDate(booking.scheduledAt || booking.createdAt)} · ⏱ ${booking.hours || 1} hrs`)
      ),
      h('div', { className: 'wc-request-pay' },
        h('strong', {}, totalStr),
        h('small', {}, `(${rateStr}/${booking.rateUnit || 'day'})`)
      )
    ),
    h('div', { className: 'wc-request-actions' },
      Button({ label: en.worker.decline, variant: 'outline', onClick: () => onDecline?.(booking) }),
      Button({ label: en.worker.accept, variant: 'primary', onClick: () => onAccept?.(booking) })
    )
  );
}

/**
 * Worker Job Card
 */
export function WorkerJobCard({ job, onOpen }) {
  const spotsLeft = Math.max(1, (job.slotsNeeded || 1) - (job.slotsFilled || 0));
  const rateHourly = job.rateUnit === 'hour' ? Number(job.rate) : Math.round(Number(job.rate) / 8);

  return h('article', { className: 'wc-worker-job-card', onClick: onOpen },
    h('div', { className: 'wc-worker-job-main' },
      h('div', { className: 'wc-worker-job-top' },
        h('h3', {}, `${job.slotsNeeded || 1} ${formatSkill(job.skill)}${job.slotsNeeded > 1 ? 's' : ''} needed`),
        Badge({ label: `${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} left`, kind: spotsLeft === 1 ? 'ochre' : 'neutral' })
      ),
      h('p', { className: 'wc-worker-job-meta' },
        h('span', {}, `📅 ${formatBookingDate(job.scheduledAt || job.createdAt)}`),
        h('span', {}, `⏱ ${job.hoursPerWorker || job.hours || 4} hrs`),
        job.distanceKm != null ? h('span', {}, `📍 ${formatDistance(job.distanceKm)}`) : null
      ),
      h('div', { className: 'wc-worker-job-foot' },
        h('div', { className: 'wc-rate-badge' },
          h('strong', {}, formatMoney(rateHourly)),
          h('small', {}, '/ hr')
        ),
        h('span', { className: 'wc-job-open-link' }, 'Details →')
      )
    )
  );
}

/**
 * Job Detail Bottom Sheet for Worker
 */
export function JobDetailSheet({ job, trigger, onAccept }) {
  const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-job-detail-sheet', 'aria-labelledby': 'wc-job-detail-title' });
  const rateHourly = job.rateUnit === 'hour' ? Number(job.rate) : Math.round(Number(job.rate) / 8);
  const totalEst = Math.round(rateHourly * (job.hoursPerWorker || job.hours || 4));

  dialog.append(
    h('div', { className: 'wc-modal-head' },
      h('h2', { id: 'wc-job-detail-title' }, en.worker.jobDetailTitle),
      Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })
    ),
    h('div', { className: 'wc-modal-body wc-form' },
      h('div', { className: 'wc-job-sheet-hero' },
        h('p', { className: 'wc-eyebrow' }, formatSkill(job.skill)),
        h('h3', {}, job.title),
        h('p', { className: 'wc-lead' }, job.description || 'General assignment requested by local customer.')
      ),
      h('div', { className: 'wc-job-sheet-stats' },
        h('div', {}, h('strong', {}, formatBookingDate(job.scheduledAt || job.createdAt)), h('span', {}, 'Start time')),
        h('div', {}, h('strong', {}, `${job.hoursPerWorker || 4} hrs`), h('span', {}, 'Duration')),
        h('div', {}, h('strong', {}, formatMoney(totalEst)), h('span', {}, 'Estimated pay'))
      ),
      h('p', { className: 'wc-hint' }, `Location: ${job.area || 'Pune'}, ${job.city || 'Pune'}`),
      Button({
        label: en.worker.acceptJob,
        className: 'wc-full',
        onClick: async (event) => {
          event.currentTarget.disabled = true;
          try {
            await onAccept?.(job);
            dialog.close();
          } catch {
            event.currentTarget.disabled = false;
          }
        }
      })
    )
  );

  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Start Code Sheet ("I've arrived. Enter start code")
 */
export function StartCodeSheet({ booking, trigger, onStart }) {
  const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-start-sheet', 'aria-labelledby': 'wc-start-code-title' });
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const warning = h('p', { className: 'wc-demo-note', role: 'status', hidden: true });
  let geoPoint = null;

  const otp = OtpInput({ length: 4, label: en.worker.startCodeTitle, onChange: () => {} });

  const submit = Button({
    label: 'Start Job',
    className: 'wc-full',
    onClick: async (event) => {
      const code = otp.getValue();
      if (!code.match(/^\d{4}$/)) {
        error.textContent = 'Enter the 4-digit start code provided by customer.';
        error.hidden = false;
        return;
      }
      error.hidden = true;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const res = await onStart({ startCode: code, lat: geoPoint?.lat, lng: geoPoint?.lng });
        if (res?.distanceWarning) {
          warning.textContent = en.worker.startCodeWarningFar;
          warning.hidden = false;
        }
        dialog.close();
      } catch (err) {
        error.textContent = err.message || en.errors.generic;
        error.hidden = false;
        button.disabled = false;
      }
    }
  });

  // Attempt background low-friction geolocation check
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => { geoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => { /* graceful fallback, no coordinates */ },
      { timeout: 5000 }
    );
  }

  const helpBtn = h('button', {
    type: 'button',
    className: 'wc-link-button wc-having-trouble-link',
    onClick: (e) => HelpSheet({ trigger: e.currentTarget }),
  }, `❓ ${en.handshake.havingTrouble}`);

  dialog.append(
    h('div', { className: 'wc-modal-head' },
      h('h2', { id: 'wc-start-code-title' }, en.worker.startCodeTitle),
      Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })
    ),
    h('div', { className: 'wc-modal-body wc-form' },
      h('p', { className: 'wc-lead' }, en.worker.startCodeBody),
      otp,
      h('p', { className: 'wc-hint' }, en.worker.startCodeLocationHelp),
      warning,
      error,
      submit,
      h('div', { className: 'wc-help-link-wrap' }, helpBtn)
    )
  );

  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Report a Problem Bottom Sheet
 */
export function ReportSheet({ booking, trigger, onReport }) {
  const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-report-sheet', 'aria-labelledby': 'wc-report-title' });
  const select = h('select', { className: 'wc-input', 'aria-label': 'Problem reason' }, [
    ['not_available', en.worker.reportReasonNotAvailable],
    ['different', en.worker.reportReasonDifferent],
    ['safety', en.worker.reportReasonSafety],
    ['other', en.worker.reportReasonOther],
  ].map(([val, label]) => h('option', { value: val }, label)));

  const note = h('textarea', { className: 'wc-input wc-textarea', placeholder: en.worker.reportNotePlaceholder, maxlength: 300 });
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });

  const submit = Button({
    label: en.worker.reportSubmit,
    className: 'wc-full',
    onClick: async (event) => {
      event.currentTarget.disabled = true;
      try {
        await onReport({ reason: select.value, note: note.value.trim() });
        dialog.close();
      } catch (err) {
        error.textContent = err.message || en.errors.generic;
        error.hidden = false;
        event.currentTarget.disabled = false;
      }
    }
  });

  dialog.append(
    h('div', { className: 'wc-modal-head' },
      h('h2', { id: 'wc-report-title' }, en.worker.reportTitle),
      Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })
    ),
    h('div', { className: 'wc-modal-body wc-form' },
      h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, 'Reason'), select),
      h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, 'Details'), note),
      error,
      submit
    )
  );

  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Week Availability Matrix Grid
 */
export function WeekAvailabilityGrid({ value = {}, onChange }) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const state = { ...value };

  const grid = h('div', { className: 'wc-week-grid' }, days.map((day) => {
    const current = state[day] || 'full';
    const chips = ['off', 'morning', 'afternoon', 'evening', 'full'].map((slot) => {
      const label = slot === 'off' ? 'Off' : slot === 'morning' ? 'Morning' : slot === 'afternoon' ? 'Afternoon' : slot === 'evening' ? 'Evening' : 'Full';
      return Chip({
        label,
        selected: current === slot,
        onClick: (e) => {
          state[day] = slot;
          e.currentTarget.parentElement.querySelectorAll('.wc-chip').forEach((c) => {
            c.classList.remove('is-selected');
            c.setAttribute('aria-pressed', 'false');
          });
          e.currentTarget.classList.add('is-selected');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          onChange?.({ ...state });
        }
      });
    });

    return h('div', { className: 'wc-day-row' },
      h('strong', { className: 'wc-day-name' }, day.slice(0, 3).toUpperCase()),
      h('div', { className: 'wc-slot-chips' }, ...chips)
    );
  }));

  return grid;
}

/**
 * Blocked Dates Manager with Undo
 */
export function BlockedDatesList({ dates = [], onAdd, onRemove }) {
  const dateInput = h('input', { type: 'date', className: 'wc-input', min: new Date().toISOString().slice(0, 10) });
  const list = h('ul', { className: 'wc-blocked-list' });

  function renderList() {
    list.replaceChildren(...dates.map((d) => h('li', {},
      h('span', {}, `🚫 ${d}`),
      Button({ label: 'Remove', variant: 'ghost', onClick: () => onRemove(d) })
    )));
    if (!dates.length) {
      list.replaceChildren(h('p', { className: 'wc-hint' }, en.worker.noBlockedDates));
    }
  }

  const addBtn = Button({
    label: en.worker.blockDateBtn,
    variant: 'outline',
    onClick: () => {
      if (dateInput.value && !dates.includes(dateInput.value)) {
        onAdd(dateInput.value);
        dateInput.value = '';
      }
    }
  });

  renderList();

  return h('div', { className: 'wc-blocked-manager' },
    h('div', { className: 'wc-blocked-input-row' }, dateInput, addBtn),
    list
  );
}

/**
 * Skill Picker with Main Skill Marker
 */
export function SkillPicker({ skills = [], mainSkill = '', onChange }) {
  let selected = [...skills];
  let main = mainSkill || selected[0] || 'helper';

  const container = h('div', { className: 'wc-skill-picker' });

  function render() {
    container.replaceChildren(...SKILLS.map((skill) => {
      const isSelected = selected.includes(skill);
      const isMain = isSelected && main === skill;

      return h('div', { className: `wc-skill-option${isSelected ? ' is-selected' : ''}` },
        Chip({
          label: formatSkill(skill),
          selected: isSelected,
          onClick: () => {
            if (isSelected) {
              if (selected.length > 1) {
                selected = selected.filter((s) => s !== skill);
                if (main === skill) main = selected[0];
              }
            } else {
              if (selected.length < 6) selected.push(skill);
            }
            onChange?.({ skills: selected, mainSkill: main });
            render();
          }
        }),
        isSelected ? Button({
          label: isMain ? '★ Main' : 'Set main',
          variant: isMain ? 'primary' : 'ghost',
          className: 'wc-main-skill-btn',
          onClick: () => {
            main = skill;
            onChange?.({ skills: selected, mainSkill: main });
            render();
          }
        }) : null
      );
    }));
  }

  render();
  return container;
}
