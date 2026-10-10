/**
 * WorkCred Passport Components
 * Pure ES module for Work Passport UI, QR cards, timelines, privacy toggles,
 * verification badges, plain-English chain explainers, and receipts.
 */

import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { Avatar, Badge, Button, Chip } from './index.js';
import { generateQrSvg, qrSvgToPng } from '../utils/qr.js';
import { formatBookingDate, formatMoney, formatSkill } from '../utils/format.js';

function showSheet(dialog, trigger) {
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger?.focus?.();
  }, { once: true });
  dialog.showModal();
}

/**
 * Animated counter with instant fallback on reduced motion
 */
export function AnimatedCounter({ value = 0, suffix = '', durationMs = 1200, className = '' }) {
  const el = h('strong', { className: `wc-counter ${className}` }, '0' + suffix);
  const target = Number(value) || 0;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || target === 0) {
    el.textContent = String(target) + suffix;
    return el;
  }

  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / durationMs);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(easeOut * target);
    el.textContent = String(current) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  return el;
}

/**
 * Hero Passport Card (Espresso/Linen theme)
 */
export function PassportCard({
  worker,
  jobsCount = 0,
  rating = '4.8',
  totalHours = 0,
  topSkills = [],
  publicUrl = '',
  onShareWhatsapp,
  onCopyLink,
  onPrintCard,
  onSaveQr,
}) {
  const card = h('article', { className: 'wc-passport-card' });

  // Top header with avatar & verified badge
  const head = h('div', { className: 'wc-passport-card-head' },
    h('div', { className: 'wc-passport-worker-info' },
      Avatar({ name: worker.name, photoUrl: worker.photoUrl, size: 'large' }),
      h('div', {},
        h('h2', { className: 'wc-passport-name' }, worker.name),
        h('p', { className: 'wc-passport-skill' }, formatSkill(worker.mainSkill || worker.skills?.[0] || 'Helper')),
        h('div', { className: 'wc-passport-badges' },
          Badge({ label: en.passport.verifiedPhoneBadge, variant: 'success', icon: '✓' })
        )
      )
    )
  );

  // Stats row with animated counter
  const stats = h('div', { className: 'wc-passport-stats-row' },
    h('div', { className: 'wc-stat-box' },
      AnimatedCounter({ value: jobsCount }),
      h('span', {}, en.passport.statsJobs)
    ),
    h('div', { className: 'wc-stat-box' },
      h('strong', {}, `${rating}★`),
      h('span', {}, en.passport.statsRating)
    ),
    h('div', { className: 'wc-stat-box' },
      AnimatedCounter({ value: totalHours }),
      h('span', {}, en.passport.statsHours)
    )
  );

  // Top skills counts chips
  const skillsWrap = h('div', { className: 'wc-passport-top-skills' });
  if (topSkills.length > 0) {
    skillsWrap.append(
      h('span', { className: 'wc-passport-skills-title' }, `${en.passport.statsTopSkills}:`),
      h('div', { className: 'wc-skill-count-chips' },
        ...topSkills.map((item) =>
          h('span', { className: 'wc-skill-count-chip' },
            h('strong', {}, formatSkill(item.skill)),
            h('small', {}, ` ×${item.count}`)
          )
        )
      )
    );
  }

  // QR section
  const qrSvgMarkup = generateQrSvg(publicUrl, {
    title: `QR code for ${worker.name}'s Work Passport`,
    margin: 3,
    sizePx: 180,
  });

  const qrContainer = h('div', { className: 'wc-passport-qr-box' });
  qrContainer.innerHTML = qrSvgMarkup;

  const qrSection = h('div', { className: 'wc-passport-qr-section' },
    qrContainer,
    h('div', { className: 'wc-passport-qr-copy' },
      h('p', { className: 'wc-passport-qr-hint' }, en.passport.scanToView),
      Button({
        label: en.passport.saveQrImage,
        variant: 'outline',
        onClick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const pngUrl = await qrSvgToPng(qrSvgMarkup, 600);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `workcred-passport-${worker.passportSlug || 'qr'}.png`;
            a.click();
            onSaveQr?.();
          } finally {
            btn.disabled = false;
          }
        },
      })
    )
  );

  // Action buttons
  const actions = h('div', { className: 'wc-passport-actions' },
    Button({
      label: en.passport.shareWhatsapp,
      variant: 'primary',
      icon: '💬',
      onClick: onShareWhatsapp,
    }),
    Button({
      label: en.passport.copyLink,
      variant: 'outline',
      icon: '🔗',
      onClick: onCopyLink,
    }),
    Button({
      label: en.passport.printCard,
      variant: 'ghost',
      icon: '🖨',
      onClick: onPrintCard,
    })
  );

  card.append(head, stats, skillsWrap, qrSection, actions);
  return card;
}

