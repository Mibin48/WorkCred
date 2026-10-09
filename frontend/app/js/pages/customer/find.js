import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { EmptyState, Skeleton } from '../../components/index.js';

export function renderFind({ navigate, user }) {
  return customerShell({ title: en.customer.find, active: '/c/find', navigate, user, content: h('div', { className: 'wc-page-stack' }, h('p', { className: 'wc-eyebrow' }, en.brand.tagline), h('h2', { className: 'wc-page-title' }, en.pages.findTitle), h('p', { className: 'wc-lead' }, en.pages.findBody), EmptyState({ title: en.pages.findTitle, body: en.placeholder.freeNow }), Skeleton({ rows: 3 })) });
}
