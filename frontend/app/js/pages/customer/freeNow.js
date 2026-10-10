/**
 * WorkCred Customer Free Now List Page (/app/c/free-now)
 * Replaces placeholder with real-time radar worker list.
 */

import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { LocalityPicker } from '../../components/customer.js';
import { FreeWorkerCard } from '../../components/feed.js';
import { DayTimePicker, Stepper, CompassBar } from '../../components/customer.js';
import { radarApi } from '../../api/radar.api.js';
import { workersApi } from '../../api/workers.api.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { compassApi } from '../../api/compass.api.js';
import { socket } from '../../realtime/socket.js';
import { store } from '../../store.js';
import { formatMoney, formatSkill, friendlyError } from '../../utils/format.js';
import { coordinatesForLocality } from '../../utils/geo.js';
import { SKILLS } from '/shared/constants.js';

const token = () => store.get().session?.accessToken;

function getLocalityCoords(locality, user) {
  return coordinatesForLocality(locality) || {
    lat: user?.location?.coordinates?.[1] ?? 18.5204,
    lng: user?.location?.coordinates?.[0] ?? 73.8567,
  };
}

export function renderCustomerFreeNow({ navigate, user, toast }) {
  let disposed = false;
  let pollInterval = null;
  let timeInterval = null;
  let socketUnsub = null;

  let locality = user?.area || user?.city || 'Deccan';
  let radiusKm = 3;
  let selectedSkill = '';
  const workers = [];

  // Live Screen Reader Announcement Region
  const liveAnnouncer = h('div', {
    className: 'wc-sr-only',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });

  // Top Filter & Location Bar
  const localityBtn = h('button', {
    type: 'button',
    className: 'wc-locality-chip-btn',
    onClick: (e) => {
      LocalityPicker({
        value: locality,
        trigger: e.currentTarget,
        onSelect: (newLocality) => {
          locality = newLocality;
          localityBtn.textContent = `📍 ${locality}`;
          void loadWorkers();
        },
      });
    },
  }, `📍 ${locality}`);

  const distBtn1km = Chip({ label: en.freenowList.filterDistance1km, selected: radiusKm === 1, onClick: () => selectDistance(1) });
  const distBtn3km = Chip({ label: en.freenowList.filterDistance3km, selected: radiusKm === 3, onClick: () => selectDistance(3) });
  const distBtn5km = Chip({ label: en.freenowList.filterDistance5km, selected: radiusKm === 5, onClick: () => selectDistance(5) });

  function selectDistance(km) {
    radiusKm = km;
    [distBtn1km, distBtn3km, distBtn5km].forEach((btn, idx) => {
      const active = [1, 3, 5][idx] === km;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    void loadWorkers();
  }

  const skillChips = [
    Chip({
      label: 'All skills',
      selected: selectedSkill === '',
      onClick: () => selectSkill(''),
    }),
    ...SKILLS.slice(0, 8).map((sk) =>
      Chip({
        label: formatSkill(sk),
        selected: selectedSkill === sk,
        onClick: () => selectSkill(sk),
      })
    ),
  ];

  function selectSkill(sk) {
    selectedSkill = sk;
    skillChips.forEach((chip, idx) => {
      const active = (idx === 0 && sk === '') || SKILLS[idx - 1] === sk;
      chip.classList.toggle('is-selected', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    void loadWorkers();
  }

  const listContainer = h('div', { className: 'wc-freenow-list' });
  const errorContainer = h('div', { className: 'wc-freenow-error' });

  const root = h('div', { className: 'wc-page-stack wc-freenow-page' },
    liveAnnouncer,
    h('div', { className: 'wc-freenow-header' },
      h('h1', { className: 'wc-serif-title' }, en.freenowList.title),
      localityBtn
    ),
    h('div', { className: 'wc-freenow-controls' },
      h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': 'Distance range' },
        distBtn1km, distBtn3km, distBtn5km
      ),
      h('div', { className: 'wc-chip-group wc-skill-scroll', role: 'group', 'aria-label': 'Skill filter' },
        ...skillChips
      )
    ),
    errorContainer,
    listContainer
  );

  const page = customerShell({
    title: en.freenowList.title,
    active: '/c/free-now',
    navigate,
    user,
    content: root,
  });

  page.dispose = () => {
    disposed = true;
    if (pollInterval) clearInterval(pollInterval);
    if (timeInterval) clearInterval(timeInterval);
    if (socketUnsub) socketUnsub();
  };

  // Initial Data Load
  void loadWorkers();
  setupRealtime();

  // Tick countdowns every minute
  timeInterval = setInterval(() => {
    if (disposed) return;
    const now = Date.now();
    for (let i = workers.length - 1; i >= 0; i--) {
      const w = workers[i];
      if (w.expiresAt && new Date(w.expiresAt).getTime() <= now) {
        workers.splice(i, 1);
      }
    }
    renderWorkerCards();
  }, 60000);

  async function loadWorkers() {
    errorContainer.replaceChildren();
    listContainer.replaceChildren(Skeleton({ rows: 3 }));
    try {
      const coords = getLocalityCoords(locality, user);
      const res = await radarApi.getNearbyAvailability({
        lat: coords.lat,
        lng: coords.lng,
        radiusKm,
        skill: selectedSkill || undefined,
      }, token());

      if (disposed) return;
      workers.length = 0;
      if (Array.isArray(res.workers)) {
        workers.push(...res.workers);
      }
      renderWorkerCards();
    } catch (err) {
      if (disposed) return;
      listContainer.replaceChildren();
      errorContainer.replaceChildren(ErrorState({
        message: friendlyError(err) || en.errors.network,
        onRetry: () => void loadWorkers(),
      }));
    }
  }

  function renderWorkerCards() {
    if (!workers.length) {
      listContainer.replaceChildren(EmptyState({
        title: en.freenowList.emptyTitle,
        body: en.freenowList.emptyBody,
        action: Button({
          label: en.freenowList.postJobBtn,
          variant: 'primary',
          onClick: () => navigate('/c/post-job'),
        }),
      }));
      return;
    }

    listContainer.replaceChildren();
    workers.forEach((worker) => {
      const card = FreeWorkerCard({
        worker,
        onOpen: (w) => navigate(`/c/worker/${encodeURIComponent(w.workerId || w.id)}`),
        onBookNow: (w) => openFreeNowBooking(w),
        onSave: async (w, trigger) => {
          const prev = w.isSaved;
          w.isSaved = !prev;
          trigger.classList.toggle('is-saved', w.isSaved);
          trigger.setAttribute('aria-pressed', String(w.isSaved));
          trigger.textContent = w.isSaved ? '♥' : '♡';
          try {
            await workersApi.saveWorker(w.workerId || w.id, token());
            toast(w.isSaved ? en.find.saveSuccess : en.find.unsaveSuccess, 'success');
          } catch {
            w.isSaved = prev;
            trigger.classList.toggle('is-saved', prev);
            trigger.setAttribute('aria-pressed', String(prev));
            trigger.textContent = prev ? '♥' : '♡';
            toast(en.errors.network, 'error');
          }
        },
      });
      listContainer.append(card);
    });
  }

  function setupRealtime() {
    const handleFree = (payload) => {
      if (disposed || !payload?.availability) return;
      const avail = payload.availability;
      const existsIndex = workers.findIndex((w) => (w.workerId || w.id) === (avail.workerId || avail.id));
      if (existsIndex >= 0) {
        workers[existsIndex] = { ...workers[existsIndex], ...avail };
      } else {
        workers.unshift(avail);
      }
      renderWorkerCards();

      // Announce for screen readers
      const workerName = avail.workerName || 'A worker';
      liveAnnouncer.textContent = en.freenowList.workerJoinedLive.replace('{name}', workerName);
      toast(en.freenowList.workerJoinedLive.replace('{name}', workerName), 'info');
    };

    const handleBusy = (payload) => {
      if (disposed || !payload?.workerId) return;
      const idx = workers.findIndex((w) => (w.workerId || w.id) === payload.workerId);
      if (idx >= 0) {
        workers.splice(idx, 1);
        renderWorkerCards();
      }
    };

    socket.on('radar:worker_free', handleFree);
    socket.on('radar:worker_busy', handleBusy);

    socketUnsub = () => {
      socket.off('radar:worker_free', handleFree);
      socket.off('radar:worker_busy', handleBusy);
    };

    // Polling fallback if socket disconnected
    pollInterval = setInterval(async () => {
      if (disposed) return;
      if (!socket.connected) {
        try {
          const coords = getLocalityCoords(locality, user);
          const res = await radarApi.getNearbyAvailability({
            lat: coords.lat,
            lng: coords.lng,
            radiusKm,
            skill: selectedSkill || undefined,
          }, token());
          if (Array.isArray(res.workers)) {
            workers.length = 0;
            workers.push(...res.workers);
            renderWorkerCards();
          }
        } catch { /* ignore quiet polling errors */ }
      }
    }, 30000);
  }

  function openFreeNowBooking(worker) {
    const idempotencyKey = crypto.randomUUID();
    const dialog = h('dialog', {
      className: 'wc-modal wc-bottom-sheet wc-booking-sheet',
      'aria-labelledby': 'wc-booking-sheet-title',
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });

    const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });

    // Pre-fill today, start in 30 minutes (rounded to 15 min)
    const now = new Date();
    const startMins = Math.ceil((now.getMinutes() + 30) / 15) * 15;
    now.setMinutes(startMins, 0, 0);

    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const localTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const dayTime = DayTimePicker({
      date: localDateStr,
      time: localTimeStr,
      onChange: ({ date, time }) => { schedule.date = date; schedule.time = time; },
    });
    const schedule = { date: localDateStr, time: localTimeStr };

    let hours = 2;
    const hoursStepper = Stepper({
      label: en.bookingSheet.hoursLabel,
      value: hours,
      min: 1,
      max: 12,
      onChange: (next) => { hours = next; updatePrice(); },
    });

    const note = h('textarea', {
      className: 'wc-input wc-textarea',
      maxlength: 200,
      placeholder: en.bookingSheet.notePlaceholder,
      'aria-label': en.bookingSheet.noteLabel.replace('{name}', worker.workerName || worker.name || 'Worker'),
      onInput: (e) => {
        noteCount.textContent = en.bookingSheet.noteCounter.replace('{count}', String(e.currentTarget.value.length));
      },
    });
    const noteCount = h('span', { className: 'wc-hint' }, en.bookingSheet.noteCounter.replace('{count}', '0'));

    const price = h('p', { className: 'wc-price-summary' });
    const compassWrap = h('div', { className: 'wc-compass-wrap' }, Skeleton({ rows: 2 }));

    const updatePrice = () => {
      const perHour = worker.rateUnit === 'hour' ? Number(worker.rate || 500) : Number(worker.rate || 500) / 8;
      price.textContent = en.bookingSheet.priceSummary.replace('{total}', formatMoney(Math.round(perHour * hours)));
    };
    updatePrice();

    compassApi.getCompass({
      skill: worker.skill || worker.skills?.[0] || 'helper',
      area: worker.area || 'Deccan',
      city: 'Pune',
      rate: worker.rate || 500,
      rateUnit: worker.rateUnit || 'day',
    }).then((data) => {
      compassWrap.replaceChildren(CompassBar({ data, rate: worker.rate || 500 }));
    }).catch(() => compassWrap.replaceChildren(h('p', { className: 'wc-hint' }, en.compass.sample)));

    const submit = Button({
      label: en.bookingSheet.submit,
      className: 'wc-full',
      onClick: async (event) => {
        error.hidden = true;
        const start = new Date(`${schedule.date}T${schedule.time}`);
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = en.bookingSheet.submitting;
        try {
          const response = await bookingsApi.createBooking({
            workerId: worker.workerId || worker.id,
            source: 'freenow',
            skill: worker.skill || worker.skills?.[0] || 'helper',
            rate: worker.rate || 500,
            rateUnit: worker.rateUnit || 'day',
            scheduledAt: start.toISOString(),
            hours,
            note: note.value.trim(),
          }, idempotencyKey, token());

          const booking = response.booking || response;
          const success = h('div', { className: 'wc-form wc-booking-success' },
            h('span', { className: 'wc-empty-mark', 'aria-hidden': 'true' }, '✓'),
            h('h2', {}, en.bookingSheet.successTitle),
            h('p', { className: 'wc-lead' }, en.bookingSheet.successBody.replace('{name}', (worker.workerName || worker.name || 'Worker').split(' ')[0])),
            Button({
              label: en.bookingSheet.viewBooking,
              className: 'wc-full',
              onClick: () => {
                dialog.close();
                navigate(`/c/booking/${booking.id}`);
              },
            }),
            Button({
              label: en.bookingSheet.keepBrowsing,
              variant: 'ghost',
              className: 'wc-full',
              onClick: () => dialog.close(),
            })
          );
          dialog.querySelector('.wc-booking-sheet-body').replaceChildren(success);
        } catch (reason) {
          error.textContent = reason.code === 'ALREADY_BOOKED' ? en.bookingSheet.alreadyBusy : friendlyError(reason);
          error.hidden = false;
          button.disabled = false;
          button.textContent = en.bookingSheet.submit;
        }
      },
    });

    dialog.append(
      h('div', { className: 'wc-modal-head' },
        h('h2', { id: 'wc-booking-sheet-title' }, en.bookingSheet.title.replace('{name}', (worker.workerName || worker.name || 'Worker').split(' ')[0])),
        Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })
      ),
      h('div', { className: 'wc-modal-body wc-form wc-booking-sheet-body' },
        dayTime,
        hoursStepper,
        h('label', { className: 'wc-field' },
          h('span', { className: 'wc-label' }, en.bookingSheet.noteLabel.replace('{name}', worker.workerName || worker.name || 'Worker')),
          note,
          noteCount
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

  return page;
}
