import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Button, Card } from '../../components/index.js';
import { authLayout } from '../../layouts/authLayout.js';

export function renderRole({ navigate, pendingRole }) {
  let selected = pendingRole || '';
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const choices = h('div', { className: 'wc-role-cards' });
  const buttons = [];
  for (const [role, title, body, icon] of [['worker', en.role.worker, en.role.workerBody, '↗'], ['customer', en.role.customer, en.role.customerBody, '⌂']]) {
    const button = h('button', { type: 'button', className: `wc-role-card${selected === role ? ' is-selected' : ''}`, 'aria-pressed': selected === role, onClick: () => {
      selected = role;
      buttons.forEach((entry) => { entry.classList.toggle('is-selected', entry.dataset.role === role); entry.setAttribute('aria-pressed', String(entry.dataset.role === role)); });
      error.hidden = true;
    } }, h('span', { className: 'wc-role-mark', 'aria-hidden': 'true' }, icon), h('span', {}, h('strong', {}, title), h('small', {}, body)));
    button.dataset.role = role;
    buttons.push(button); choices.append(Card({ children: button }));
  }
  const submit = Button({ label: en.role.submit, className: 'wc-full', onClick: async () => {
    if (!selected) { error.textContent = en.role.body; error.hidden = false; return; }
    submit.disabled = true;
    try { await window.workcred.users.setRole(selected); navigate('/onboarding'); }
    catch (reason) { error.textContent = reason.message || en.errors.generic; error.hidden = false; }
    finally { submit.disabled = false; }
  } });
  return authLayout(h('section', { className: 'wc-auth-card' }, h('p', { className: 'wc-eyebrow' }, en.onboarding.workerProgress), h('h1', {}, en.role.title), h('p', { className: 'wc-lead' }, en.role.body), choices, error, submit));
}
