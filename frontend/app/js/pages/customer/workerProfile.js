import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Avatar, Badge, Button, Chip, ErrorState, Skeleton } from '../../components/index.js';
import { CompassBar, DayTimePicker, IntegrityBadge, PassportPreview, Stepper } from '../../components/customer.js';
import { workersApi } from '../../api/workers.api.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { compassApi } from '../../api/compass.api.js';
import { passportApi } from '../../api/passport.api.js';
import { feedApi } from '../../api/feed.api.js';
import { store } from '../../store.js';
import { formatDistance, formatMoney, formatRate, formatSkill, friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;
const money = (value) => formatMoney(value);

export function renderWorkerProfile({ navigate, user, id, params, toast }) {
  const workerId = id || params?.id;
  const root = h('div', { className: 'wc-profile-loading' }, Skeleton({ rows: 5 }));
  const page = customerShell({ title: en.workerProfile.title, active: '/c/find', navigate, user, content: root });
  let disposed = false;
  let bookingTrigger;
  page.dispose = () => { disposed = true; };
  void load();

  async function load() {
    try {
      const [{ worker }, { bookings = [] }] = await Promise.all([
        workersApi.getWorkerById(workerId, token()), bookingsApi.getBookings(undefined, token()).catch(() => ({})),
      ]);
      if (disposed) return;
      const hasCompleted = bookings.some((booking) => booking.workerId === workerId && booking.status === 'completed');
      render(worker, hasCompleted);
    } catch (error) {
      root.replaceChildren(ErrorState({ message: friendlyError(error) || en.workerProfile.errorLoading, onRetry: load }));
    }
  }

  function render(worker, hasCompleted) {
    let isSaved = Boolean(worker.isSaved);
    let isFollowing = Boolean(worker.isFollowing);
    const integrity = IntegrityBadge({ loading: true });
    if (worker.passportSlug) passportApi.verifyPassport(worker.passportSlug).then((result) => { integrity.replaceWith(IntegrityBadge({ valid: Boolean(result.valid) })); }).catch(() => integrity.replaceWith(IntegrityBadge({ valid: false })));
    const skillChips = (worker.skills || []).map((skill) => Chip({ label: formatSkill(skill), selected: true, disabled: true }));
    const savedButton = Button({ label: isSaved ? `♥ ${en.find.saved}` : `♡ ${en.find.unsaved}`, variant: 'outline', onClick: async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { const result = await workersApi.saveWorker(worker.id, token()); isSaved = result.active; button.textContent = isSaved ? `♥ ${en.find.saved}` : `♡ ${en.find.unsaved}`; button.setAttribute('aria-pressed', String(isSaved)); toast(isSaved ? en.find.saveSuccess : en.find.unsaveSuccess, 'success'); }
      catch (error) { toast(friendlyError(error), 'error'); } finally { button.disabled = false; }
    } });
    savedButton.setAttribute('aria-pressed', String(isSaved));
    const followButton = Button({ label: isFollowing ? en.workerProfile.unfollow : en.workerProfile.follow, variant: 'outline', onClick: async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { const result = await workersApi.followWorker(worker.id, token()); isFollowing = result.active; button.textContent = isFollowing ? en.workerProfile.unfollow : en.workerProfile.follow; toast(isFollowing ? en.workerProfile.followSuccess.replace('{name}', worker.name) : en.workerProfile.unfollowSuccess, 'success'); }
      catch (error) { toast(friendlyError(error), 'error'); } finally { button.disabled = false; }
    } });
    followButton.setAttribute('aria-pressed', String(isFollowing));
    const book = Button({ label: en.workerProfile.bookBtn.replace('{name}', worker.name.split(' ')[0]), className: 'wc-profile-book', onClick: () => openBooking(worker) });
    bookingTrigger = book;
    const endorsements = (worker.skills || []).map((skill) => h('div', { className: 'wc-endorsement-row' },
      h('span', {}, `${formatSkill(skill)} · ${worker.endorsements?.[skill] || 0}`),
      hasCompleted ? Button({ label: en.workerProfile.endorse.replace('{skill}', formatSkill(skill)), variant: 'outline', onClick: async (event) => {
        const button = event.currentTarget; button.disabled = true;
        try { await feedApi.addEndorsement({ workerId: worker.id, skill }, crypto.randomUUID(), token()); button.textContent = en.workerProfile.endorseSuccess; toast(en.workerProfile.endorseSuccess, 'success'); }
        catch (error) { toast(error.code === 'DUPLICATE_ENDORSEMENT' ? en.workerProfile.endorseBlocked : friendlyError(error), 'warning'); }
        finally { button.disabled = false; }
      } }) : h('p', { className: 'wc-hint' }, en.workerProfile.endorseNeedBooking)
    ));
    const profile = h('div', { className: 'wc-page-stack wc-worker-profile' },
      h('button', { type: 'button', className: 'wc-text-back', onClick: () => navigate(sessionStorage.getItem('workcred.findHash') || '/c/find') }, `← ${en.common.back}`),
      h('section', { className: 'wc-profile-hero' },
        worker.photoUrl ? h('img', { className: 'wc-profile-avatar wc-avatar-photo', src: worker.photoUrl, alt: '' }) : Avatar({ name: worker.name }),
        h('div', { className: 'wc-profile-heading' }, h('h2', { className: 'wc-page-title' }, worker.name), h('p', { className: 'wc-lead' }, `${worker.area}, ${worker.city}`), h('div', { className: 'wc-chip-group' }, ...skillChips), h('div', { className: 'wc-worker-tags' }, worker.passportSlug ? Badge({ label: en.find.verified, kind: 'success' }) : null, worker.isFreeNow ? Badge({ label: en.find.freeNow, kind: 'success' }) : null)),
        h('div', { className: 'wc-profile-price' }, h('strong', {}, formatRate(worker.rate, worker.rateUnit)), h('span', {}, formatDistance(worker.distanceKm)))
      ),
      h('div', { className: 'wc-profile-stats' }, h('div', {}, h('strong', {}, String(worker.jobsCompleted || 0)), h('span', {}, en.workerProfile.jobsLabel)), h('div', {}, h('strong', {}, `${worker.rating || '4.8'}★`), h('span', {}, en.workerProfile.ratingLabel)), h('div', {}, h('strong', {}, String(worker.totalHoursWorked || 0)), h('span', {}, en.workerProfile.hoursLabel))),
      h('section', { className: 'wc-profile-section' }, h('h2', {}, en.workerProfile.about), h('p', {}, worker.bio || en.workerProfile.noPassportBody)),
      h('section', { className: 'wc-profile-section' }, h('div', { className: 'wc-section-title' }, h('h2', {}, en.workerProfile.workPassport), integrity), PassportPreview({ entries: worker.passportEntries || [] }), worker.passportSlug ? h('a', { className: 'wc-text-link', href: `#/p/${worker.passportSlug}`, onClick: (event) => { event.preventDefault(); navigate(`/p/${worker.passportSlug}`); } }, en.workerProfile.viewFullPassport) : null),
      h('section', { className: 'wc-profile-section' }, h('h2', {}, en.workerProfile.endorsements), ...endorsements),
      h('section', { className: 'wc-profile-section' }, h('h2', {}, en.workerProfile.availability), ...(worker.availability?.length ? worker.availability.map((item) => Badge({ label: item.label, kind: 'success' })) : [h('p', { className: 'wc-hint' }, en.workerProfile.availabilityNone)])),
      h('section', { className: 'wc-profile-section' }, h('h2', {}, en.workerProfile.contact), h('p', { className: 'wc-hint' }, en.workerProfile.contactLocked)),
      h('div', { className: 'wc-profile-actionbar' }, savedButton, followButton, book)
    );
    root.replaceChildren(profile);
  }

  function openBooking(worker) {
    const idempotencyKey = crypto.randomUUID();
    const dialog = h('dialog', { className: 'wc-modal wc-bottom-sheet wc-booking-sheet', 'aria-labelledby': 'wc-booking-sheet-title' });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });
    const dayTime = DayTimePicker({ onChange: ({ date, time }) => { schedule.date = date; schedule.time = time; } });
    const schedule = { date: dayTime.querySelector('input[type="date"]').value, time: dayTime.querySelector('input[type="time"]').value };
    let hours = 2;
    const hoursStepper = Stepper({ label: en.bookingSheet.hoursLabel, value: hours, min: 1, max: 12, onChange: (next) => { hours = next; updatePrice(); } });
    const note = h('textarea', { className: 'wc-input wc-textarea', maxlength: 200, placeholder: en.bookingSheet.notePlaceholder, 'aria-label': en.bookingSheet.noteLabel.replace('{name}', worker.name), onInput: (event) => { noteCount.textContent = en.bookingSheet.noteCounter.replace('{count}', String(event.currentTarget.value.length)); } });
    const noteCount = h('span', { className: 'wc-hint' }, en.bookingSheet.noteCounter.replace('{count}', '0'));
    const price = h('p', { className: 'wc-price-summary' });
    const compassWrap = h('div', { className: 'wc-compass-wrap' }, Skeleton({ rows: 2 }));
    const updatePrice = () => { const perHour = worker.rateUnit === 'hour' ? Number(worker.rate) : Number(worker.rate) / 8; price.textContent = en.bookingSheet.priceSummary.replace('{total}', money(perHour * hours)); };
    updatePrice();
    compassApi.getCompass({ skill: worker.skills?.[0], area: worker.area, city: worker.city, rate: worker.rate, rateUnit: worker.rateUnit }).then((data) => { compassWrap.replaceChildren(CompassBar({ data, rate: worker.rate })); }).catch(() => compassWrap.replaceChildren(h('p', { className: 'wc-hint' }, en.compass.sample)));
    const submit = Button({ label: en.bookingSheet.submit, className: 'wc-full', onClick: async (event) => {
      error.hidden = true;
      const start = new Date(`${schedule.date}T${schedule.time}`);
      const days = (start.getTime() - Date.now()) / 86400000;
      if (days <= 0) { error.textContent = en.bookingSheet.pastTimeError; error.hidden = false; return; }
      if (days > 30) { error.textContent = en.bookingSheet.tooFarError; error.hidden = false; return; }
      if ((worker.busyWindows || []).some((window) => { const busyStart = new Date(window.scheduledAt).getTime(); const busyEnd = busyStart + Number(window.hours || 1) * 3600000; return start.getTime() < busyEnd && start.getTime() + hours * 3600000 > busyStart; })) { error.textContent = en.bookingSheet.alreadyBusy; error.hidden = false; return; }
      const button = event.currentTarget; button.disabled = true; button.textContent = en.bookingSheet.submitting;
      try {
        const response = await bookingsApi.createBooking({ workerId: worker.id, source: 'direct', skill: worker.skills?.[0] || 'helper', rate: worker.rate, rateUnit: worker.rateUnit, scheduledAt: start.toISOString(), hours, note: note.value.trim() }, idempotencyKey, token());
        const booking = response.booking || response;
        const success = h('div', { className: 'wc-form wc-booking-success' }, h('span', { className: 'wc-empty-mark', 'aria-hidden': 'true' }, '✓'), h('h2', {}, en.bookingSheet.successTitle), h('p', { className: 'wc-lead' }, en.bookingSheet.successBody.replace('{name}', worker.name)), Button({ label: en.bookingSheet.viewBooking, className: 'wc-full', onClick: () => { dialog.close(); navigate(`/c/booking/${booking.id}`); } }), Button({ label: en.bookingSheet.keepBrowsing, variant: 'ghost', className: 'wc-full', onClick: () => dialog.close() }));
        dialog.querySelector('.wc-booking-sheet-body').replaceChildren(success);
      } catch (reason) { error.textContent = reason.code === 'ALREADY_BOOKED' ? en.bookingSheet.alreadyBusy : friendlyError(reason); error.hidden = false; button.disabled = false; button.textContent = en.bookingSheet.submit; }
    } });
    dialog.append(h('div', { className: 'wc-modal-head' }, h('h2', { id: 'wc-booking-sheet-title' }, en.bookingSheet.title.replace('{name}', worker.name.split(' ')[0])), Button({ label: en.common.close, variant: 'ghost', onClick: () => dialog.close() })),
      h('div', { className: 'wc-modal-body wc-form wc-booking-sheet-body' }, dayTime, hoursStepper, h('label', { className: 'wc-field' }, h('span', { className: 'wc-label' }, en.bookingSheet.noteLabel.replace('{name}', worker.name)), note, noteCount), price, compassWrap, error, submit));
    document.body.append(dialog); dialog.addEventListener('close', () => bookingTrigger?.focus(), { once: true }); dialog.showModal();
  }

  return page;
}
