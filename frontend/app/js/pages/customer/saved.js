import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, EmptyState, ErrorState, Skeleton, Toast } from '../../components/index.js';
import { SegmentedTabs, WorkerCard } from '../../components/customer.js';
import { workersApi } from '../../api/workers.api.js';
import { store } from '../../store.js';
import { friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderSaved({ navigate, user, toast, hashParams }) {
  let active = hashParams?.get('tab') || 'saved';
  const root = h('div', { className: 'wc-page-stack wc-saved-page' }, h('div', { className: 'wc-segment-tabs-slot' }), h('div', { className: 'wc-saved-content' }, Skeleton({ rows: 3 })), h('div', { className: 'wc-undo-region', 'aria-live': 'polite' }));
  const page = customerShell({ title: en.saved.title, active: '/c/saved', navigate, user, content: root });
  const content = root.querySelector('.wc-saved-content');
  const tabsSlot = root.querySelector('.wc-segment-tabs-slot');
  const undoRegion = root.querySelector('.wc-undo-region');
  let undoTimer;

  function setTab(tab) { active = tab; history.replaceState(null, '', `#/c/saved?tab=${tab}`); renderTabs(); void load(); }
  function renderTabs() {
    tabsSlot.replaceChildren(SegmentedTabs({ label: en.saved.title, active, items: [{ id: 'saved', label: en.saved.tabSaved }, { id: 'following', label: en.saved.tabFollowing }], onChange: setTab }));
  }
  async function load() {
    content.replaceChildren(Skeleton({ rows: 3 }));
    try {
      const result = active === 'saved' ? await workersApi.getSavedWorkers(token()) : await workersApi.getFollowedWorkers(token());
      const list = result.workers || [];
      if (!list.length) {
        content.replaceChildren(EmptyState({ title: active === 'saved' ? en.saved.emptySaved : en.saved.emptyFollowing, body: active === 'saved' ? en.saved.emptySavedBody : en.saved.emptyFollowingBody, action: Button({ label: en.nav.find, onClick: () => navigate('/c/find') }) }));
        return;
      }
      content.replaceChildren(...list.map((worker) => WorkerCard({ worker: { ...worker, isSaved: active === 'saved' }, onOpen: () => navigate(`/c/worker/${encodeURIComponent(worker.id)}`), onSave: (item) => removeSaved(item) })));
    } catch (error) { content.replaceChildren(ErrorState({ message: friendlyError(error), onRetry: load })); }
  }
  async function removeSaved(worker) {
    if (active !== 'saved') {
      try { const result = await workersApi.saveWorker(worker.id, token()); toast(result.active ? en.find.saveSuccess : en.find.unsaveSuccess, 'success'); }
      catch (error) { toast(friendlyError(error), 'error'); }
      return;
    }
    content.querySelectorAll('.wc-worker-card').forEach((card) => { if (card.getAttribute('aria-label')?.startsWith(worker.name)) card.remove(); });
    try { await workersApi.saveWorker(worker.id, token()); }
    catch (error) { toast(friendlyError(error), 'error'); void load(); return; }
    clearTimeout(undoTimer);
    const undo = Button({ label: en.saved.undoRemove, variant: 'outline', onClick: async () => { undo.disabled = true; try { await workersApi.saveWorker(worker.id, token()); toast(en.find.saveSuccess, 'success'); await load(); } catch (error) { toast(friendlyError(error), 'error'); } finally { undoRegion.replaceChildren(); } } });
    undoRegion.replaceChildren(Toast({ message: `${worker.name} · ${en.saved.removedToast}` }), undo);
    undoTimer = setTimeout(() => undoRegion.replaceChildren(), 5000);
    if (!content.querySelector('.wc-worker-card')) content.replaceChildren(EmptyState({ title: en.saved.emptySaved, body: en.saved.emptySavedBody, action: Button({ label: en.nav.find, onClick: () => navigate('/c/find') }) }));
  }
  page.dispose = () => clearTimeout(undoTimer);
  renderTabs();
  void load();
  return page;
}
