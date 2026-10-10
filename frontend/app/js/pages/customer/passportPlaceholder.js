import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Button } from '../../components/index.js';

export function renderPassportPlaceholder({ navigate, slug }) {
  return h('main', { className: 'wc-public-passport-placeholder' }, h('a', { className: 'wc-app-brand', href: '/app/' }, h('img', { src: '/assets/workcred-mark.png', alt: '', width: 38, height: 38 }), h('span', {}, en.brand.name)), h('section', { className: 'wc-auth-card' }, h('p', { className: 'wc-eyebrow' }, en.brand.name), h('h1', {}, en.passport.publicTitle.replace('{name}', 'Worker')), h('p', { className: 'wc-lead' }, en.passport.publicComingSoon), Button({ label: en.passport.publicBack, variant: 'outline', onClick: () => navigate('/c/find') }), h('span', { className: 'wc-hint' }, `#${slug}`)));
}
