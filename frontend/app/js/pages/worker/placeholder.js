import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { EmptyState, Skeleton, Badge } from '../../components/index.js';

const content = {
  '/w/work': [en.pages.myWorkTitle, en.pages.workerMyWork],
  '/w/passport': [en.pages.passportTitle, en.pages.workerPassport],
  '/w/post': [en.pages.postTitle, en.pages.workerPost],
};
export function renderWorkerPlaceholder({ path, navigate, user, dev = false }) {
  const [title, body] = content[path] ?? content['/w/work'];
  return workerShell({ title, active: path, navigate, user, content: h('div', { className: 'wc-page-stack' },
    h('p', { className: 'wc-eyebrow' }, en.brand.name), h('h2', { className: 'wc-page-title' }, title),
    EmptyState({ title, body }), h('section', { className: 'wc-preview-panel' }, dev ? Badge({ label: en.common.coming, kind: 'ochre' }) : null, h('p', { className: 'wc-label' }, en.pages.samplePreview), Skeleton({ rows: 3 }))
  ) });
}
