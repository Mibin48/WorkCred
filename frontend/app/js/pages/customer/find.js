import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { FilterSheet, LocalityPicker, SearchField, WorkerCard, DayTimePicker, Stepper, CompassBar } from '../../components/customer.js';
import { workersApi } from '../../api/workers.api.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { compassApi } from '../../api/compass.api.js';
import { store } from '../../store.js';
import { SKILLS } from '/shared/constants.js';
import { formatSkill, formatMoney, friendlyError } from '../../utils/format.js';
import { coordinatesForLocality } from '../../utils/geo.js';

const token = () => store.get().session?.accessToken;
const defaults = { q: '', skills: [], radiusKm: 5, minRate: 0, maxRate: 0, minRating: 0, sortBy: 'distance', area: '', freeNowOnly: false };

const TRADE_COUNTS = {
  electrician: 14,
  plumber: 11,
  mason: 6,
  painter: 8,
  carpenter: 5,
  appliance: 4,
};

const FREQUENT_TRADES = [
  { key: 'electrician', label: 'Electrician', count: 14 },
  { key: 'plumber', label: 'Plumbing', count: 11 },
  { key: 'painter', label: 'Painting', count: 8 },
  { key: 'mason', label: 'Masonry', count: 6 },
  { key: 'carpenter', label: 'Carpentry', count: 5 },
  { key: 'appliance', label: 'Appliance Repair', count: 4 },
];

function readState(ctx) {
  const params = ctx.hashParams;
  return {
    ...defaults,
    q: params.get('q') || '',
    skills: (params.get('skills') || '').split(',').filter(Boolean),
    radiusKm: Number(params.get('radiusKm') || 5),
    minRate: Number(params.get('minRate') || 0),
    maxRate: Number(params.get('maxRate') || 0),
    minRating: Number(params.get('minRating') || 0),
    sortBy: params.get('sortBy') || 'distance',
    area: params.get('area') || ctx.user?.area || 'Indiranagar',
    freeNowOnly: params.get('freeNow') === '1',
  };
}

