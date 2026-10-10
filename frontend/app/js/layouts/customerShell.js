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
  const userName = user?.name || 'Ramesh Rao';
  const userInitial = userName.trim().charAt(0).toUpperCase();
  const areaName = user?.area || 'Indiranagar';
  const wardNumber = '174';

  const topbar = h('header', { className: 'wc-app-topbar wc-customer-header' },
    // Desktop Header Cluster (visible above 64rem via media queries)
    h('div', { className: 'wc-desktop-header-wrap' },
      h('div', { className: 'wc-customer-brand-cluster' },
        h('a', { className: 'wc-customer-brand', href: '/', 'aria-label': en.brand.name },
          h('img', { src: '/assets/workcred-mark.png', alt: '', width: 34, height: 34 }),
          h('div', { className: 'wc-brand-copy' },
            h('div', { className: 'wc-brand-title' },
              h('strong', {}, 'Work'),
              h('em', {}, 'Cred'),
              h('span', { className: 'wc-civic-tag' }, 'CIVIC')
            ),
            h('small', { className: 'wc-brand-tagline' }, 'Local Hands • Real Trust')
          )
        ),
        h('div', { className: 'wc-ward-dropdown-pill' },
          h('span', { className: 'wc-ward-pin', 'aria-hidden': 'true' }, '📍'),
          h('div', { className: 'wc-ward-text' },
            h('span', { className: 'wc-ward-label' }, 'Ward Jurisdiction'),
            h('strong', { className: 'wc-ward-name' }, `${areaName}, Ward ${wardNumber} ▾`)
          )
        )
      ),
      h('nav', { className: 'wc-customer-primary-nav', 'aria-label': en.common.navigation },
        h('a', {
          href: '#/c/find',
          className: `wc-nav-pill ${active === '/c/find' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/c/find'); }
        }, 'Find Workers'),
        h('a', {
          href: '#/c/bookings',
          className: `wc-nav-pill ${active === '/c/bookings' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/c/bookings'); }
        }, 'My Bookings (2)'),
        h('a', {
          href: '#/c/post-job',
          className: `wc-nav-pill ${active === '/c/post-job' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/c/post-job'); }
        }, 'Post a Job'),
        h('a', {
          href: '#/c/saved',
          className: `wc-nav-pill ${active === '/c/saved' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/c/saved'); }
        }, 'Saved')
      ),
      h('div', { className: 'wc-customer-header-actions' },
        h('a', {
          className: 'wc-topbar-icon-btn wc-bell-btn',
          href: '#/feed',
          'aria-label': en.feed.title,
          title: en.feed.title,
          onClick: (e) => { e.preventDefault(); navigate('/feed'); }
        }, '🔔'),
        h('a', {
          className: 'wc-topbar-profile-pill',
          href: '#/c/me',
          'aria-label': en.nav.me,
          title: userName,
          onClick: (event) => { event.preventDefault(); navigate('/c/me'); }
        },
          h('span', { className: 'wc-profile-avatar-circle' }, userInitial),
          h('div', { className: 'wc-profile-pill-text' },
            h('strong', { className: 'wc-profile-name' }, userName),
            h('small', { className: 'wc-profile-role' }, 'Resident Member')
          )
        )
      )
    ),

    // Mobile Header Row (visible below 64rem via media queries)
    h('div', { className: 'wc-mobile-topbar-row' },
      h('a', { className: 'wc-mobile-brand-avatar', href: '/', 'aria-label': en.brand.name },
        h('span', {}, 'W')
      ),
      h('div', { className: 'wc-mobile-ward-pill' },
        h('span', { className: 'wc-ward-pin', 'aria-hidden': 'true' }, '📍'),
        h('strong', {}, `${areaName}, Ward ${wardNumber}`),
        h('span', { className: 'wc-caret' }, '▾')
      ),
      h('div', { className: 'wc-mobile-header-actions' },
        h('button', {
          type: 'button',
          className: 'wc-topbar-icon-btn',
          'aria-label': 'Search',
          onClick: () => {
            const input = document.querySelector('.wc-registry-search-input');
            if (input) input.focus();
          }
        }, '⌕'),
        h('a', {
          className: 'wc-topbar-icon-btn wc-bell-btn-wrap',
          href: '#/feed',
          'aria-label': en.feed.title,
          onClick: (e) => { e.preventDefault(); navigate('/feed'); }
        },
          '🔔',
          h('span', { className: 'wc-notification-dot' })
        ),
        h('a', {
          className: 'wc-mobile-user-avatar',
          href: '#/c/me',
          'aria-label': en.nav.me,
          onClick: (event) => { event.preventDefault(); navigate('/c/me'); }
        }, userInitial)
      )
    ),

    showContextSubbar ? h('div', { className: 'wc-topbar-copy wc-customer-context' },
      h('h1', {}, title),
      h('span', { className: 'wc-location-chip' },
        h('span', { 'aria-hidden': 'true' }, '⌖'),
        user?.city || areaName
      )
    ) : null
  );

  const civicFooter = h('footer', { className: 'wc-civic-footer' },
    h('div', { className: 'wc-civic-footer-inner' },
      h('div', { className: 'wc-footer-brand' },
        h('img', { src: '/assets/workcred-mark.png', alt: '', width: 24, height: 24 }),
        h('strong', {}, 'Work'),
        h('em', {}, 'Cred'),
        h('span', {}, '— Municipal Civic Trust & Registry Platform')
      ),
      h('p', { className: 'wc-footer-copy' },
        '© 2025 WorkCred Civic Registry. Local Hands • Real Trust. Verified Ward Record.'
      )
    )
  );

  return h('div', { className: 'wc-shell wc-shell--customer' },
    OfflineBanner(),
    topbar,
    h('main', { className: 'wc-page-content' }, content),
    civicFooter,
    TabBar({ items: tabs, active, onNavigate: navigate })
  );
}

