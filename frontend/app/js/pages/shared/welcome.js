import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Card } from '../../components/index.js';
import { authLayout } from '../../layouts/authLayout.js';

export function renderWelcome({ navigate }) {
  const choose = (role) => { navigate('/login', { role }); };
  return authLayout(h('section', { className: 'wc-welcome' },
    h('p', { className: 'wc-eyebrow' }, en.welcome.eyebrow),
    h('h1', {}, en.welcome.title.split('\n')[0], ' ', h('em', {}, en.welcome.accent)),
    h('p', { className: 'wc-lead' }, en.welcome.body),
    h('div', { className: 'wc-role-cards' },
      Card({ children: h('button', { className: 'wc-role-card', type: 'button', onClick: () => choose('worker') }, h('span', { className: 'wc-role-mark', 'aria-hidden': 'true' }, '↗'), h('span', {}, h('strong', {}, en.welcome.worker), h('small', {}, en.welcome.workerBody))) }),
      Card({ children: h('button', { className: 'wc-role-card', type: 'button', onClick: () => choose('customer') }, h('span', { className: 'wc-role-mark', 'aria-hidden': 'true' }, '⌂'), h('span', {}, h('strong', {}, en.welcome.customer), h('small', {}, en.welcome.customerBody))) }),
    ),
    h('p', { className: 'wc-auth-switch' }, en.welcome.login, ' ', h('a', { href: '#/login', onClick: (e) => { e.preventDefault(); navigate('/login'); } }, en.common.logIn)),
  ));
}
