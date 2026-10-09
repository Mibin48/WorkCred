import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { TabBar, TopBar, OfflineBanner } from '../components/index.js';

const tabs = [
  { path: '/c/find', label: en.nav.find, icon: '⌕' },
  { path: '/c/free-now', label: en.nav.freeNow, icon: '◷' },
  { path: '/c/post-job', label: en.nav.postJob, icon: '+' },
  { path: '/c/bookings', label: en.nav.bookings, icon: '▤' },
  { path: '/c/saved', label: en.nav.saved, icon: '♡' },
];

export function customerShell({ title, active, content, navigate, user }) {
  const topbar = TopBar({ title, location: user.city });
  topbar.append(h('a', { className: 'wc-topbar-profile', href: '#/c/me', 'aria-label': en.nav.me, onClick: (event) => { event.preventDefault(); navigate('/c/me'); } }, '○'));
  return h('div', { className: 'wc-shell' }, OfflineBanner(), topbar, h('main', { className: 'wc-page-content' }, content), TabBar({ items: tabs, active, onNavigate: navigate }));
}
