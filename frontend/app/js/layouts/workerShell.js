import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { TabBar, OfflineBanner } from '../components/index.js';

const tabs = [
  { path: '/w/home', label: 'Home', icon: '⌂' },
  { path: '/w/work', label: 'My Work', icon: '▤' },
  { path: '/w/passport', label: 'Passport', icon: '🛡️' },
  { path: '/w/me', label: 'Me', icon: '👤' },
];

export function workerShell({ title, active, content, navigate, user }) {
  const userName = user?.name || 'Ravi Kumar';
  const userInitial = userName.trim().charAt(0).toUpperCase();
  const areaName = user?.area || 'Indiranagar';
  const wardNumber = '174';

  const topbar = h('header', { className: 'wc-app-topbar wc-worker-header' },
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
            h('small', { className: 'wc-brand-tagline' }, 'Proof of work, work near you.')
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
          href: '#/w/home',
          className: `wc-nav-pill ${active === '/w/home' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/w/home'); }
        }, 'Home'),
        h('a', {
          href: '#/w/work',
          className: `wc-nav-pill ${active === '/w/work' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/w/work'); }
        }, 'My Work (2)'),
        h('a', {
          href: '#/w/passport',
          className: `wc-nav-pill ${active === '/w/passport' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/w/passport'); }
        }, 'Work Passport'),
        h('a', {
          href: '#/w/me',
          className: `wc-nav-pill ${active === '/w/me' ? 'is-active' : ''}`,
          onClick: (event) => { event.preventDefault(); navigate('/w/me'); }
        }, 'Profile & Rates')
      ),
      h('div', { className: 'wc-customer-header-actions' },
        h('a', {
          className: 'wc-topbar-icon-btn wc-bell-btn-wrap',
          href: '#/feed',
          'aria-label': en.feed.title,
          title: en.feed.title,
          onClick: (e) => { e.preventDefault(); navigate('/feed'); }
        },
          '🔔',
          h('span', { className: 'wc-notification-dot' })
        ),
        h('a', {
          className: 'wc-topbar-profile-pill',
          href: '#/w/me',
          'aria-label': en.nav.me,
          title: userName,
          onClick: (event) => { event.preventDefault(); navigate('/w/me'); }
        },
          user?.photoUrl
            ? h('img', { className: 'wc-profile-avatar-img', src: user.photoUrl, alt: '' })
            : h('span', { className: 'wc-profile-avatar-circle' }, userInitial),
          h('div', { className: 'wc-profile-pill-text' },
            h('strong', { className: 'wc-profile-name' }, userName),
            h('small', { className: 'wc-profile-role' }, 'Master Tradesperson')
          )
        )
      )
    ),

    // Mobile Header Row (visible below 64rem via media queries)
    h('div', { className: 'wc-mobile-topbar-row' },
      h('a', { className: 'wc-worker-brand-link', href: '/', 'aria-label': en.brand.name },
        h('span', { className: 'wc-brand-wordmark-styled' },
          h('strong', {}, 'Work'),
          h('em', {}, 'Cred')
        )
      ),
      h('div', { className: 'wc-mobile-ward-pill' },
        h('span', { className: 'wc-ward-pin', 'aria-hidden': 'true' }, '📍'),
        h('strong', {}, `${areaName}, Ward ${wardNumber}`),
        h('span', { className: 'wc-caret' }, '▾')
      ),
      h('div', { className: 'wc-mobile-header-actions' },
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
          href: '#/w/me',
          'aria-label': en.nav.me,
          onClick: (event) => { event.preventDefault(); navigate('/w/me'); }
        },
          user?.photoUrl
            ? h('img', { className: 'wc-avatar-img-round', src: user.photoUrl, alt: '' })
            : userInitial
        )
      )
    )
  );

  const civicFooter = h('footer', { className: 'wc-civic-footer' },
    h('div', { className: 'wc-civic-footer-inner' },
      h('div', { className: 'wc-footer-brand' },
        h('img', { src: '/assets/workcred-mark.png', alt: '', width: 24, height: 24 }),
        h('strong', {}, 'Work'),
        h('em', {}, 'Cred'),
        h('span', {}, '— Municipal Civic Guild & Craftsman Registry')
      ),
      h('p', { className: 'wc-footer-copy' },
        'Protected under Bengaluru Civic Trades Charter • Fair wage guaranteed • Verified Ward Record.'
      )
    )
  );

  return h('div', { className: 'wc-shell wc-shell--worker' },
    OfflineBanner(),
    topbar,
    h('main', { className: 'wc-page-content' }, content),
    civicFooter,
    TabBar({ items: tabs, active, onNavigate: navigate })
  );
}


