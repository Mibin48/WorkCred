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
  durationHours = 4,
  expiresAt = null,
  bookedNotice = null,
  isOffline = false,
  onStart,
  onExtend,
  onStop,
  onViewRequests,
}) {
  const card = h('section', { className: `wc-civic-status-card wc-civic-status-card--${state}${isOffline ? ' is-offline' : ''}` });

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
    const totalDurationMs = (Number(durationHours) || 4) * 3600000;

    const liveDot = h('div', { className: 'wc-status-pill-row' },
      h('span', { className: 'wc-live-pill-badge' },
        h('span', { className: 'wc-live-dot-green', 'aria-hidden': 'true' }),
        h('strong', {}, 'LIVE STATUS')
      ),
      h('span', { className: 'wc-status-subtitle' }, 'Visible to 18 nearby houses')
    );

    const timeOutput = h('h3', { className: 'wc-countdown-main', 'aria-live': 'polite' }, formatCountdown(remainingMs));
    
    // Circular SVG Progress with Bolt in center
    const circle = h('circle', {
      className: 'wc-ring-bar',
      cx: 36,
      cy: 36,
      r: 30,
      'stroke-dasharray': 188.5,
      'stroke-dashoffset': String(188.5 * (1 - Math.min(1, remainingMs / totalDurationMs))),
    });

    const ringSvg = h('div', { className: 'wc-status-circle-wrap' },
      h('svg', { className: 'wc-countdown-ring-svg', viewBox: '0 0 72 72', 'aria-hidden': 'true' },
        h('circle', { className: 'wc-ring-bg-dark', cx: 36, cy: 36, r: 30 }),
        circle
      ),
      h('span', { className: 'wc-circle-bolt' }, '⚡')
    );

    const updateTimer = () => {
      remainingMs = Math.max(0, new Date(expiresAt || Date.now()).getTime() - Date.now());
      timeOutput.textContent = formatCountdown(remainingMs);
      const ratio = Math.max(0, Math.min(1, remainingMs / totalDurationMs));
      circle.setAttribute('stroke-dashoffset', String(188.5 * (1 - ratio)));
    };

    const interval = setInterval(updateTimer, 60000);
    card.cleanupTimer = () => clearInterval(interval);

    const actionRow = h('div', { className: 'wc-status-actions-row' },
      Button({
        label: '⏱ Extend 2 hours',
        variant: 'outline',
        className: 'wc-extend-btn-dark',
        onClick: onExtend,
        disabled: isOffline
      }),
      Button({
        label: 'Stop',
        variant: 'ghost',
        className: 'wc-stop-btn-dark',
        onClick: onStop
      })
    );

    let selectedDuration = durationHours;
    const dur2 = h('button', {
      type: 'button',
      className: `wc-dur-pill ${selectedDuration === 2 ? 'is-active' : ''}`,
      onClick: () => { selectedDuration = 2; onStart?.(2); }
    }, '2 hrs');
    const dur4 = h('button', {
      type: 'button',
      className: `wc-dur-pill ${selectedDuration === 4 ? 'is-active' : ''}`,
      onClick: () => { selectedDuration = 4; onStart?.(4); }
    }, '4 hrs');
    const dur8 = h('button', {
      type: 'button',
      className: `wc-dur-pill ${selectedDuration === 8 ? 'is-active' : ''}`,
      onClick: () => { selectedDuration = 8; onStart?.(8); }
    }, '8 hrs');

    const durationRow = h('div', { className: 'wc-status-dur-row' },
      h('span', { className: 'wc-dur-label' }, 'Or set duration:'),
      h('div', { className: 'wc-dur-pills-group' }, dur2, dur4, dur8)
    );

    const banner = bookedNotice
      ? h('div', { className: 'wc-booked-banner', onClick: onViewRequests },
          h('strong', {}, bookedNotice),
          h('span', {}, 'View requests →')
        )
      : null;

    card.append(
      liveDot,
      h('div', { className: 'wc-status-hero-grid' },
        ringSvg,
        h('div', { className: 'wc-status-hero-copy' },
          timeOutput,
          h('p', { className: 'wc-status-desc' }, 'Nearby customers can see you on the registry map and book direct visits.')
        )
      ),
      banner,
      actionRow,
      durationRow
    );
    return card;
  }

  // Idle state
  let selectedDuration = durationHours || 4;
  const chip2h = Chip({ label: '2 hrs', selected: selectedDuration === 2, onClick: () => select(2) });
  const chip4h = Chip({ label: '4 hrs', selected: selectedDuration === 4, onClick: () => select(4) });
  const chip8h = Chip({ label: '8 hrs', selected: selectedDuration === 8, onClick: () => select(8) });

  function select(hours) {
    selectedDuration = hours;
    [chip2h, chip4h, chip8h].forEach((c, idx) => {
      const active = [2, 4, 8][idx] === hours;
      c.classList.toggle('is-selected', active);
      c.setAttribute('aria-pressed', String(active));
    });
  }

  const startBtn = Button({
    label: 'Go Free Now for Work ⚡',
    className: 'wc-full wc-go-free-btn',
    disabled: isOffline,
    onClick: () => onStart?.(selectedDuration),
  });

  card.append(
    h('div', { className: 'wc-status-pill-row' },
      h('span', { className: 'wc-offline-pill-badge' },
        h('span', { className: 'wc-offline-dot', 'aria-hidden': 'true' }),
        h('strong', {}, 'OFFLINE / STANDBY')
      ),
      h('span', { className: 'wc-status-subtitle' }, 'Turn on to get instant visits')
    ),
    h('h2', { className: 'wc-status-idle-title' }, 'Ready for local jobs?'),
    h('p', { className: 'wc-status-desc' }, 'Broadcast your availability to homeowners and sites in your ward radius.'),
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
  const customerName = booking.customerName || 'Meera S.';
  const skillTitle = formatSkill(booking.skill) + ' Inspection';
  const totalAmount = Math.round((Number(booking.rate || 450) / (booking.rateUnit === 'hour' ? 1 : 8)) * (booking.hours || 2.5));
  const timeStr = `Today, 4:00 PM (${booking.hours || 2.5} hrs)`;
  const distanceStr = `850m away (7 min cycle)`;
  const note = booking.notes || 'Dining room ceiling fan wiring spark and 1 bedroom switchboard replacement. Tools required.';

  return h('article', { className: 'wc-civic-request-card', 'aria-label': `Request from ${customerName}` },
    h('div', { className: 'wc-req-card-top' },
      h('div', { className: 'wc-req-user-block' },
        Avatar({ name: customerName }),
        h('div', { className: 'wc-req-user-meta' },
          h('div', { className: 'wc-req-name-row' },
            h('strong', { className: 'wc-req-name' }, customerName),
            h('span', { className: 'wc-verified-resident-tag' }, 'Verified Resident')
          ),
          h('span', { className: 'wc-req-skill-title' }, skillTitle)
        )
      ),
      h('div', { className: 'wc-req-price-block' },
        h('strong', { className: 'wc-req-price' }, `₹${totalAmount}`),
        h('span', { className: 'wc-req-pay-method' }, 'Cash on end')
      )
    ),
    h('div', { className: 'wc-req-meta-pill-box' },
      h('div', { className: 'wc-req-meta-col' },
        h('span', { className: 'wc-req-meta-lbl' }, '⏱ Time & Slot'),
        h('strong', { className: 'wc-req-meta-val' }, timeStr)
      ),
      h('div', { className: 'wc-req-meta-col' },
        h('span', { className: 'wc-req-meta-lbl' }, '📍 Distance'),
        h('strong', { className: 'wc-req-meta-val' }, distanceStr)
      )
    ),
    h('p', { className: 'wc-req-note-text' }, `"${note}"`),
    h('div', { className: 'wc-req-actions-row' },
      Button({
        label: 'Decline',
        variant: 'ghost',
        className: 'wc-decline-btn',
        onClick: () => onDecline?.(booking)
      }),
      Button({
        label: '✓ Accept Visit',
        variant: 'primary',
        className: 'wc-accept-btn',
        onClick: () => onAccept?.(booking)
      })
    )
  );
}