/**
 * Plain-English Integrity Badge & Status Strip
 */
export function IntegrityStrip({ status = 'pending', recordCount = 0, isTampered = false, tamperedPos = null, isDev = false, onRetry, onOpenExplainer }) {
  const container = h('section', { className: `wc-integrity-strip wc-integrity-strip--${status}`, role: 'region', 'aria-live': 'polite' });

  let icon = '🔄';
  let message = en.passport.integrityPending;

  if (status === 'valid') {
    icon = '✓';
    message = en.passport.integrityValid.replace('{count}', String(recordCount));
  } else if (status === 'tampered' || isTampered) {
    icon = '⚠️';
    message = isDev && tamperedPos !== null
      ? en.passport.integrityTamperedDev.replace('{pos}', String(tamperedPos))
      : en.passport.integrityTampered;
  } else if (status === 'error') {
    icon = 'ℹ';
    message = en.passport.integrityFailed;
  }

  const textWrap = h('div', { className: 'wc-integrity-copy' },
    h('span', { className: 'wc-integrity-icon', 'aria-hidden': 'true' }, icon),
    h('span', { className: 'wc-integrity-text' }, message)
  );

  const actionWrap = h('div', { className: 'wc-integrity-actions' });
  if (status === 'error') {
    actionWrap.append(Button({ label: en.passport.integrityRetry, variant: 'outline', onClick: onRetry }));
  }
  if (onOpenExplainer) {
    const explainerLink = h('button', {
      type: 'button',
      className: 'wc-link-button',
      onClick: onOpenExplainer,
    }, 'How we check →');
    actionWrap.append(explainerLink);
  }

  container.append(textWrap, actionWrap);
  return container;
}

/**
 * Visual Chain Demonstration of 4 Linked Records
 */
export function ChainVisual({ verifiedCount = 4 }) {
  const wrap = h('div', { className: 'wc-chain-visual', role: 'img', 'aria-label': `${verifiedCount} tamper-proof records linked in verification chain` });

  const links = [
    { title: 'Job #1', date: 'Initial record' },
    { title: 'Job #2', date: 'Linked to #1' },
    { title: 'Job #3', date: 'Linked to #2' },
    { title: 'Job #4', date: 'Linked to #3' },
  ];

  links.forEach((item, idx) => {
    const node = h('div', { className: 'wc-chain-node' },
      h('div', { className: 'wc-chain-mark' }, '✓'),
      h('strong', {}, item.title),
      h('small', {}, item.date)
    );
    wrap.append(node);
    if (idx < links.length - 1) {
      wrap.append(h('div', { className: 'wc-chain-connector', 'aria-hidden': 'true' }));
    }
  });

  return wrap;
}

/**
 * Modal Sheet: Plain-English "How We Check" Explainer
 */
