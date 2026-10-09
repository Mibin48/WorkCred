import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { EmptyState, Skeleton, Badge } from '../../components/index.js';

const content = {
  '/c/free-now': [en.pages.freeNowPageTitle, en.pages.customerFreeNow],
  '/c/post-job': [en.pages.postJobTitle, en.pages.customerPostJob],
  '/c/bookings': [en.pages.bookingsTitle, en.pages.customerBookings],
  '/c/saved': [en.pages.savedTitle, en.pages.customerSaved],
};
export function renderCustomerPlaceholder({ path, navigate, user, dev = false }) {
  const [title, body] = content[path] ?? content['/c/free-now'];
  return customerShell({ title, active: path, navigate, user, content: h('div', { className: 'wc-page-stack' },
    h('p', { className: 'wc-eyebrow' }, en.brand.name), h('h2', { className: 'wc-page-title' }, title),
    EmptyState({ title, body }), h('section', { className: 'wc-preview-panel' }, dev ? Badge({ label: en.common.coming, kind: 'ochre' }) : null, h('p', { className: 'wc-label' }, en.pages.samplePreview), Skeleton({ rows: 3 }))
  ) });
}