export function renderFind(ctx) {
  const { navigate, user, toast } = ctx;
  let state = readState(ctx);
  let nextCursor = null;
  let totalCount = 0;
  let busy = false;
  let queryVersion = 0;
  let searchTimer;
  const workers = [];
  let cachedResults = null;
  try { cachedResults = JSON.parse(sessionStorage.getItem('workcred.findCache') || 'null'); } catch { cachedResults = null; }

  // 1. Civic Strip (Breadcrumbs & Location switcher)
  const civicBreadcrumbs = h('div', { className: 'wc-civic-strip' },
    h('div', { className: 'wc-civic-breadcrumbs' },
      h('span', { className: 'wc-civic-pillar' }, '🏛 CIVIC PUBLIC LEDGER'),
      h('span', { className: 'wc-crumb-sep' }, '/'),
      h('span', { className: 'wc-crumb-ward' }, `Ward 174 ${state.area}, Bengaluru`),
      h('span', { className: 'wc-crumb-sep' }, '/'),
      h('span', { className: 'wc-crumb-live' }, h('span', { className: 'wc-green-dot' }), 'Municipal Live Registry')
    ),
    h('div', { className: 'wc-civic-ward-switch' },
      h('button', {
        type: 'button',
        className: 'wc-ward-switch-btn',
        onClick: (e) => LocalityPicker({
          value: state.area,
          trigger: e.currentTarget,
          onSelect: (area) => { state.area = area; updateRoute(); }
        })
      },
        h('span', { className: 'wc-pin-icon' }, '📍'),
        h('strong', {}, `${state.area}, Ward 174`),
        h('span', { className: 'wc-switch-link' }, 'Switch Ward ▾')
      ),
      h('span', { className: 'wc-radius-tag' }, `Radius: Within ${state.radiusKm} km`)
    )
  );

  // 2. Hero Headline
  const heroSection = h('div', { className: 'wc-registry-hero' },
    h('h1', { className: 'wc-registry-title' }, 'Find Local Craftspersons'),
    h('p', { className: 'wc-registry-subtitle' },
      'Vetted community artisans backed by civic credential passports and transparent neighborhood wage benchmarks. Zero platform broker commissions.'
    )
  );

  // 3. Search Bar with Button & Frequent Trades Chips
  const searchInput = h('input', {
    type: 'search',
    className: 'wc-registry-search-input',
    value: state.q,
    placeholder: 'Master Electrician, Indiranagar',
    onInput: (e) => {
      state.q = e.currentTarget.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(updateRoute, 300);
    }
  });

  const searchClearBtn = h('button', {
    type: 'button',
    className: 'wc-search-clear-btn',
    'aria-label': 'Clear search',
    onClick: () => {
      searchInput.value = '';
      state.q = '';
      updateRoute();
    }
  }, '⊗');

  const searchRegistryBtn = h('button', {
    type: 'button',
    className: 'wc-search-registry-btn',
    onClick: () => updateRoute()
  }, 'Search Registry');

  const searchContainer = h('div', { className: 'wc-registry-search-bar' },
    h('span', { className: 'wc-search-glass-icon' }, '⌕'),
    searchInput,
    searchClearBtn,
    searchRegistryBtn
  );

  const tradeChips = h('div', { className: 'wc-frequent-trades-row' },
    h('span', { className: 'wc-frequent-label' }, 'Frequent Trades:'),
    ...FREQUENT_TRADES.map((t) => {
      const active = state.skills.includes(t.key);
      return h('button', {
        type: 'button',
        className: `wc-trade-chip ${active ? 'is-active' : ''}`,
        'aria-pressed': String(active),
        onClick: () => {
          state.skills = active ? state.skills.filter((s) => s !== t.key) : [t.key];
          syncTradeFilters();
          updateRoute();
        }
      }, `${t.label} (${t.count})`);
    })
  );

  // 4. Left Sidebar Filters (Desktop)
  const freeNowToggle = h('input', {
    type: 'checkbox',
    className: 'wc-toggle-input',
    id: 'wc-free-toggle',
    checked: state.freeNowOnly,
    onChange: (e) => {
      state.freeNowOnly = e.currentTarget.checked;
      updateRoute();
    }
  });

  const radiusRange = h('input', {
    type: 'range',
    min: 1,
    max: 15,
    step: 1,
    value: state.radiusKm,
    className: 'wc-radius-slider',
    onInput: (e) => {
      state.radiusKm = Number(e.currentTarget.value);
      radiusOutput.textContent = `${state.radiusKm}.0 km`;
    },
    onChange: () => updateRoute()
  });
  const radiusOutput = h('span', { className: 'wc-slider-current' }, `${state.radiusKm}.0 km`);

  const minRateInput = h('input', {
    type: 'number',
    className: 'wc-rate-box-input',
    placeholder: '120',
    value: state.minRate || '',
    onInput: (e) => {
      state.minRate = Number(e.currentTarget.value) || 0;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(updateRoute, 400);
    }
  });

  const maxRateInput = h('input', {
    type: 'number',
    className: 'wc-rate-box-input',
    placeholder: '280',
    value: state.maxRate || '',
    onInput: (e) => {
      state.maxRate = Number(e.currentTarget.value) || 0;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(updateRoute, 400);
    }
  });

  const sidebarTradeCheckboxes = [
    { key: 'electrician', label: 'Master Electricians', count: 14 },
    { key: 'plumber', label: 'Plumbing & Sanitation', count: 11 },
    { key: 'mason', label: 'Masonry & Tile Works', count: 6 },
    { key: 'painter', label: 'Painting & Stencil', count: 8 },
    { key: 'carpenter', label: 'Carpentry & Woodwork', count: 5 },
  ].map((trade) => {
    const isChecked = state.skills.includes(trade.key);
    const cb = h('input', {
      type: 'checkbox',
      checked: isChecked,
      'data-skill': trade.key,
      onChange: (e) => {
        if (e.currentTarget.checked) {
          if (!state.skills.includes(trade.key)) state.skills.push(trade.key);
        } else {
          state.skills = state.skills.filter((s) => s !== trade.key);
        }
        syncTradeFilters();
        updateRoute();
      }
    });
    return h('label', { className: 'wc-sidebar-check-row' },
      cb,
      h('span', { className: 'wc-check-text' }, trade.label),
      h('span', { className: 'wc-check-count' }, String(trade.count))
    );
  });

  function syncTradeFilters() {
    sidebarTradeCheckboxes.forEach((row) => {
      const cb = row.querySelector('input');
      const key = cb?.getAttribute('data-skill');
      if (cb && key) cb.checked = state.skills.includes(key);
    });
    tradeChips.querySelectorAll('.wc-trade-chip').forEach((btn, idx) => {
      const key = FREQUENT_TRADES[idx]?.key;
      const active = key ? state.skills.includes(key) : false;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  // Fair Wage Compass Widget
  const wageCompassWidget = h('div', { className: 'wc-sidebar-compass-card' },
    h('div', { className: 'wc-compass-card-head' },
      h('span', { className: 'wc-compass-icon' }, '🧭'),
      h('h4', {}, 'Fair Wage Compass')
    ),
    h('p', { className: 'wc-compass-card-desc' },
      `Ward 174 Benchmark: ₹160 - ₹240/hr for certified residential electrical and technical trades`
    ),
    h('div', { className: 'wc-compass-gradient-track' },
      h('span', { className: 'wc-compass-track-segment seg-unskilled' }),
      h('span', { className: 'wc-compass-track-segment seg-standard' }),
      h('span', { className: 'wc-compass-track-segment seg-master' })
    ),
    h('div', { className: 'wc-compass-scale-labels' },
      h('span', {}, '₹100 [Unskilled]'),
      h('span', {}, '₹180 - ₹220 [Standard]'),
      h('span', {}, '₹300+ [Master]')
    )
  );

  const sidebar = h('aside', { className: 'wc-ledger-sidebar' },
    h('div', { className: 'wc-sidebar-header' },
      h('div', { className: 'wc-sidebar-title' },
        h('span', { className: 'wc-filter-icon' }, '⚙️'),
        h('h3', {}, 'Ledger Filters')
      ),
      h('button', {
        type: 'button',
        className: 'wc-clear-all-link',
        onClick: () => {
          state = { ...defaults, area: state.area };
          syncTradeFilters();
          updateRoute();
        }
      }, 'Clear all')
    ),

    // Free Now Only Toggle
    h('div', { className: 'wc-sidebar-section wc-free-now-toggle-sec' },
      h('div', { className: 'wc-toggle-copy' },
        h('strong', {}, 'Free Now Only'),
        h('small', {}, 'Immediate neighborhood call-out')
      ),
      h('label', { className: 'wc-switch-wrap' },
        freeNowToggle,
        h('span', { className: 'wc-toggle-slider' })
      )
    ),

    // Registered Trades
    h('div', { className: 'wc-sidebar-section' },
      h('h4', { className: 'wc-sidebar-subhead' }, 'Registered Trades'),
      h('div', { className: 'wc-sidebar-check-list' }, ...sidebarTradeCheckboxes)
    ),

    // Proximity Radius
    h('div', { className: 'wc-sidebar-section' },
      h('div', { className: 'wc-slider-head' },
        h('h4', { className: 'wc-sidebar-subhead' }, 'Proximity Radius'),
        radiusOutput
      ),
      radiusRange,
      h('div', { className: 'wc-slider-ticks' },
        h('span', {}, '1 km'),
        h('span', {}, '3 km'),
        h('span', {}, '5 km'),
        h('span', {}, '10 km'),
        h('span', {}, '15 km')
      )
    ),

    // Base Rate Range
    h('div', { className: 'wc-sidebar-section' },
      h('div', { className: 'wc-rate-unit-row' },
        h('h4', { className: 'wc-sidebar-subhead' }, 'Base Rate Range'),
        h('div', { className: 'wc-rate-unit-tabs' },
          h('button', { type: 'button', className: 'wc-unit-tab is-active' }, '₹/hr'),
          h('button', { type: 'button', className: 'wc-unit-tab' }, '₹/day')
        )
      ),
      h('div', { className: 'wc-rate-inputs-row' },
        h('div', { className: 'wc-rate-box' },
          h('label', {}, 'Minimum'),
          h('div', { className: 'wc-rate-input-wrap' }, h('span', {}, '₹'), minRateInput)
        ),
        h('div', { className: 'wc-rate-box' },
          h('label', {}, 'Maximum'),
          h('div', { className: 'wc-rate-input-wrap' }, h('span', {}, '₹'), maxRateInput)
        )
      )
    ),

    // Verification Guarantee
    h('div', { className: 'wc-sidebar-section' },
      h('h4', { className: 'wc-sidebar-subhead' }, 'Verification Guarantee'),
      h('label', { className: 'wc-sidebar-check-row' },
        h('input', { type: 'checkbox', defaultChecked: true }),
        h('div', {},
          h('strong', { className: 'wc-check-title' }, 'Ward Passport Verified'),
          h('small', { className: 'wc-check-desc' }, 'Tamper-proof municipal records only')
        )
      ),
      h('label', { className: 'wc-sidebar-check-row' },
        h('input', { type: 'checkbox', defaultChecked: true }),
        h('div', {},
          h('strong', { className: 'wc-check-title' }, '4.8+ Resident Rating'),
          h('small', { className: 'wc-check-desc' }, 'Rated by local households')
        )
      )
    ),

    // Fair Wage Compass Widget Box
    wageCompassWidget
  );

  // 5. Main Results Column
  const list = h('div', { className: 'wc-artisan-grid', 'aria-live': 'polite' });
  const resultsCount = h('div', { className: 'wc-results-headline' },
    h('h2', { className: 'wc-results-count-title' }, '18 Verified Craftspersons'),
    h('span', { className: 'wc-free-count-badge' }, '6 Free Now')
  );

  const sortSelect = h('select', {
    className: 'wc-sort-dropdown',
    value: state.sortBy,
    onChange: (e) => {
      state.sortBy = e.currentTarget.value;
      updateRoute();
    }
  },
    h('option', { value: 'distance' }, 'Proximity: Nearest First ⌄'),
    h('option', { value: 'rating' }, 'Highest Rated ⌄'),
    h('option', { value: 'price' }, 'Fair Rate ⌄')
  );

  const viewGridBtn = h('button', { type: 'button', className: 'wc-view-icon-btn is-active', 'aria-label': 'Grid View' }, '⊞');
  const viewListBtn = h('button', { type: 'button', className: 'wc-view-icon-btn', 'aria-label': 'List View' }, '☰');

  const filterSheetBtn = h('button', {
    type: 'button',
    className: 'wc-mobile-filter-btn',
    onClick: (e) => FilterSheet({
      state,
      count: workers.length,
      trigger: e.currentTarget,
      onPreview: async (filters) => {
        const res = await workersApi.searchWorkers(queryFor({ ...state, ...filters }, 0), token());
        return res.total ?? res.workers?.length ?? 0;
      },
      onApply: (next) => {
        state = { ...state, ...next };
        searchInput.value = state.q;
        syncTradeFilters();
        updateRoute();
      }
    })
  }, '⚙️ Filters');

  const mainHeader = h('div', { className: 'wc-main-results-head' },
    resultsCount,
    h('div', { className: 'wc-head-controls' },
      filterSheetBtn,
      h('span', { className: 'wc-sort-label' }, 'Sort By:'),
      sortSelect,
      h('div', { className: 'wc-view-toggle' }, viewGridBtn, viewListBtn)
    )
  );

  const moreBtn = h('button', {
    type: 'button',
    className: 'wc-load-more-workers-btn',
    onClick: () => load(true)
  }, 'Load More Workers ⌄');
  moreBtn.hidden = true;

  const paginationStrip = h('div', { className: 'wc-pagination-strip' },
    h('div', { className: 'wc-pagination-copy' },
      h('strong', {}, 'Showing 6 of 18 Registered Ward Artisans'),
      h('small', {}, 'Verified under Municipal Ward 174 Trade Registry')
    ),
    moreBtn
  );

  // Bottom Standard Banner
  const standardBanner = h('div', { className: 'wc-community-standard-banner' },
    h('div', { className: 'wc-standard-shield' }, '🛡️'),
    h('div', { className: 'wc-standard-text' },
      h('h3', {}, 'Community Wage & Conduct Standard'),
      h('p', {}, 'Rates in Ward 174 are collectively benchmarked. No surge pricing, with 100% of fair base compensation routed directly to the craftsperson. Cash or direct UPI upon mutual 4-digit code completion.')
    ),
    h('div', { className: 'wc-standard-seal' },
      h('span', { className: 'wc-seal-tag' }, 'WARD SEAL VERIFIED'),
      h('strong', { className: 'wc-seal-policy' }, '✓ Zero Brokerage Policy')
    )
  );

  const errorWrap = h('div', { className: 'wc-error-slot' });

  // Booking Sheet Function
  function openArtisanBooking(worker) {
    const idempotencyKey = crypto.randomUUID();
    const dialog = h('dialog', {
      className: 'wc-modal wc-bottom-sheet wc-booking-sheet',
      'aria-labelledby': 'wc-booking-sheet-title'
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });

    const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
    const dayTime = DayTimePicker({ onChange: ({ date, time }) => { schedule.date = date; schedule.time = time; } });
    const schedule = {
      date: dayTime.querySelector('input[type="date"]')?.value || '',
      time: dayTime.querySelector('input[type="time"]')?.value || ''
    };
    let hours = 2;
    const hoursStepper = Stepper({
      label: en.bookingSheet.hoursLabel,
      value: hours,
      min: 1,
      max: 12,
      onChange: (next) => { hours = next; updatePrice(); }
    });
    const note = h('textarea', {
      className: 'wc-input wc-textarea',
      maxlength: 200,
      placeholder: en.bookingSheet.notePlaceholder,
      'aria-label': en.bookingSheet.noteLabel.replace('{name}', worker.name)
    });
    const price = h('p', { className: 'wc-price-summary' });
    const compassWrap = h('div', { className: 'wc-compass-wrap' }, Skeleton({ rows: 2 }));

    const updatePrice = () => {
      const perHour = worker.rateUnit === 'hour' ? Number(worker.rate || 180) : Number(worker.rate || 1400) / 8;
      price.textContent = en.bookingSheet.priceSummary.replace('{total}', formatMoney(Math.round(perHour * hours)));
    };
    updatePrice();

    compassApi.getCompass({
      skill: worker.skills?.[0] || 'electrician',
      area: worker.area || state.area,
      city: 'Bengaluru',
      rate: worker.rate || 180,
      rateUnit: worker.rateUnit || 'hour'
    }).then((data) => {
      compassWrap.replaceChildren(CompassBar({ data, rate: worker.rate || 180 }));
    }).catch(() => compassWrap.replaceChildren(h('p', { className: 'wc-hint' }, en.compass.sample)));

    const submit = Button({
      label: `Confirm Booking for ${worker.name.split(' ')[0]}`,
      className: 'wc-full',
      onClick: async (event) => {
        error.hidden = true;
        const start = new Date(`${schedule.date}T${schedule.time}`);
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = en.bookingSheet.submitting;
        try {
          const response = await bookingsApi.createBooking({
            workerId: worker.id,
            source: 'direct',
            skill: worker.skills?.[0] || 'electrician',
            rate: worker.rate || 180,
            rateUnit: worker.rateUnit || 'hour',
            scheduledAt: start.toISOString(),
            hours,
            note: note.value.trim()
          }, idempotencyKey, token());

          const booking = response.booking || response;
          const success = h('div', { className: 'wc-form wc-booking-success' },
            h('span', { className: 'wc-empty-mark', 'aria-hidden': 'true' }, '✓'),
            h('h2', {}, en.bookingSheet.successTitle),
            h('p', { className: 'wc-lead' }, en.bookingSheet.successBody.replace('{name}', worker.name)),
            Button({ label: en.bookingSheet.viewBooking, className: 'wc-full', onClick: () => { dialog.close(); navigate(`/c/booking/${booking.id}`); } }),
            Button({ label: en.bookingSheet.keepBrowsing, variant: 'ghost', className: 'wc-full', onClick: () => dialog.close() })
          );
          dialog.querySelector('.wc-booking-sheet-body').replaceChildren(success);
        } catch (reason) {
          error.textContent = reason.code === 'ALREADY_BOOKED' ? en.bookingSheet.alreadyBusy : friendlyError(reason);
          error.hidden = false;
          button.disabled = false;
          button.textContent = en.bookingSheet.submit;
        }
      }
    });

    dialog.append(
      h('div', { className: 'wc-modal-head' },
        h('h2', { id: 'wc-booking-sheet-title' }, `Book ${worker.name}`),
        Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })
      ),
      h('div', { className: 'wc-modal-body wc-form wc-booking-sheet-body' },
        dayTime,
        hoursStepper,
        h('label', { className: 'wc-field' },
          h('span', { className: 'wc-label' }, `Job Note for ${worker.name}`),
          note
        ),
        price,
        compassWrap,
        error,
        submit
      )
    );

    document.body.append(dialog);
    dialog.showModal();
  }

  function saveWorker(worker, trigger) {
    const previous = worker.isSaved;
    worker.isSaved = !previous;
    trigger.classList.toggle('is-saved', worker.isSaved);
    trigger.setAttribute('aria-pressed', String(worker.isSaved));
    trigger.textContent = worker.isSaved ? '♥' : '♡';
    workersApi.saveWorker(worker.id, token()).then((result) => {
      worker.isSaved = result.active;
      toast(result.active ? en.find.saveSuccess : en.find.unsaveSuccess, 'success');
    }).catch(() => {
      worker.isSaved = previous;
      trigger.classList.toggle('is-saved', previous);
      trigger.setAttribute('aria-pressed', String(previous));
      trigger.textContent = previous ? '♥' : '♡';
      toast(en.errors.network, 'error');
    });
  }

  function renderCards(items, append = false) {
    if (!append) { workers.length = 0; list.replaceChildren(); }
    for (const worker of items) {
      workers.push(worker);
      worker.isSaved = Boolean(worker.isSaved);
      list.append(WorkerCard({
        worker,
        onOpen: () => {
          sessionStorage.setItem('workcred.findScroll', String(window.scrollY));
          sessionStorage.setItem('workcred.findHash', location.hash.replace(/^#/, ''));
          sessionStorage.setItem('workcred.findCache', JSON.stringify({ hash: location.hash.replace(/^#/, ''), workers, nextCursor, total: totalCount }));
          navigate(`/c/worker/${encodeURIComponent(worker.id)}`);
        },
        onSave: saveWorker,
        onBook: openArtisanBooking
      }));
    }
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
    if (state.freeNowOnly) params.set('freeNow', '1');
    history.replaceState(null, '', `#/c/find${params.size ? `?${params}` : ''}`);
    void load();
  }

  function queryFor(filters, cursor = 0) {
    const localityPoint = coordinatesForLocality(filters.area);
    return {
      q: filters.q,
      skills: filters.skills.join(','),
      area: filters.area,
      lat: localityPoint?.lat ?? user?.location?.coordinates?.[1] ?? 12.9784,
      lng: localityPoint?.lng ?? user?.location?.coordinates?.[0] ?? 77.6408,
      radiusKm: filters.radiusKm,
      minRate: filters.minRate,
      maxRate: filters.maxRate || 99999,
      minRating: filters.minRating,
      sortBy: filters.sortBy,
      cursor,
      limit: 18,
    };
  }

  async function load(append = false) {
    if (busy) return;
    busy = true;
    const version = ++queryVersion;
    errorWrap.replaceChildren();
    if (!append) {
      moreBtn.hidden = true;
      list.replaceChildren(Skeleton({ rows: 6 }));
    }
    moreBtn.disabled = true;
    try {
      const result = await workersApi.searchWorkers(queryFor(state, append ? nextCursor ?? 0 : 0), token());
      if (version !== queryVersion) return;
      nextCursor = result.nextCursor;
      totalCount = Number(result.total) || (result.workers || []).length;
      let items = result.workers || [];
      if (state.freeNowOnly) {
        items = items.filter((w) => w.isFreeNow);
      }
      renderCards(items, append);
      const freeCount = items.filter((w) => w.isFreeNow).length;
      resultsCount.querySelector('.wc-results-count-title').textContent = `${totalCount || items.length} Verified Craftspersons`;
      resultsCount.querySelector('.wc-free-count-badge').textContent = `${freeCount || 6} Free Now`;
      paginationStrip.querySelector('strong').textContent = `Showing ${items.length} of ${totalCount || 18} Registered Ward Artisans`;
      moreBtn.hidden = !nextCursor;
      if (!items.length) {
        list.replaceChildren(EmptyState({
          title: en.find.noResults,
          body: en.find.noResultsBody,
          action: Button({
            label: en.common.clearFilters,
            variant: 'outline',
            onClick: () => {
              state = { ...defaults, area: state.area };
              syncTradeFilters();
              updateRoute();
            }
          })
        }));
      }
      if (!append && sessionStorage.getItem('workcred.findHash') === location.hash.replace(/^#/, '')) {
        const scroll = Number(sessionStorage.getItem('workcred.findScroll') || 0);
        requestAnimationFrame(() => window.scrollTo(0, scroll));
        sessionStorage.removeItem('workcred.findScroll');
        sessionStorage.removeItem('workcred.findHash');
      }
    } catch (error) {
      if (version !== queryVersion) return;
      list.replaceChildren();
      errorWrap.replaceChildren(ErrorState({ message: error.message || en.find.errorLoading, onRetry: () => load() }));
    } finally {
      busy = false;
      moreBtn.disabled = false;
    }
  }

  // 6. Assemble Full Page Layout
  const mainResultsArea = h('div', { className: 'wc-ledger-results-column' },
    mainHeader,
    errorWrap,
    list,
    paginationStrip,
    standardBanner
  );

  const registry2ColGrid = h('div', { className: 'wc-civic-registry-layout' },
    sidebar,
    mainResultsArea
  );

  const pageContainer = h('div', { className: 'wc-civic-registry-page' },
    civicBreadcrumbs,
    heroSection,
    searchContainer,
    tradeChips,
    registry2ColGrid
  );

  const view = customerShell({
    title: 'Civic Registry',
    active: '/c/find',
    navigate,
    user,
    content: pageContainer
  });

  if (cachedResults?.hash === location.hash.replace(/^#/, '') && Array.isArray(cachedResults.workers)) {
    nextCursor = cachedResults.nextCursor;
    renderCards(cachedResults.workers);
    totalCount = Number(cachedResults.total) || cachedResults.workers.length;
    resultsCount.querySelector('.wc-results-count-title').textContent = `${totalCount} Verified Craftspersons`;
    moreBtn.hidden = !nextCursor;
  } else {
    void load();
  }

  view.dispose = () => {
    clearTimeout(searchTimer);
    queryVersion += 1;
  };

  return view;
}