export function VerificationExplainerSheet({ count = 0, trigger }) {
  const dialog = h('dialog', { className: 'wc-sheet wc-explainer-sheet', 'aria-labelledby': 'explainer-title' });

  const content = h('div', { className: 'wc-sheet-body' },
    h('div', { className: 'wc-sheet-handle', 'aria-hidden': 'true' }),
    h('h2', { id: 'explainer-title' }, en.publicPassport.howWeCheckTitle),
    h('p', { className: 'wc-lead' }, en.publicPassport.howWeCheckVerifiedSummary.replace('{count}', String(count))),
    ChainVisual({ verifiedCount: Math.min(4, count || 4) }),
    h('ol', { className: 'wc-explainer-steps' },
      h('li', {},
        h('strong', {}, en.publicPassport.howWeCheckStep1Title),
        h('p', {}, en.publicPassport.howWeCheckStep1Desc)
      ),
      h('li', {},
        h('strong', {}, en.publicPassport.howWeCheckStep2Title),
        h('p', {}, en.publicPassport.howWeCheckStep2Desc)
      ),
      h('li', {},
        h('strong', {}, en.publicPassport.howWeCheckStep3Title),
        h('p', {}, en.publicPassport.howWeCheckStep3Desc)
      )
    ),
    h('div', { className: 'wc-sheet-actions' },
      Button({ label: en.passport.closeSheet, variant: 'primary', onClick: () => dialog.close() })
    )
  );

  dialog.append(content);
  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Timeline Entry Item
 */
export function TimelineEntry({
  entry,
  isWorkerOwner = false,
  onOpenDetail,
  onToggleVisibility,
  onToggleMask,
}) {
  const li = h('li', { className: `wc-timeline-item ${entry.visibility === 'private' ? 'is-hidden-record' : ''}` });

  const recordPrefix = entry.hashPrefix || (entry.hash ? entry.hash.slice(0, 8) : entry.id.slice(-8));

  const head = h('div', { className: 'wc-timeline-head' },
    h('div', { className: 'wc-timeline-badge-wrap' },
      Badge({ label: en.passport.verifiedRecord, variant: 'success', icon: '✓' }),
      entry.isNew ? Badge({ label: 'New', variant: 'clay' }) : null,
      entry.isSample ? Badge({ label: 'Sample', variant: 'warning' }) : null,
      entry.visibility === 'private' ? Badge({ label: 'Private (Hidden)', variant: 'neutral' }) : null
    ),
    h('time', { className: 'wc-timeline-date' }, formatBookingDate(entry.finishedAt || entry.createdAt || new Date().toISOString()))
  );

  const main = h('div', { className: 'wc-timeline-main', onClick: onOpenDetail, role: onOpenDetail ? 'button' : undefined, tabIndex: onOpenDetail ? 0 : undefined },
    h('div', { className: 'wc-timeline-title-row' },
      h('strong', { className: 'wc-timeline-skill' }, formatSkill(entry.fields?.skill || entry.skill)),
      h('span', { className: 'wc-timeline-rating' }, `${entry.fields?.rating || entry.rating || 5}★`)
    ),
    h('div', { className: 'wc-timeline-meta' },
      h('span', {}, `${entry.fields?.hoursWorked || entry.hoursWorked || 8} hrs`),
      h('span', {}, '•'),
      h('span', { className: 'wc-timeline-customer' }, entry.customerName || entry.customerNameMasked || 'Local Customer'),
      h('span', {}, '•'),
      h('span', { className: 'wc-timeline-record-id' }, `${en.passport.recordIdLabel}: ${recordPrefix}`)
    )
  );

  if (onOpenDetail) {
    main.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenDetail();
      }
    });
  }

  li.append(head, main);

  // Quick privacy controls for worker view
  if (isWorkerOwner && onToggleVisibility && onToggleMask) {
    const controls = h('div', { className: 'wc-timeline-quick-controls' },
      h('label', { className: 'wc-inline-toggle' },
        h('input', {
          type: 'checkbox',
          checked: entry.visibility !== 'private',
          onChange: (e) => onToggleVisibility(e.target.checked ? 'public' : 'private'),
        }),
        h('span', {}, en.passport.privacyVisibility)
      ),
      h('label', { className: 'wc-inline-toggle' },
        h('input', {
          type: 'checkbox',
          checked: !entry.isMasked,
          onChange: (e) => onToggleMask(!e.target.checked),
        }),
        h('span', {}, en.passport.privacyMaskName)
      )
    );
    li.append(controls);
  }

  return li;
}

/**
 * Entry Detail Sheet
 */
