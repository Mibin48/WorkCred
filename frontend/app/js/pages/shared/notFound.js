import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Button } from '../../components/index.js';
import { authLayout } from '../../layouts/authLayout.js';

export function renderNotFound({ navigate, homePath = '/welcome' }) {
  return authLayout(h('section', { className: 'wc-auth-card wc-not-found' }, h('p', { className: 'wc-eyebrow' }, '404'), h('h1', {}, en.pages.pageNotFound), h('p', { className: 'wc-lead' }, en.placeholder.preview), Button({ label: en.pages.goHome, onClick: () => navigate(homePath) })));
}
