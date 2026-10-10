import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { Button, TabBar, OfflineBanner } from '../components/index.js';

const tabs = [
  { path: '/c/find', label: en.nav.find, icon: '⌕' },
  { path: '/c/free-now', label: en.nav.freeNow, icon: '◷' },
  { path: '/c/post-job', label: en.nav.postJob, icon: '+' },
  { path: '/c/bookings', label: en.nav.bookings, icon: '▤' },
  { path: '/c/saved', label: en.nav.saved, icon: '♡' },
];

export function customerShell({ title, active, content, navigate, user }) {
  const showContextSubbar = active !== '/c/find';
  const topbar = h('header', { className: 'wc-app-topbar wc-customer-header' },
    h('a', { className: 'wc-customer-brand', href: '/', 'aria-label': en.brand.name },
      h('img', { src: '/assets/workcred-mark.png', alt: '', width: 42, height: 42 }),
      h('span', {}, h('strong', {}, 'Work'), h('em', {}, 'Cred'), h('small', {}, en.brand.tagline))
    ),
    h('nav', { className: 'wc-customer-primary-nav', 'aria-label': en.common.navigation },
      h('a', { href: '/#how-it-works' }, 'How it works'),
      h('a', { href: '#/c/find', className: active === '/c/find' ? 'is-active' : '', onClick: (event) => { event.preventDefault(); navigate('/c/find'); } }, 'Find workers'),
      h('a', { href: '#/c/bookings', className: active === '/c/bookings' ? 'is-active' : '', onClick: (event) => { event.preventDefault(); navigate('/c/bookings'); } }, 'My bookings'),
      h('a', { href: '#/c/saved', className: active === '/c/saved' ? 'is-active' : '', onClick: (event) => { event.preventDefault(); navigate('/c/saved'); } }, 'Saved')
    ),
    h('div', { className: 'wc-customer-header-actions' },
      h('a', { className: 'wc-topbar-icon-btn', href: '#/feed', 'aria-label': en.feed.title, title: en.feed.title, onClick: (e) => { e.preventDefault(); navigate('/feed'); } }, '📰'),
      Button({ label: `+ ${en.nav.postJob}`, onClick: () => navigate('/c/post-job') }),
      h('a', { className: 'wc-topbar-profile', href: '#/c/me', 'aria-label': en.nav.me, title: user.name || 'Profile', onClick: (event) => { event.preventDefault(); navigate('/c/me'); } }, (user.name || 'W').trim().charAt(0).toUpperCase())
    ),

    showContextSubbar ? h('div', { className: 'wc-topbar-copy wc-customer-context' }, h('h1', {}, title), h('span', { className: 'wc-location-chip' }, h('span', { 'aria-hidden': 'true' }, '⌖'), user.city || en.brand.name)) : null
  );
  return h('div', { className: 'wc-shell wc-shell--customer' }, OfflineBanner(), topbar, h('main', { className: 'wc-page-content' }, content), TabBar({ items: tabs, active, onNavigate: navigate }));
}
