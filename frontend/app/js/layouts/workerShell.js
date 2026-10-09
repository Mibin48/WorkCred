import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { TabBar, TopBar } from '../components/index.js';
import { OfflineBanner } from '../components/index.js';

const tabs = [
  { path: '/w/home', label: en.nav.home, icon: '⌂' },
  { path: '/w/work', label: en.nav.work, icon: '▤' },
  { path: '/w/passport', label: en.nav.passport, icon: '◉' },
  { path: '/w/post', label: en.nav.post, icon: '+' },
  { path: '/w/me', label: en.nav.me, icon: '○' },
];

export function workerShell({ title, active, content, navigate, user }) {
  return h('div', { className: 'wc-shell' }, OfflineBanner(), TopBar({ title, location: user.city }), h('main', { className: 'wc-page-content' }, content), TabBar({ items: tabs, active, onNavigate: navigate }));
}