export function EntryDetailSheet({
  entry,
  isWorkerOwner = false,
  onUpdatePrivacy,
  trigger,
}) {
  const dialog = h('dialog', { className: 'wc-sheet wc-entry-detail-sheet', 'aria-labelledby': 'entry-detail-title' });

  const recordId = entry.hash || entry.id;
  const hashShort = entry.hashPrefix || recordId.slice(0, 8);

  const content = h('div', { className: 'wc-sheet-body' },
    h('div', { className: 'wc-sheet-handle', 'aria-hidden': 'true' }),
    h('h2', { id: 'entry-detail-title' }, en.passport.detailTitle),
    h('dl', { className: 'wc-detail-dl' },
      h('div', {}, h('dt', {}, 'Skill'), h('dd', {}, formatSkill(entry.fields?.skill || entry.skill))),
      h('div', {}, h('dt', {}, 'Date'), h('dd', {}, formatBookingDate(entry.finishedAt || entry.createdAt))),
      h('div', {}, h('dt', {}, 'Hours worked'), h('dd', {}, `${entry.fields?.hoursWorked || entry.hoursWorked} hrs`)),
      h('div', {}, h('dt', {}, 'Rating received'), h('dd', {}, `${entry.fields?.rating || entry.rating}★`)),
      h('div', {}, h('dt', {}, 'Employer'), h('dd', {}, entry.customerName || entry.customerNameMasked || 'Local Customer')),
      h('div', {},
        h('dt', {}, en.passport.recordIdLabel),
        h('dd', { className: 'wc-mono' }, hashShort),
        h('small', { className: 'wc-hint' }, en.passport.recordIdInfo)
      )
    )
  );

  if (isWorkerOwner && onUpdatePrivacy) {
    let currentVis = entry.visibility || 'public';
    let currentMask = entry.isMasked !== false;

    const privacyForm = h('div', { className: 'wc-sheet-privacy-form' },
      h('h3', {}, 'Privacy controls'),
      h('label', { className: 'wc-check-row' },
        h('input', {
          type: 'checkbox',
          checked: currentVis === 'public',
          onChange: async (e) => {
            currentVis = e.target.checked ? 'public' : 'private';
            await onUpdatePrivacy({ visibility: currentVis });
          },
        }),
        h('span', {}, en.passport.privacyVisibility)
      ),
      h('label', { className: 'wc-check-row' },
        h('input', {
          type: 'checkbox',
          checked: !currentMask,
          onChange: async (e) => {
            currentMask = !e.target.checked;
            await onUpdatePrivacy({ isMasked: currentMask });
          },
        }),
        h('span', {}, en.passport.privacyMaskName)
      )
    );
    content.append(privacyForm);
  }

  const actions = h('div', { className: 'wc-sheet-actions' },
    Button({ label: en.passport.closeSheet, variant: 'primary', onClick: () => dialog.close() })
  );
  content.append(actions);

  dialog.append(content);
  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Report Problem Sheet (Public Page or Booking)
 */
export function ReportSheetModal({ title = en.publicPassport.reportTitle, onSubmit, trigger }) {
  const dialog = h('dialog', { className: 'wc-sheet wc-report-sheet', 'aria-labelledby': 'report-sheet-title' });

  let selectedReason = 'fake';
  const reasonGroup = h('div', { className: 'wc-chip-group', role: 'radiogroup', 'aria-label': en.publicPassport.reportReasonLabel },
    Chip({ label: en.publicPassport.reportReasonFake, pressed: true, onClick: () => { selectedReason = 'fake'; updateChips(); } }),
    Chip({ label: en.publicPassport.reportReasonInappropriate, pressed: false, onClick: () => { selectedReason = 'inappropriate'; updateChips(); } }),
    Chip({ label: en.publicPassport.reportReasonHarassment, pressed: false, onClick: () => { selectedReason = 'harassment'; updateChips(); } }),
    Chip({ label: en.publicPassport.reportReasonOther, pressed: false, onClick: () => { selectedReason = 'other'; updateChips(); } })
  );

  function updateChips() {
    const chips = reasonGroup.querySelectorAll('.wc-chip');
    chips.forEach((c, idx) => {
      const keys = ['fake', 'inappropriate', 'harassment', 'other'];
      const active = keys[idx] === selectedReason;
      c.setAttribute('aria-pressed', String(active));
      c.classList.toggle('is-selected', active);
    });
  }

  const noteInput = h('textarea', {
    className: 'wc-input wc-textarea',
    rows: 3,
    placeholder: en.publicPassport.reportNotesPlaceholder,
  });

  const form = h('form', {
    className: 'wc-sheet-body',
    onSubmit: async (e) => {
      e.preventDefault();
      await onSubmit({ reason: selectedReason, note: noteInput.value.trim() });
      dialog.close();
    },
  },
    h('div', { className: 'wc-sheet-handle', 'aria-hidden': 'true' }),
    h('h2', { id: 'report-sheet-title' }, title),
    h('p', { className: 'wc-label' }, en.publicPassport.reportReasonLabel),
    reasonGroup,
    h('label', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, 'Details (optional)'),
      noteInput
    ),
    h('div', { className: 'wc-sheet-actions' },
      Button({ label: en.passport.closeSheet, variant: 'ghost', onClick: () => dialog.close() }),
      Button({ label: en.publicPassport.reportSubmitBtn, variant: 'primary', type: 'submit' })
    )
  );

  dialog.append(form);
  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Help / Troubleshooting Sheet for Handshakes
 */
export function HelpSheet({ trigger }) {
  const dialog = h('dialog', { className: 'wc-sheet wc-help-sheet', 'aria-labelledby': 'help-sheet-title' });

  const content = h('div', { className: 'wc-sheet-body' },
    h('div', { className: 'wc-sheet-handle', 'aria-hidden': 'true' }),
    h('h2', { id: 'help-sheet-title' }, en.handshake.havingTrouble),
    h('ul', { className: 'wc-help-list' },
      h('li', {}, en.handshake.troubleTip1),
      h('li', {}, en.handshake.troubleTip2),
      h('li', {}, en.handshake.troubleTip3)
    ),
    h('div', { className: 'wc-sheet-actions' },
      Button({ label: en.passport.closeSheet, variant: 'primary', onClick: () => dialog.close() })
    )
  );

  dialog.append(content);
  showSheet(dialog, trigger);
  return dialog;
}

/**
 * Job Receipt Card
 */
export function ReceiptCard({
  booking,
  isWorker = false,
  workerName = '',
  onViewPassport,
  onBookAgain,
}) {
  const card = h('article', { className: 'wc-receipt-card' });

  const amountStr = formatMoney(booking.amount || booking.rate * (booking.hours || 1));
  const headingText = isWorker
    ? en.receipt.workerPaid.replace('{amount}', amountStr)
    : en.receipt.customerPaid.replace('{amount}', amountStr);

  const head = h('div', { className: 'wc-receipt-head' },
    h('span', { className: 'wc-receipt-icon', 'aria-hidden': 'true' }, '🧾'),
    h('h2', { className: 'wc-receipt-title' }, headingText),
    h('p', { className: 'wc-receipt-notice' }, en.receipt.cashNotice)
  );

  const details = h('dl', { className: 'wc-receipt-dl' },
    h('div', {}, h('dt', {}, 'Date'), h('dd', {}, formatBookingDate(booking.scheduledAt || booking.finishedAt || new Date().toISOString()))),
    h('div', {}, h('dt', {}, 'Skill'), h('dd', {}, formatSkill(booking.skill))),
    h('div', {}, h('dt', {}, 'Duration'), h('dd', {}, `${booking.hours || 1} hours`)),
    h('div', {}, h('dt', {}, 'Rating'), h('dd', {}, `${booking.rating || 5}★`)),
    h('div', { className: 'wc-receipt-passport-tag' },
      h('dt', {}, 'Work Passport'),
      h('dd', {}, en.receipt.addedToPassport.replace('{name}', workerName)),
      h('small', { className: 'wc-mono' }, `${en.passport.recordIdLabel}: ${booking.hashPrefix || booking.id.slice(0, 8)}`)
    )
  );

  const actions = h('div', { className: 'wc-receipt-actions' },
    isWorker
      ? Button({ label: en.receipt.viewInPassport, variant: 'primary', onClick: onViewPassport })
      : Button({ label: en.receipt.viewWorkerPassport.replace('{name}', workerName), variant: 'primary', onClick: onViewPassport }),
    !isWorker && onBookAgain
      ? Button({ label: en.receipt.bookAgain, variant: 'outline', onClick: onBookAgain })
      : null,
    Button({ label: en.receipt.downloadReceipt, variant: 'ghost', onClick: () => window.print() })
  );

  card.append(head, details, actions);
  return card;
}
