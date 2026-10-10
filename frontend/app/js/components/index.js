import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';

export function Button({ label, variant = 'primary', loading = false, disabled = false, type = 'button', onClick, className = '' }) {
  return h('button', { className: `wc-button wc-button--${variant} ${className}`.trim(), type, disabled: disabled || loading, 'aria-busy': loading, onClick }, loading ? en.common.working : label);
}

export function Card({ children, className = '' }) { return h('section', { className: `wc-card ${className}`.trim() }, children); }

export function Field({ id, label, type = 'text', value, hint, error, inputmode, autocomplete, required = false, placeholder, onInput, min, max, step, name }) {
  const input = h('input', { id, name: name ?? id, className: `wc-input${error ? ' has-error' : ''}`, type, value, inputmode, autocomplete, required, placeholder, min, max, step, onInput });
  return h('div', { className: 'wc-field' }, h('label', { for: id, className: 'wc-label' }, label), input, hint ? h('p', { className: 'wc-hint' }, hint) : null, error ? h('p', { className: 'wc-error', role: 'alert' }, error) : null);
}

export function Input(props) { return Field(props); }

export function OtpInput({ onChange, length = 6, label = en.otp.title }) {
  const values = Array(length).fill('');
  const boxes = values.map((_, index) => h('input', {
    className: 'wc-otp-box', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 1,
    autocomplete: index === 0 ? 'one-time-code' : 'off', 'aria-label': en.otp.digit.replace('{index}', String(index + 1)),
    onInput(event) {
      const input = event.currentTarget;
      const raw = input.value.replace(/\D/g, '');
      if (raw.length > 1) {
        values.fill(''); boxes.forEach((box) => { box.value = ''; });
        [...raw.slice(0, length)].forEach((digit, position) => { values[position] = digit; boxes[position].value = digit; });
        boxes[Math.min(raw.length, length) - 1]?.focus();
        onChange(values.join(''));
        return;
      }
      const digits = raw.slice(-1);
      input.value = digits; values[index] = digits;
      if (digits && boxes[index + 1]) boxes[index + 1].focus();
      onChange(values.join(''));
    },
    onKeydown(event) {
      if (event.key === 'Backspace' && !event.currentTarget.value && boxes[index - 1]) boxes[index - 1].focus();
      if (event.key === 'ArrowLeft' && boxes[index - 1]) boxes[index - 1].focus();
      if (event.key === 'ArrowRight' && boxes[index + 1]) boxes[index + 1].focus();
    },
    onPaste(event) {
      const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (!pasted) return;
      event.preventDefault();
      values.fill(''); boxes.forEach((box) => { box.value = ''; });
      [...pasted].forEach((digit, position) => { values[position] = digit; boxes[position].value = digit; });
      boxes[Math.min(pasted.length, length) - 1].focus();
      onChange(values.join(''));
    },
  }));
  const group = h('div', { className: 'wc-otp-group', role: 'group', 'aria-label': label, style: `--wc-otp-count:${length}` }, boxes);
  group.getValue = () => values.join('');
  return group;
}

export function Chip({ label, selected = false, onClick, disabled = false }) {
  return h('button', { type: 'button', className: `wc-chip${selected ? ' is-selected' : ''}`, 'aria-pressed': selected, disabled, onClick }, label);
}

export function ChipGroup({ options, selected = [], onChange, label }) {
  const set = new Set(selected);
  const group = h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': label }, options.map((option) => Chip({
    label: option,
    selected: set.has(option),
    onClick: (event) => {
      const button = event.currentTarget;
      if (set.has(option)) set.delete(option); else set.add(option);
      button.classList.toggle('is-selected', set.has(option));
      button.setAttribute('aria-pressed', String(set.has(option)));
      onChange([...set]);
    },
  })));
  return group;
}

export function Avatar({ name = '' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
  return h('span', { className: 'wc-avatar', 'aria-label': name }, initials || '•');
}

export function Badge({ label, kind = 'neutral' }) { return h('span', { className: `wc-badge wc-badge--${kind}` }, label); }
export function StarRating({ value, label }) { return h('span', { className: 'wc-rating', 'aria-label': label ?? `${value}` }, '★ ', value); }

export function TabBar({ items, active, onNavigate }) {
  return h('nav', { className: 'wc-tabbar', 'aria-label': en.common.navigation ?? en.brand.name }, items.map((item) => h('a', {
    href: `#${item.path}`, className: `wc-tab${active === item.path ? ' is-active' : ''}`,
    'aria-current': active === item.path ? 'page' : null,
    onClick(event) { event.preventDefault(); onNavigate(item.path); },
  }, h('span', { className: 'wc-tab-icon', 'aria-hidden': 'true' }, item.icon), h('span', {}, item.label))));
}

export function TopBar({ title, location, actions }) {
  return h('header', { className: 'wc-app-topbar' },
    h('div', { className: 'wc-topbar-copy' },
      h('h1', {}, title),
      h('span', { className: 'wc-location-chip' }, h('span', { 'aria-hidden': 'true' }, '⌖'), location ?? en.brand.name)
    ),
    actions ? h('div', { className: 'wc-topbar-actions' }, actions) : null
  );
}


export function Spinner({ label = en.common.loading }) { return h('span', { className: 'wc-spinner', role: 'status', 'aria-label': label }); }
export function Skeleton({ rows = 3 }) { return h('div', { className: 'wc-skeleton-list', 'aria-hidden': 'true' }, Array.from({ length: rows }, (_, i) => h('span', { className: `wc-skeleton wc-skeleton--${i % 2 ? 'short' : 'long'}` }))); }
export function EmptyState({ title, body, action }) { return h('section', { className: 'wc-empty' }, h('span', { className: 'wc-empty-mark', 'aria-hidden': 'true' }, '✳'), h('h2', {}, title), h('p', {}, body), action ?? null); }
export function ErrorState({ message, onRetry }) { return h('section', { className: 'wc-error-state', role: 'alert' }, h('p', {}, message), Button({ label: en.common.retry, variant: 'outline', onClick: onRetry })); }

export function Toast({ message, kind = 'info' }) { return h('div', { className: `wc-toast wc-toast--${kind}`, role: 'status', 'aria-live': 'polite' }, message); }

let offlineEventsBound = false;
export function OfflineBanner() {
  const banner = h('p', { className: 'wc-offline', role: 'status', hidden: navigator.onLine }, en.errors.network);
  if (!offlineEventsBound) {
    window.addEventListener('online', () => document.querySelectorAll('.wc-offline').forEach((entry) => { entry.hidden = true; }));
    window.addEventListener('offline', () => document.querySelectorAll('.wc-offline').forEach((entry) => { entry.hidden = false; }));
    offlineEventsBound = true;
  }
  return banner;
}

export function ProgressSteps({ label }) { return h('p', { className: 'wc-progress' }, label); }

export function Modal({ title, body, onClose, className = 'wc-modal' }) {
  const dialog = h('dialog', { className }, h('div', { className: 'wc-modal-head' }, h('h2', {}, title), Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })), h('div', { className: 'wc-modal-body' }, body));
  dialog.addEventListener('close', onClose ?? (() => {}));
  return dialog;
}
export function BottomSheet(props) { return Modal({ ...props, className: 'wc-modal wc-bottom-sheet' }); }
