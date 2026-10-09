import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { EmptyState, Skeleton } from '../../components/index.js';

export function renderFeed({ navigate, user }) {
  return customerShell({ title: en.pages.feedTitle, active: '/feed', navigate, user, content: h('div', { className: 'wc-page-stack' }, h('p', { className: 'wc-eyebrow' }, en.brand.tagline), EmptyState({ title: en.pages.feedTitle, body: en.pages.feedBody }), Skeleton({ rows: 2 })) });
}