/**
 * Worker Job Card matching "Jobs Near You"
 */
export function WorkerJobCard({ job, onOpen }) {
  const spotsLeft = Math.max(1, (job.slotsNeeded || 1) - (job.slotsFilled || 0));
  const rateTotal = job.rateUnit === 'hour' ? Math.round(Number(job.rate) * (job.hours || 3)) : Number(job.rate || 550);
  const distanceStr = job.distanceKm != null ? `${job.distanceKm.toFixed(1)} km away` : '1.1 km away';
  const timePosted = 'Posted 22m ago';
  const customerName = job.customerName || 'Customer Kiran R.';
  const areaStr = job.area || 'Indiranagar 12th Main';
  const timingStr = `Tomorrow, 9:00 AM • Approx. ${job.hours || 3} hrs duration`;
  const desc = job.description || 'Main tripping issue in 3BHK flat, standard wiring check. Customer already has spare 32A MCB switch.';

  return h('article', { className: 'wc-civic-job-card' },
    h('div', { className: 'wc-civic-job-header' },
      h('div', { className: 'wc-job-spot-block' },
        h('span', { className: 'wc-job-spot-badge' }, `${spotsLeft} of ${job.slotsNeeded || 1} spot open`),
        h('span', { className: 'wc-job-posted-time' }, timePosted)
      ),
      h('div', { className: 'wc-job-rate-block' },
        h('strong', { className: 'wc-job-price' }, `₹${rateTotal}`),
        h('span', { className: 'wc-fair-benchmark-tag' }, 'Fair Price Benchmark')
      )
    ),
    h('h3', { className: 'wc-civic-job-title' }, job.title || `${formatSkill(job.skill)} Repair`),
    h('p', { className: 'wc-civic-job-customer' },
      customerName, ' • ', areaStr, ' ',
      h('span', { className: 'wc-job-dist-highlight' }, `(${distanceStr})`)
    ),
    h('div', { className: 'wc-job-schedule-pill' },
      h('span', { className: 'wc-sched-icon' }, '📅'),
      h('span', { className: 'wc-sched-text' }, timingStr)
    ),
    h('p', { className: 'wc-civic-job-desc' }, desc),
    h('div', { className: 'wc-civic-job-footer' },
      h('div', { className: 'wc-escrow-badge' },
        h('span', { className: 'wc-escrow-icon' }, '🛡️'),
        h('span', {}, 'Guild Escrow Assured')
      ),
      h('div', { className: 'wc-job-btn-group' },
        Button({
          label: 'Details',
          variant: 'ghost',
          className: 'wc-job-details-btn',
          onClick: onOpen
        }),
        Button({
          label: 'Claim Job',
          variant: 'primary',
          className: 'wc-job-claim-btn',
          onClick: onOpen
        })
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
