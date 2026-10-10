import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Avatar, Badge, Button, Field } from '../../components/index.js';

import { getQueue, discardQueueItem, flushQueue } from '../../offline/queue.js';
import { http } from '../../api/http.js';
import { APP_VERSION } from '../../config.js';
import { store } from '../../store.js';

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

  // Data saver line
  const isDataSaver = navigator.connection?.saveData === true;
  const dataSaverNotice = isDataSaver ? h('p', { className: 'wc-data-saver-line' }, `⚡ ${en.offlineData.dataSaverOn}`) : null;

  // Offline queue section
  const queueItems = getQueue();
  const queueSection = queueItems.length ? h('section', { className: 'wc-card wc-queue-section' },
    h('h3', {}, en.offlineData.notSentTitle),
    h('ul', { className: 'wc-queue-list' }, ...queueItems.map((item) =>
      h('li', {},
        h('span', {}, `${item.actionType} ${item.targetName || item.targetId}`),
        Button({ label: en.offlineData.discardQueue, variant: 'ghost', onClick: () => { discardQueueItem(item.id); navigate('/c/me'); } })
      )
    )),
    Button({ label: en.offlineData.retryQueue, variant: 'outline', onClick: async () => {
      const token = store.get().session?.accessToken;
      await flushQueue(http, token);
      navigate('/c/me');
    } })
  ) : null;

  const versionLine = h('p', { className: 'wc-hint' }, en.offlineData.appVersion.replace('{version}', APP_VERSION));

  const page = h('div', { className: 'wc-page-stack' },
    h('section', { className: 'wc-profile-summary' },
      Avatar({ name: user.name }),
      h('div', {}, h('h2', {}, user.name || en.profile.title), Badge({ label: en.profile.phone, kind: 'success' }), h('p', { className: 'wc-hint' }, `+91 ${user.phone}`)),
      dataSaverNotice
    ),
    queueSection,
    h('section', { className: 'wc-profile-form' }, h('h2', {}, en.profile.editTitle), form, versionLine, logout)
  );
  const shell = worker ? workerShell : customerShell;
  return shell({ title: en.nav.me, active: worker ? '/w/me' : '/c/me', navigate, user, content: page });
}

