import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, Chip, Field, Skeleton } from '../../components/index.js';
import { CompassBar, DayTimePicker, LocalityPicker, Stepper } from '../../components/customer.js';
import { compassApi } from '../../api/compass.api.js';
import { jobsApi } from '../../api/jobs.api.js';
import { store } from '../../store.js';
import { formatMoney, formatSkill, friendlyError } from '../../utils/format.js';
import { coordinatesForLocality } from '../../utils/geo.js';
import { SKILLS } from '/shared/constants.js';

const token = () => store.get().session?.accessToken;
const DRAFT_KEY = 'workcred.customer.jobDraft';

export function renderPostJob({ navigate, user }) {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } })();
  const state = { skill: saved.skill || '', workers: saved.workers || 1, hours: saved.hours || 4, date: saved.date || '', time: saved.time || '', rate: saved.rate || '', description: saved.description || '', area: saved.area || user.area || '', step: false, posted: false };
  const root = h('div', { className: 'wc-post-job' });
  const page = customerShell({ title: en.pages.postJobTitle, active: '/c/post-job', navigate, user, content: root });
  let dirty = false;
  let disposed = false;
  let compassVersion = 0;
  let compassTimer;
  let postIdempotencyKey = null;
  page.dispose = () => { disposed = true; clearTimeout(compassTimer); window.removeEventListener('beforeunload', beforeUnload); window.workcredLeaveGuard = null; };

  function beforeUnload(event) { if (dirty && !state.posted) { event.preventDefault(); event.returnValue = ''; } }
  window.addEventListener('beforeunload', beforeUnload);
  window.workcredLeaveGuard = () => {
    if (!dirty || state.posted) return true;
    if (!window.confirm(en.postJob.leaveConfirm)) return false;
    sessionStorage.removeItem(DRAFT_KEY);
    dirty = false;
    return true;
  };

  const datePicker = DayTimePicker({ date: state.date, time: state.time, onChange: (value) => { state.date = value.date; state.time = value.time; saveDraft(); } });
  state.date ||= datePicker.querySelector('input[type="date"]').value;
  state.time ||= datePicker.querySelector('input[type="time"]').value;
  const rateField = Field({ id: 'job-rate', label: en.postJob.rateLabel, type: 'number', inputmode: 'numeric', min: 50, max: 2000, value: state.rate, placeholder: '550', required: true, onInput: (event) => { state.rate = event.currentTarget.value; saveDraft(); scheduleCompass(); } });
  const description = h('textarea', { id: 'job-description', className: 'wc-input wc-textarea', maxlength: 300, placeholder: en.postJob.descPlaceholder, 'aria-label': en.postJob.descLabel, onInput: (event) => { state.description = event.currentTarget.value; count.textContent = `${state.description.length}/300`; saveDraft(); } });
  description.value = state.description;
  const count = h('span', { className: 'wc-hint' }, `${state.description.length}/300`);
  const compass = h('div', { className: 'wc-compass-wrap' }, Skeleton({ rows: 2 }));
  const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
  const skillGroup = h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': en.postJob.skillLabel }, SKILLS.map((skill) => Chip({ label: formatSkill(skill), selected: state.skill === skill, onClick: (event) => { state.skill = skill; skillGroup.querySelectorAll('.wc-chip').forEach((chip) => { chip.classList.remove('is-selected'); chip.setAttribute('aria-pressed', 'false'); }); event.currentTarget.classList.add('is-selected'); event.currentTarget.setAttribute('aria-pressed', 'true'); saveDraft(); scheduleCompass(); } })));
  const workersStepper = Stepper({ label: en.postJob.workersLabel, value: state.workers, min: 1, max: 10, onChange: (value) => { state.workers = value; saveDraft(); } });
  const hoursStepper = Stepper({ label: en.postJob.hoursLabel, value: state.hours, min: 1, max: 12, onChange: (value) => { state.hours = value; saveDraft(); } });
  const areaButton = Button({ label: `${en.postJob.locationLabel}: ${state.area || user.area} ⌄`, variant: 'outline', onClick: () => LocalityPicker({ value: state.area || user.area, trigger: areaButton, onSelect: (value) => { state.area = value; areaButton.textContent = `${en.postJob.locationLabel}: ${value} ⌄`; saveDraft(); scheduleCompass(); } }) });
  const quickRates = h('div', { className: 'wc-quick-rates' });

  function saveDraft() {
    dirty = true;
    const draft = { ...state }; delete draft.step; delete draft.posted;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }
  function scheduleCompass() {
    clearTimeout(compassTimer);
    compassTimer = setTimeout(async () => {
      const version = ++compassVersion;
      if (!state.skill || !state.area) { compass.replaceChildren(h('p', { className: 'wc-hint' }, en.postJob.compassLoading)); return; }
      try {
        const data = await compassApi.getCompass({ skill: state.skill, area: state.area, city: user.city || 'Pune', rate: Number(state.rate) || undefined, rateUnit: 'hour' });
        if (disposed || version !== compassVersion) return;
        compass.replaceChildren(CompassBar({ data, rate: Number(state.rate) || data.median }));
        const rangeLow = data.p25 ?? 500; const rangeHigh = data.p75 ?? 650; const rate = Number(state.rate) || Number(data.median);
        const verdict = rate < rangeLow ? 'low' : rate > rangeHigh ? 'high' : 'fair';
        const sentence = verdict === 'low' ? en.postJob.compassLow : verdict === 'high' ? en.postJob.compassHigh : en.postJob.compassFair.replace('{rate}', String(rate)).replace('{low}', String(rangeLow)).replace('{high}', String(rangeHigh));
        compass.append(h('p', { className: 'wc-compass-copy' }, sentence));
        quickRates.replaceChildren(h('span', { className: 'wc-hint' }, en.postJob.quickSet), ...[[data.p25, en.postJob.quickLow], [data.median, en.postJob.quickFair], [data.p75, en.postJob.quickHigh]].map(([value, label]) => Button({ label: label.replace('{val}', String(value)), variant: 'ghost', onClick: () => { rateField.querySelector('input').value = value; state.rate = String(value); saveDraft(); scheduleCompass(); } })));
      } catch { if (!disposed && version === compassVersion) compass.replaceChildren(h('p', { className: 'wc-hint' }, en.postJob.compassSmallSample)); }
    }, 400);
  }

  function summary() {
    const rate = Number(state.rate) || 0;
    return h('section', { className: 'wc-review-card' }, h('h2', {}, en.postJob.reviewTitle),
      h('dl', {}, h('dt', {}, en.postJob.reviewSkill), h('dd', {}, formatSkill(state.skill)), h('dt', {}, en.postJob.workersLabel), h('dd', {}, String(state.workers)), h('dt', {}, en.postJob.reviewHours.replace('{hours}', String(state.hours))), h('dd', {}, ''), h('dt', {}, en.postJob.reviewStart), h('dd', {}, `${state.date} ${state.time}`), h('dt', {}, en.postJob.reviewRate), h('dd', {}, `${formatMoney(rate)} per hour`), h('dt', {}, en.postJob.reviewLocation), h('dd', {}, state.area || user.area), state.description ? [h('dt', {}, en.postJob.reviewDesc), h('dd', {}, state.description)] : null)
    );
  }

  function renderForm() {
    const rate = Number(state.rate);
    if (!state.skill || !state.area || !Number.isFinite(rate) || rate < 50 || rate > 2000) { error.textContent = !state.skill ? en.postJob.skillRequired : en.postJob.rateInvalid; error.hidden = false; return; }
    error.hidden = true; state.step = true;
    root.replaceChildren(h('div', { className: 'wc-page-stack wc-post-job-form' }, h('p', { className: 'wc-eyebrow' }, en.brand.name), h('h2', { className: 'wc-page-title' }, en.postJob.title),
      h('section', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.postJob.skillLabel), skillGroup),
      h('div', { className: 'wc-stepper-row' }, workersStepper, hoursStepper), datePicker,
      rateField, quickRates, compass,
      h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.postJob.descLabel), description, count),
      areaButton, error,
      h('div', { className: 'wc-post-actions' }, Button({ label: en.common.continue, className: 'wc-full', onClick: renderReview }))
    ));
    scheduleCompass();
  }

  function renderReview() {
    if (!state.step) { renderForm(); return; }
    const start = new Date(`${state.date}T${state.time}`);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) { error.textContent = en.postJob.startRequired; error.hidden = false; return; }
    root.replaceChildren(h('div', { className: 'wc-page-stack wc-post-review' }, summary(), error,
      h('div', { className: 'wc-post-actions' }, Button({ label: en.common.back, variant: 'ghost', onClick: renderForm }), Button({ label: en.postJob.postBtn, className: 'wc-full', onClick: post })))
    );
  }

  async function post(event) {
    const button = event.currentTarget; button.disabled = true; button.textContent = en.postJob.posting;
    try {
      const localityPoint = coordinatesForLocality(state.area);
      postIdempotencyKey ||= crypto.randomUUID();
      await jobsApi.createJob({ title: `${formatSkill(state.skill)} needed in ${state.area}`, description: state.description, skill: state.skill, area: state.area, city: user.city || 'Pune', lat: localityPoint?.lat ?? user.location?.coordinates?.[1] ?? 18.5204, lng: localityPoint?.lng ?? user.location?.coordinates?.[0] ?? 73.8567, rate: Number(state.rate), rateUnit: 'hour', slotsNeeded: Number(state.workers), hoursPerWorker: Number(state.hours), scheduledAt: new Date(`${state.date}T${state.time}`).toISOString() }, postIdempotencyKey, token());
      state.posted = true; dirty = false; postIdempotencyKey = null; sessionStorage.removeItem(DRAFT_KEY);
      root.replaceChildren(h('section', { className: 'wc-post-success' }, h('span', { className: 'wc-empty-mark', 'aria-hidden': 'true' }, '✓'), h('h2', {}, en.postJob.successTitle), h('p', { className: 'wc-lead' }, en.postJob.successBody), Button({ label: en.postJob.viewJobs, className: 'wc-full', onClick: () => navigate('/c/bookings?tab=jobs') }), Button({ label: en.postJob.postAnother, variant: 'ghost', className: 'wc-full', onClick: () => { state.step = false; state.posted = false; state.skill = ''; state.rate = ''; renderForm(); } })));
    } catch (reason) { error.textContent = friendlyError(reason); error.hidden = false; button.disabled = false; button.textContent = en.postJob.postBtn; }
  }

  root.replaceChildren();
  renderForm();
  return page;
}
