/**
 * WorkCred Dev Inspector Drawer
 * Active only when ?dev=1 is present in the URL.
 * Built with WorkCred Warm design tokens.
 */

import { h } from '../utils/dom.js';
import { readDb, resetDb, writeDb } from '../mock/db.js';
import { store } from '../store.js';
import { passportApi } from '../api/passport.api.js';
import { eventBus } from '../mock/events.js';
import { EVENT_NAMES } from '../../../shared/constants.js';

const requestLog = [];

export function logDevRequest(method, path, status, latencyMs) {
  requestLog.unshift({
    timestamp: new Date().toLocaleTimeString(),
    method,
    path,
    status,
    latencyMs,
  });
  if (requestLog.length > 50) requestLog.pop();
}

export function DevInspector({ navigate }) {
  if (typeof location === 'undefined' || new URLSearchParams(location.search).get('dev') !== '1') {
    return h('div', { hidden: true });
  }

  let activeTab = 'data';
  let selectedCollection = 'users';
  let searchQuery = '';

  const drawerContainer = h('aside', { className: 'wc-dev-drawer', 'aria-label': 'Developer Inspector' });

  const tabDataBtn = h('button', { className: 'wc-dev-tab is-active', onClick: () => setTab('data') }, 'Data');
  const tabReqsBtn = h('button', { className: 'wc-dev-tab', onClick: () => setTab('requests') }, 'Requests');
  const tabCtrlBtn = h('button', { className: 'wc-dev-tab', onClick: () => setTab('controls') }, 'Controls');
  const tabSessBtn = h('button', { className: 'wc-dev-tab', onClick: () => setTab('session') }, 'Session');

  const tabBar = h('nav', { className: 'wc-dev-tabs' }, tabDataBtn, tabReqsBtn, tabCtrlBtn, tabSessBtn);
  const contentArea = h('div', { className: 'wc-dev-content' });

  function setTab(tab) {
    activeTab = tab;
    [tabDataBtn, tabReqsBtn, tabCtrlBtn, tabSessBtn].forEach((btn) => btn.classList.remove('is-active'));
    if (tab === 'data') tabDataBtn.classList.add('is-active');
    if (tab === 'requests') tabReqsBtn.classList.add('is-active');
    if (tab === 'controls') tabCtrlBtn.classList.add('is-active');
    if (tab === 'session') tabSessBtn.classList.add('is-active');
    renderTabContent();
  }

  function renderTabContent() {
    contentArea.replaceChildren();

    if (activeTab === 'data') {
      const db = readDb();
      const collections = ['users', 'jobs', 'bookings', 'passportEntries', 'availability', 'rateStats', 'posts', 'follows', 'endorsements'];

      const select = h('select', {
        className: 'wc-input wc-dev-select',
        onChange: (e) => {
          selectedCollection = e.target.value;
          renderTabContent();
        },
      }, collections.map((col) => h('option', { value: col, selected: col === selectedCollection }, `${col} (${Array.isArray(db[col]) ? db[col].length : 0})`)));

      const searchInput = h('input', {
        className: 'wc-input wc-dev-search',
        placeholder: 'Filter JSON data...',
        value: searchQuery,
        onInput: (e) => {
          searchQuery = e.target.value.toLowerCase();
          updateJsonView();
        },
      });

      const jsonPre = h('pre', { className: 'wc-dev-json' });

      function updateJsonView() {
        const raw = db[selectedCollection] || [];
        let filtered = raw;
        if (searchQuery) {
          filtered = Array.isArray(raw)
            ? raw.filter((item) => JSON.stringify(item).toLowerCase().includes(searchQuery))
            : raw;
        }
        jsonPre.textContent = JSON.stringify(filtered, null, 2);
      }

      updateJsonView();
      contentArea.append(h('div', { className: 'wc-dev-toolbar' }, select, searchInput), jsonPre);
    }

    if (activeTab === 'requests') {
      if (requestLog.length === 0) {
        contentArea.append(h('p', { className: 'wc-hint' }, 'No API requests logged yet. Perform actions to see traffic.'));
      } else {
        const rows = requestLog.map((req) =>
          h('tr', {},
            h('td', {}, req.timestamp),
            h('td', { className: 'wc-dev-method' }, req.method),
            h('td', { className: 'wc-dev-path' }, req.path),
            h('td', {}, h('span', { className: `wc-badge wc-badge--${req.status < 400 ? 'success' : 'clay'}` }, String(req.status))),
            h('td', {}, `${req.latencyMs}ms`)
          )
        );
        const table = h('table', { className: 'wc-dev-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Method'), h('th', {}, 'Path'), h('th', {}, 'Status'), h('th', {}, 'Latency'))),
          h('tbody', {}, ...rows)
        );
        contentArea.append(table);
      }
    }

    if (activeTab === 'controls') {
      const resetBtn = h('button', {
        className: 'wc-button wc-button--outline wc-full',
        onClick: () => {
          resetDb();
          sessionStorage.clear();
          alert('Database reset to clean Pune seed dataset.');
          navigate('/welcome', { replace: true });
        },
      }, '⚡ Reset & Re-Seed Database');

      const tamperBtn = h('button', {
        className: 'wc-button wc-button--danger wc-full',
        onClick: async () => {
          try {
            await passportApi.tamperEntry('user-worker-ravi', 1);
            alert('Corrupted seq 1 hash on Ravi Kumar. Verification will now return valid: false!');
          } catch (err) {
            alert('Tamper failed: ' + err.message);
          }
        },
      }, '💥 Tamper Passport Entry #1 (Hash Fraud Demo)');

      const timeTravelBtn = h('button', {
        className: 'wc-button wc-button--outline wc-full',
        onClick: () => {
          const db = readDb();
          // Shift availability expiration backwards by 4 hours to simulate expiry
          db.availability.forEach((a) => {
            a.expiresAt = new Date(new Date(a.expiresAt).getTime() - 4 * 3600000).toISOString();
          });
          writeDb(db);
          alert('Time traveled +4 hours! Expired availability windows cleared.');
        },
      }, '⏱️ Time Travel +4 Hours (Test Availability Expiry)');

      const eventRadarBtn = h('button', {
        className: 'wc-button wc-button--primary wc-full',
        onClick: () => {
          eventBus.emit(EVENT_NAMES.WORKER_FREE, { workerId: 'user-worker-2', skill: 'plumber' });
          alert('Event emitted: radar:worker_free (Plumber available nearby)');
        },
      }, '📡 Trigger Event: Worker Goes Free Now');

      const eventJobBtn = h('button', {
        className: 'wc-button wc-button--primary wc-full',
        onClick: () => {
          eventBus.emit(EVENT_NAMES.JOB_NEW, { job: { title: 'Emergency Pipe Fix in Kothrud', skill: 'plumber' } });
          alert('Event emitted: job:new (Plumbing job in Kothrud)');
        },
      }, '📡 Trigger Event: Customer Posts New Job');

      contentArea.append(
        h('div', { className: 'wc-dev-controls-grid' },
          resetBtn,
          tamperBtn,
          timeTravelBtn,
          eventRadarBtn,
          eventJobBtn
        )
      );
    }

    if (activeTab === 'session') {
      const db = readDb();

      const workerSwitchBtn = h('button', {
        className: 'wc-button wc-button--primary wc-full',
        onClick: () => {
          db.session = { userId: 'user-worker-ravi', refreshToken: 'mock-refresh-ravi', accessToken: 'mock-access-ravi' };
          writeDb(db);
          store.set({ session: db.session });
          alert('Switched session to Demo Worker: Ravi Kumar');
          navigate('/w/home', { replace: true });
        },
      }, '👤 Switch to Demo Worker (Ravi Kumar)');

      const customerSwitchBtn = h('button', {
        className: 'wc-button wc-button--outline wc-full',
        onClick: () => {
          db.session = { userId: 'user-customer-meera', refreshToken: 'mock-refresh-meera', accessToken: 'mock-access-meera' };
          writeDb(db);
          store.set({ session: db.session });
          alert('Switched session to Demo Customer: Meera Nair');
          navigate('/c/find', { replace: true });
        },
      }, '👤 Switch to Demo Customer (Meera Nair)');

      contentArea.append(
        h('div', { className: 'wc-dev-controls-grid' },
          h('p', { className: 'wc-lead' }, `Current Active Session: ${db.session?.userId || 'Logged Out'}`),
          workerSwitchBtn,
          customerSwitchBtn
        )
      );
    }
  }

  let isOpen = false;
  const toggleBtn = h('button', {
    className: 'wc-dev-toggle',
    onClick: () => {
      isOpen = !isOpen;
      drawerContainer.classList.toggle('is-open', isOpen);
    },
  }, '🛠️ Dev Menu');

  renderTabContent();
  drawerContainer.append(h('div', { className: 'wc-dev-header' }, h('span', { className: 'wc-dev-title' }, 'WorkCred Inspector (?dev=1)'), toggleBtn), tabBar, contentArea);

  return drawerContainer;
}
