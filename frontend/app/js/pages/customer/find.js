import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { FilterSheet, LocalityPicker, SearchField, WorkerCard } from '../../components/customer.js';
import { workersApi } from '../../api/workers.api.js';
import { store } from '../../store.js';
import { SKILLS } from '/shared/constants.js';
import { formatSkill } from '../../utils/format.js';
import { coordinatesForLocality } from '../../utils/geo.js';

const token = () => store.get().session?.accessToken;
const defaults = { q: '', skills: [], radiusKm: 5, minRate: 0, maxRate: 0, minRating: 0, sortBy: 'distance', area: '' };

function readState(ctx) {
  const params = ctx.hashParams;
  return {
    ...defaults,
    q: params.get('q') || '', skills: (params.get('skills') || '').split(',').filter(Boolean),
    radiusKm: Number(params.get('radiusKm') || 5), minRate: Number(params.get('minRate') || 0),
    maxRate: Number(params.get('maxRate') || 0), minRating: Number(params.get('minRating') || 0),
    sortBy: params.get('sortBy') || 'distance', area: params.get('area') || ctx.user?.area || 'Deccan',
  };
}

export function renderFind(ctx) {
  const { navigate, user } = ctx;
  let state = readState(ctx);
  let nextCursor = null;
  let totalCount = 0;
  let busy = false;
  let queryVersion = 0;
  let searchTimer;
  const workers = [];
  let cachedResults = null;
  try { cachedResults = JSON.parse(sessionStorage.getItem('workcred.findCache') || 'null'); } catch { cachedResults = null; }
  const list = h('div', { className: 'wc-worker-list', 'aria-live': 'polite' });
  const resultsCount = h('p', { className: 'wc-results-count', role: 'status', 'aria-live': 'polite' }, en.common.loading);
  const more = Button({ label: en.find.showMore, variant: 'outline', className: 'wc-full', onClick: () => load(true) });
  more.hidden = true;
  const errorWrap = h('div', {});
  const chips = h('div', { className: 'wc-quick-skills', role: 'group', 'aria-label': en.filters.skill }, SKILLS.slice(0, 7).map((skill) => Chip({
    label: formatSkill(skill), selected: state.skills.includes(skill), onClick: (event) => {
      state.skills = state.skills.includes(skill) ? state.skills.filter((value) => value !== skill) : [skill];
      search.querySelector('input').value = '';
      state.q = '';
      syncQuickChips();
      event.currentTarget.classList.toggle('is-selected', state.skills.includes(skill));
      event.currentTarget.setAttribute('aria-pressed', String(state.skills.includes(skill)));
      updateRoute();
    },
  })));
  const search = SearchField({ value: state.q, suggestions: SKILLS.map((skill) => ({ value: skill, label: formatSkill(skill) })), onInput: (value) => {
    state.q = SKILLS.includes(value) ? '' : value;
    state.skills = SKILLS.includes(value) ? [value] : [];
    syncQuickChips();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateRoute, 280);
  } });
  const locality = Button({ label: `${en.find.locationChipLabel.replace('{area}', state.area)}  ⌄`, variant: 'ghost', onClick: () => LocalityPicker({ value: state.area, trigger: locality, onSelect: (area) => { state.area = area; updateRoute(); } }) });
  const activeFilterCount = () => state.skills.length + (state.radiusKm !== 5 ? 1 : 0) + (state.minRate ? 1 : 0) + (state.maxRate ? 1 : 0) + (state.minRating ? 1 : 0) + (state.sortBy !== 'distance' ? 1 : 0);
  const filterButton = Button({ label: en.find.filtersLabel, variant: 'outline', onClick: () => FilterSheet({ state, count: workers.length, trigger: filterButton, onPreview: previewCount, onApply: (next) => { state = { ...state, ...next }; search.querySelector('input').value = state.q; syncQuickChips(); updateRoute(); } }) });
  const updateFilterLabel = () => { filterButton.textContent = activeFilterCount() ? `${en.find.filtersLabel} · ${activeFilterCount()}` : en.find.filtersLabel; };
  updateFilterLabel();
  const filterRow = h('div', { className: 'wc-find-controls' }, search, filterButton);
  const statusLine = h('div', { className: 'wc-find-status' }, locality, resultsCount);

  function syncQuickChips() {
    chips.querySelectorAll('.wc-chip').forEach((button, index) => {
      const active = state.skills.includes(SKILLS[index]);
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateRoute() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.skills.length) params.set('skills', state.skills.join(','));
    if (state.radiusKm !== 5) params.set('radiusKm', String(state.radiusKm));
    if (state.minRate) params.set('minRate', String(state.minRate));
    if (state.maxRate) params.set('maxRate', String(state.maxRate));
    if (state.minRating) params.set('minRating', String(state.minRating));
    if (state.sortBy !== 'distance') params.set('sortBy', state.sortBy);
    if (state.area) params.set('area', state.area);
    history.replaceState(null, '', `#/c/find${params.size ? `?${params}` : ''}`);
    updateFilterLabel();
    void load();
  }

  function queryFor(filters, cursor = 0) {
    const localityPoint = coordinatesForLocality(filters.area);
    return {
      q: filters.q, skills: filters.skills.join(','), area: filters.area,
      lat: localityPoint?.lat ?? user.location?.coordinates?.[1] ?? 18.5204, lng: localityPoint?.lng ?? user.location?.coordinates?.[0] ?? 73.8567,
      radiusKm: filters.radiusKm, minRate: filters.minRate, maxRate: filters.maxRate || 99999,
      minRating: filters.minRating, sortBy: filters.sortBy, cursor, limit: 20,
    };
  }
  function queryParams(cursor = 0) { return queryFor(state, cursor); }
  async function previewCount(filters) { const result = await workersApi.searchWorkers(queryFor({ ...state, ...filters }, 0), token()); return result.total ?? result.workers?.length ?? 0; }

  function saveWorker(worker, trigger) {
    const previous = worker.isSaved;
    worker.isSaved = !previous;
    trigger.classList.toggle('is-saved', worker.isSaved);
    trigger.setAttribute('aria-pressed', String(worker.isSaved));
    trigger.textContent = worker.isSaved ? '♥' : '♡';
    workersApi.saveWorker(worker.id, token()).then((result) => {
      worker.isSaved = result.active;
      ctx.toast(result.active ? en.find.saveSuccess : en.find.unsaveSuccess, 'success');
    }).catch(() => {
      worker.isSaved = previous;
      trigger.classList.toggle('is-saved', previous);
      trigger.setAttribute('aria-pressed', String(previous));
      trigger.textContent = previous ? '♥' : '♡';
      ctx.toast(en.errors.network, 'error');
    });
  }

  function renderCards(items, append = false) {
    if (!append) { workers.length = 0; list.replaceChildren(); }
    for (const worker of items) {
      workers.push(worker);
      worker.isSaved = Boolean(worker.isSaved);
      list.append(WorkerCard({ worker, onOpen: () => {
        sessionStorage.setItem('workcred.findScroll', String(window.scrollY));
        sessionStorage.setItem('workcred.findHash', location.hash.replace(/^#/, ''));
        sessionStorage.setItem('workcred.findCache', JSON.stringify({ hash: location.hash.replace(/^#/, ''), workers, nextCursor, total: totalCount }));
        navigate(`/c/worker/${encodeURIComponent(worker.id)}`);
      }, onSave: saveWorker }));
    }
  }

  async function load(append = false) {
    if (busy) return;
    busy = true;
    const version = ++queryVersion;
    errorWrap.replaceChildren();
    if (!append) { more.hidden = true; list.replaceChildren(Skeleton({ rows: 4 })); }
    more.disabled = true;
    try {
      const result = await workersApi.searchWorkers(queryParams(append ? nextCursor ?? 0 : 0), token());
      if (version !== queryVersion) return;
      nextCursor = result.nextCursor;
      totalCount = Number(result.total) || 0;
      renderCards(result.workers || [], append);
      resultsCount.textContent = en.find.resultsCount.replace('{count}', String(result.total ?? workers.length));
      more.hidden = !nextCursor;
      if (!workers.length) list.replaceChildren(EmptyState({ title: en.find.noResults, body: en.find.noResultsBody, action: Button({ label: en.common.clearFilters, variant: 'outline', onClick: () => { state = { ...defaults, area: state.area }; updateRoute(); } }) }));
      if (!append && sessionStorage.getItem('workcred.findHash') === location.hash.replace(/^#/, '')) {
        const scroll = Number(sessionStorage.getItem('workcred.findScroll') || 0);
        requestAnimationFrame(() => window.scrollTo(0, scroll));
        sessionStorage.removeItem('workcred.findScroll');
        sessionStorage.removeItem('workcred.findHash');
      }
    } catch (error) {
      if (version !== queryVersion) return;
      list.replaceChildren();
      resultsCount.textContent = en.common.noResults;
      errorWrap.replaceChildren(ErrorState({ message: error.message || en.find.errorLoading, onRetry: () => load() }));
    } finally { busy = false; more.disabled = false; }
  }

  const view = customerShell({ title: en.customer.find, active: '/c/find', navigate, user, content: h('div', { className: 'wc-page-stack wc-find-page' },
    h('p', { className: 'wc-eyebrow' }, en.brand.tagline), h('h2', { className: 'wc-page-title' }, en.pages.findTitle),
    h('p', { className: 'wc-lead' }, en.pages.findBody), statusLine, filterRow, chips, errorWrap, list, more
  ) });
  if (cachedResults?.hash === location.hash.replace(/^#/, '') && Array.isArray(cachedResults.workers)) {
    nextCursor = cachedResults.nextCursor;
    renderCards(cachedResults.workers);
    totalCount = Number(cachedResults.total) || cachedResults.workers.length;
    resultsCount.textContent = en.find.resultsCount.replace('{count}', String(totalCount));
    more.hidden = !nextCursor;
  } else void load();
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting) && nextCursor && !busy) load(true); }, { rootMargin: '240px' });
  observer?.observe(more);
  view.dispose = () => { observer?.disconnect(); clearTimeout(searchTimer); queryVersion += 1; };
  return view;
}
