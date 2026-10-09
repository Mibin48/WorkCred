import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Button, ErrorState } from '../../components/index.js';
import { authLayout } from '../../layouts/authLayout.js';
import { isIndianMobile, cleanPhone } from '../../utils/validate.js';

export function renderLogin({ navigate, setPhone, pendingRole }) {
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const status = h('p', { className: 'wc-form-status', role: 'status', hidden: true });

  const counterBadge = h('span', { className: 'wc-phone-counter' }, '0/10');
  const labelRow = h('div', { className: 'wc-label-row' },
    h('label', { className: 'wc-label', for: 'login-phone' }, en.login.phoneLabel),
    counterBadge
  );

  const prefixBadge = h('div', { className: 'wc-phone-flag' },
    h('span', { className: 'wc-flag-icon', 'aria-hidden': 'true' }, '🇮🇳'),
    h('span', { className: 'wc-flag-code' }, '+91')
  );

  const input = h('input', {
    id: 'login-phone',
    className: 'wc-phone-input',
    type: 'tel',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    autocomplete: 'tel-national',
    required: true,
    placeholder: en.login.placeholder,
    'aria-describedby': 'phone-hint'
  });

  const phoneBox = h('div', { className: 'wc-phone-box' }, prefixBadge, input);
  const phoneField = h('div', { className: 'wc-field wc-phone-field' }, labelRow, phoneBox);
  const hint = h('p', { id: 'phone-hint', className: 'wc-hint' }, 'Enter your 10-digit mobile number to receive an OTP');

  const demoTitle = h('p', { className: 'wc-demo-title' }, 'Quick Demo Sign-In:');
  const fillPhone = (num) => {
    input.value = num;
    updateCounter();
    input.focus();
  };

  const workerChip = Button({
    label: '⚡ Demo Worker (9000000001)',
    variant: 'outline',
    type: 'button',
    className: 'wc-demo-chip',
    onClick: () => fillPhone('9000000001')
  });

  const customerChip = Button({
    label: '⚡ Demo Customer (9000000002)',
    variant: 'outline',
    type: 'button',
    className: 'wc-demo-chip',
    onClick: () => fillPhone('9000000002')
  });

  const demoGroup = h('div', { className: 'wc-demo-chips' }, demoTitle, workerChip, customerChip);

  const updateCounter = () => {
    const raw = cleanPhone(input.value);
    const count = Math.min(10, raw.length);
    if (count === 10 && isIndianMobile(raw)) {
      counterBadge.textContent = '10/10 ✓';
      counterBadge.classList.add('is-valid');
      phoneBox.classList.remove('has-error');
      error.hidden = true;
    } else {
      counterBadge.textContent = `${count}/10`;
      counterBadge.classList.remove('is-valid');
    }
  };

  input.addEventListener('input', updateCounter);

  const submit = Button({ label: en.login.submit, type: 'submit', className: 'wc-full' });

  const form = h('form', { className: 'wc-form', onSubmit: async (event) => {
    event.preventDefault();
    const value = cleanPhone(input.value);
    error.hidden = true; status.hidden = true; form.querySelector('.wc-error-state')?.remove();

    if (!isIndianMobile(value)) {
      error.textContent = en.login.invalid;
      error.hidden = false;
      phoneBox.classList.add('has-error');
      input.focus();
      return;
    }

    submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.textContent = en.common.working;
    try {
      const result = await window.workcred.auth.requestOtp(value);
      setPhone(value);
      status.textContent = result.message || en.otp.demo;
      status.hidden = false;
      navigate('/otp', { role: pendingRole, phone: value });
    } catch (reason) {
      if (reason.code === 'NETWORK_ERROR') form.insertBefore(ErrorState({ message: reason.message || en.errors.network, onRetry: () => form.requestSubmit() }), submit);
      else { error.textContent = reason.message || en.errors.generic; error.hidden = false; }
    } finally { submit.disabled = false; submit.removeAttribute('aria-busy'); submit.textContent = en.login.submit; }
  } }, phoneField, hint, error, status, submit, demoGroup);

  return authLayout(h('section', { className: 'wc-auth-card wc-login' },
    h('p', { className: 'wc-eyebrow' }, en.common.logIn),
    h('h1', {}, en.login.title),
    h('p', { className: 'wc-lead' }, en.login.body),
    form
  ));
}
