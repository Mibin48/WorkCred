import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { WorkerCard } from '../../components/customer.js';
import { workersApi } from '../../api/workers.api.js';
import { store } from '../../store.js';

const token = () => store.get().session?.accessToken;

export function renderCustomerPlaceholder({ path, navigate, user }) {
  if (path === '/c/free-now') {
    const root = h('div', { className: 'wc-page-stack wc-find-page' });
    const list = h('div', { className: 'wc-worker-list', 'aria-live': 'polite' });
    const errorWrap = h('div', {});
    
    root.append(
      h('p', { className: 'wc-eyebrow' }, 'AVAILABLE RIGHT NOW'),
      h('h2', { className: 'wc-page-title' }, en.pages.freeNowPageTitle),
      h('p', { className: 'wc-lead' }, 'Workers nearby who are ready to take assignments immediately today.'),
      errorWrap,
      list
    );

    const page = customerShell({ title: en.pages.freeNowPageTitle, active: '/c/free-now', navigate, user, content: root });
    
    async function load() {
      list.replaceChildren(Skeleton({ rows: 4 }));
      try {
        const result = await workersApi.searchWorkers({ area: user.area || 'Deccan', limit: 20 }, token());
        const freeWorkers = (result.workers || []).filter((w) => w.isFreeNow);
        const displayWorkers = freeWorkers.length ? freeWorkers : (result.workers || []).slice(0, 6);
        
        if (!displayWorkers.length) {
          list.replaceChildren(EmptyState({
            title: 'No workers free right now',
            body: 'Check back in a few moments or search the full directory.',
            action: Button({ label: en.nav.find, onClick: () => navigate('/c/find') })
          }));
          return;
        }

        list.replaceChildren(...displayWorkers.map((worker) => WorkerCard({
          worker: { ...worker, isFreeNow: true },
          onOpen: () => navigate(`/c/worker/${encodeURIComponent(worker.id)}`),
          onSave: (w, trigger) => {
            w.isSaved = !w.isSaved;
            trigger.classList.toggle('is-saved', w.isSaved);
            workersApi.saveWorker(w.id, token()).catch(() => {});
          }
        })));
      } catch (error) {
        list.replaceChildren();
        errorWrap.replaceChildren(ErrorState({ message: error.message || en.find.errorLoading, onRetry: load }));
      }
    }

    void load();
    return page;
  }

  const title = en.pages.customerPostJob;
  return customerShell({ title, active: path, navigate, user, content: h('div', { className: 'wc-page-stack' },
    h('p', { className: 'wc-eyebrow' }, en.brand.name), h('h2', { className: 'wc-page-title' }, title),
    EmptyState({ title, body: en.brand.tagline })
  ) });
}
