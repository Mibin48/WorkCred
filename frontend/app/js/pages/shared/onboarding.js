import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Button, ChipGroup, Field, ProgressSteps } from '../../components/index.js';
import { authLayout } from '../../layouts/authLayout.js';
import { getCurrentArea } from '../../utils/geo.js';
import { SKILLS } from '../../../../shared/constants.js';

export function renderOnboarding({ navigate, user }) {
  const worker = user?.role === 'worker';
  let selectedSkills = Array.isArray(user?.skills) ? user.skills.map((skill) => skill.toLowerCase()) : [];
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const status = h('p', { className: 'wc-form-status', role: 'status', hidden: true });
  const name = Field({ id: 'profile-name', label: en.onboarding.name, required: true, autocomplete: 'name', value: user?.name ?? '', hint: en.onboarding.nameHint });
  const area = Field({ id: 'profile-area', label: en.onboarding.area, required: true, autocomplete: 'address-level3', value: user?.area ?? '', placeholder: en.forms.areaHint });
  const city = h('div', { className: 'wc-field' }, h('label', { className: 'wc-label', for: 'profile-city' }, en.onboarding.city), h('select', { id: 'profile-city', className: 'wc-input', required: true }, h('option', { value: '' }, en.forms.chooseCity), en.cities.map((entry) => h('option', { value: entry, selected: user?.city === entry }, entry))));
  const locationError = h('p', { className: 'wc-hint', hidden: true }, en.onboarding.locationDenied);
  const locationButton = Button({ label: en.onboarding.location, variant: 'ghost', onClick: async () => {
    locationButton.disabled = true; locationError.hidden = true;
    try { await getCurrentArea(); locationError.textContent = en.forms.locationSuccess; locationError.hidden = false; locationError.classList.add('is-success'); }
    catch { locationError.textContent = en.onboarding.locationDenied; locationError.hidden = false; locationError.classList.remove('is-success'); }
    finally { locationButton.disabled = false; }
  } });
  const fields = [name, area, city];
  if (worker) {
    fields.splice(1, 0,
      h('div', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.onboarding.skills), ChipGroup({ options: SKILLS.map((skill) => en.skills[skill]), selected: selectedSkills.map((skill) => en.skills[skill] ?? skill), label: en.onboarding.skills, onChange: (next) => { selectedSkills = next.map((label) => SKILLS.find((skill) => en.skills[skill] === label)).filter(Boolean); } })),
      h('div', { className: 'wc-rate-row' }, Field({ id: 'profile-rate', label: en.onboarding.rate, type: 'number', min: '1', inputmode: 'numeric', value: user?.rate ?? '', placeholder: en.onboarding.ratePlaceholder }), h('div', { className: 'wc-field' }, h('label', { className: 'wc-label', for: 'profile-rate-unit' }, en.forms.chooseRate), h('select', { id: 'profile-rate-unit', className: 'wc-input' }, h('option', { value: 'day', selected: (user?.rateUnit ?? 'day') === 'day' }, en.onboarding.perDay), h('option', { value: 'hour', selected: user?.rateUnit === 'hour' }, en.onboarding.perHour))))
    );
  }
  const photoInput = h('input', { className: 'wc-visually-hidden', id: 'profile-photo', type: 'file', accept: 'image/*', capture: 'user', onChange: (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const preview = h('img', { className: 'wc-photo-preview', src: URL.createObjectURL(file), alt: en.onboarding.photo });
    photoPreview.replaceChildren(preview);
  } });
  const photoPreview = h('span', { className: 'wc-photo-preview-wrap', 'aria-hidden': 'true' });
  const photo = h('div', { className: 'wc-photo-field' }, photoPreview, h('div', {}, h('label', { className: 'wc-label', for: 'profile-photo' }, en.onboarding.photo), h('p', { className: 'wc-hint' }, en.onboarding.photoHint), h('label', { className: 'wc-button wc-button--outline wc-photo-pick', for: 'profile-photo' }, en.common.choosePhoto)) , photoInput);
  if (worker) fields.push(photo);
  const submit = Button({ label: en.onboarding.submit, type: 'submit', className: 'wc-full' });
  const form = h('form', { className: 'wc-form', onSubmit: async (event) => {
    event.preventDefault(); error.hidden = true; status.hidden = true;
    const nameValue = name.querySelector('input').value.trim();
    const areaValue = area.querySelector('input').value.trim();
    const cityValue = city.querySelector('select').value;
    if (!nameValue || !areaValue || !cityValue || (worker && !selectedSkills.length)) { error.textContent = worker && !selectedSkills.length ? en.profileForm.skillRequired : en.onboarding.profileError; error.hidden = false; return; }
    submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    try {
      const profile = { name: nameValue, area: areaValue, city: cityValue, profileComplete: true };
      if (worker) {
        const rate = Number(form.querySelector('#profile-rate').value);
        if (!Number.isFinite(rate) || rate < 1) { error.textContent = en.forms.required; error.hidden = false; return; }
        Object.assign(profile, { skills: selectedSkills, rate, rateUnit: form.querySelector('#profile-rate-unit').value });
      }
      await window.workcred.users.updateMe(profile);
      status.textContent = en.onboarding.saved; status.hidden = false;
      navigate(worker ? '/w/home' : '/c/find');
    } catch (reason) { error.textContent = reason.message || en.errors.generic; error.hidden = false; }
    finally { submit.disabled = false; submit.removeAttribute('aria-busy'); }
  } }, ...fields, locationButton, locationError, error, submit);
  return authLayout(h('section', { className: 'wc-auth-card wc-onboarding' }, ProgressSteps({ label: worker ? en.onboarding.workerProgress : en.onboarding.customerProgress }), h('p', { className: 'wc-eyebrow' }, en.brand.name), h('h1', {}, worker ? en.onboarding.workerTitle : en.onboarding.customerTitle), h('p', { className: 'wc-lead' }, worker ? en.onboarding.rateHint : en.onboarding.customerHint), form));
}
