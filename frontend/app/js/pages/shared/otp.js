import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Button, ErrorState, OtpInput } from '../../components/index.js';
import { authLayout } from '../../layouts/authLayout.js';

export function renderOtp({ navigate, phone, onSuccess }) {
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const group = OtpInput({ onChange: () => { error.hidden = true; } });
  const verify = Button({ label: en.otp.submit, type: 'submit', className: 'wc-full' });
  const resend = Button({ label: en.otp.resend, variant: 'ghost', disabled: true });
  let seconds = 30;
  const timer = h('p', { className: 'wc-resend-timer' }, en.otp.resendIn.replace('{seconds}', String(seconds)));
  let interval;
  const startTimer = () => {
    clearInterval(interval);
    seconds = 30;
    resend.disabled = true;
    timer.textContent = en.otp.resendIn.replace('{seconds}', String(seconds));
    interval = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) { clearInterval(interval); timer.textContent = en.otp.resend; resend.disabled = false; return; }
      timer.textContent = en.otp.resendIn.replace('{seconds}', String(seconds));
    }, 1000);
  };
  startTimer();
  resend.addEventListener('click', async () => {
    resend.disabled = true;
    try { await window.workcred.auth.requestOtp(phone); startTimer(); }
    catch (reason) { error.textContent = reason.message || en.errors.generic; error.hidden = false; resend.disabled = false; }
  });
  const form = h('form', { className: 'wc-form', onSubmit: async (event) => {
    event.preventDefault(); error.hidden = true; form.querySelector('.wc-error-state')?.remove();
    if (group.getValue().length !== 6) { error.textContent = en.otp.required; error.hidden = false; return; }
    verify.disabled = true; verify.textContent = en.common.working;
    try {
      const session = await window.workcred.auth.verifyOtp(phone, group.getValue());
      clearInterval(interval);
      onSuccess(session.user);
    } catch (reason) {
      if (reason.code === 'NETWORK_ERROR') form.insertBefore(ErrorState({ message: reason.message || en.errors.network, onRetry: () => form.requestSubmit() }), verify);
      else { error.textContent = reason.message || en.errors.generic; error.hidden = false; }
    } finally { verify.disabled = false; verify.textContent = en.otp.submit; }
  } }, group, error, verify);
  return authLayout(h('section', { className: 'wc-auth-card' }, h('p', { className: 'wc-eyebrow' }, en.login.phoneLabel), h('h1', {}, en.otp.title), h('p', { className: 'wc-lead' }, `${en.otp.body} +91 ${phone}.`), h('p', { className: 'wc-demo-note' }, en.otp.demo), form, h('div', { className: 'wc-resend' }, timer, resend), h('a', { className: 'wc-text-link', href: '#/login', onClick: (event) => { event.preventDefault(); clearInterval(interval); navigate('/login'); } }, en.otp.change)));
}
