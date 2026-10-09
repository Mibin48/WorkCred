import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';

export function authLayout(content) {
  return h('div', { className: 'wc-auth-layout' },
    h('a', { className: 'wc-app-brand', href: '/#main' }, h('img', { src: '/assets/workcred-mark.png', alt: '', width: 38, height: 38 }), h('span', {}, en.brand.name)),
    content,
    h('p', { className: 'wc-auth-footnote' }, en.brand.tagline),
  );
}
