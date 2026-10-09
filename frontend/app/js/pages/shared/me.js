import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Avatar, Badge, Button, Field } from '../../components/index.js';

export function renderMe({ navigate, user }) {
  const worker = user.role === 'worker';
  const name = Field({ id: 'me-name', label: en.onboarding.name, required: true, value: user.name ?? '', autocomplete: 'name' });
  const area = Field({ id: 'me-area', label: en.onboarding.area, required: true, value: user.area ?? '' });
  const city = h('div', { className: 'wc-field' }, h('label', { className: 'wc-label', for: 'me-city' }, en.onboarding.city), h('select', { id: 'me-city', className: 'wc-input' }, en.cities.map((entry) => h('option', { value: entry, selected: user.city === entry }, entry))));
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const submit = Button({ label: en.common.save, type: 'submit' });
  const form = h('form', { className: 'wc-form wc-profile-edit', onSubmit: async (event) => {
    event.preventDefault(); submit.disabled = true; error.hidden = true;
    try {
      const profile = { name: name.querySelector('input').value.trim(), area: area.querySelector('input').value.trim(), city: city.querySelector('select').value };
      if (worker) { profile.skills = user.skills ?? []; profile.rate = user.rate; profile.rateUnit = user.rateUnit; }
      await window.workcred.users.updateMe(profile);
      window.workcred.toast(en.profile.saved, 'success');
      navigate(worker ? '/w/me' : '/c/me');
    } catch (reason) { error.textContent = reason.message || en.errors.generic; error.hidden = false; }
    finally { submit.disabled = false; }
  } }, name, area, city, error, submit);
  const logout = Button({ label: en.profile.logout, variant: 'outline', onClick: async () => {
    logout.disabled = true;
    try { await window.workcred.auth.logout(); navigate('/welcome', { replace: true }); }
    catch (reason) { error.textContent = reason.message || en.errors.generic; error.hidden = false; logout.disabled = false; }
  } });
  const page = h('div', { className: 'wc-page-stack' }, h('section', { className: 'wc-profile-summary' }, Avatar({ name: user.name }), h('div', {}, h('h2', {}, user.name || en.profile.title), Badge({ label: en.profile.phone, kind: 'success' }), h('p', { className: 'wc-hint' }, `+91 ${user.phone}`))), h('section', { className: 'wc-profile-form' }, h('h2', {}, en.profile.editTitle), form, logout));
  const shell = worker ? workerShell : customerShell;
  return shell({ title: en.nav.me, active: worker ? '/w/me' : '/c/me', navigate, user, content: page });
}
