/**
 * WorkCred Community Feed Page (/app/feed)
 * Universal feed for workers and customers with cursor pagination,
 * IntersectionObserver auto-load, role-based card rendering, and optimistic social actions.
 */

import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { customerShell } from '../../layouts/customerShell.js';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { WorkPostCard, FreeWorkerCard } from '../../components/feed.js';
import { WorkerJobCard } from '../../components/worker.js';
import { JobDetailSheet } from '../../components/worker.js';
import { DayTimePicker, Stepper, CompassBar } from '../../components/customer.js';
import { feedApi } from '../../api/feed.api.js';
import { workersApi } from '../../api/workers.api.js';
import { jobsApi } from '../../api/jobs.api.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { reportsApi } from '../../api/reports.api.js';
import { compassApi } from '../../api/compass.api.js';
import { store } from '../../store.js';
import { formatMoney, formatSkill, friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderFeed({ navigate, user, toast }) {
  let disposed = false;
  const role = user?.role || 'customer';
  let filter = 'all';
  let nextCursor = null;
  let loading = false;
  const feedItems = [];

  // Filter Chips
  const chipAll = Chip({ label: en.feed.filterAll, selected: true, onClick: () => selectFilter('all') });
  const chipPosts = Chip({ label: en.feed.filterPosts, selected: false, onClick: () => selectFilter('posts') });
  const roleChipLabel = role === 'worker' ? en.feed.filterJobs : en.feed.filterFreeNow;
  const roleFilterVal = role === 'worker' ? 'jobs' : 'freenow';
  const chipRole = Chip({ label: roleChipLabel, selected: false, onClick: () => selectFilter(roleFilterVal) });

  function selectFilter(f) {
    filter = f;
    [chipAll, chipPosts, chipRole].forEach((c, idx) => {
      const active = (idx === 0 && f === 'all') || (idx === 1 && f === 'posts') || (idx === 2 && f === roleFilterVal);
      c.classList.toggle('is-selected', active);
      c.setAttribute('aria-pressed', String(active));
    });
    nextCursor = null;
    void loadFeed(false);
  }

  const listContainer = h('div', { className: 'wc-feed-stream' });
  const errorContainer = h('div', { className: 'wc-feed-error' });

  const showMoreBtn = Button({
    label: en.feed.showMore,
    variant: 'outline',
    className: 'wc-full wc-feed-more-btn',
    onClick: () => void loadFeed(true),
  });
  showMoreBtn.hidden = true;

  const endOfFeedNotice = h('p', { className: 'wc-feed-end-notice', hidden: true }, en.feed.endOfFeed);

  // Sentinel for IntersectionObserver auto-loading
  const sentinel = h('div', { className: 'wc-feed-sentinel', 'aria-hidden': 'true' });

  const root = h('div', { className: 'wc-page-stack wc-feed-page' },
    h('div', { className: 'wc-feed-header' },
      h('h1', { className: 'wc-serif-title' }, en.feed.title),
      h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': 'Feed filter' },
        chipAll, chipPosts, chipRole
      )
    ),
    errorContainer,
    listContainer,
    showMoreBtn,
    endOfFeedNotice,
    sentinel
  );

  const shellFn = role === 'worker' ? workerShell : customerShell;
  const page = shellFn({
    title: en.feed.title,
    active: '/feed',
    navigate,
    user,
    content: root,
  });

  // IntersectionObserver for auto-load
  let observer = null;
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && nextCursor !== null && !loading && !disposed) {
        void loadFeed(true);
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinel);
  }

  page.dispose = () => {
    disposed = true;
    if (observer) observer.disconnect();
  };

  void loadFeed(false);

  async function loadFeed(append = false) {
    if (loading) return;
    loading = true;
    errorContainer.replaceChildren();

    if (!append) {
      feedItems.length = 0;
      listContainer.replaceChildren(Skeleton({ rows: 4 }));
      showMoreBtn.hidden = true;
      endOfFeedNotice.hidden = true;
    } else {
      showMoreBtn.disabled = true;
      showMoreBtn.textContent = en.common.loading;
    }

    try {
      const res = await feedApi.getFeed({
        cursor: append ? nextCursor : 0,
        limit: 15,
        filter,
      }, token());

      if (disposed) return;
      nextCursor = res.nextCursor;

      if (!append) {
        feedItems.length = 0;
        listContainer.replaceChildren();
      }

      if (Array.isArray(res.feed)) {
        feedItems.push(...res.feed);
        renderFeedCards(res.feed, append);
      }

      showMoreBtn.hidden = nextCursor === null;
      showMoreBtn.disabled = false;
      showMoreBtn.textContent = en.feed.showMore;

      if (feedItems.length > 0 && nextCursor === null) {
        endOfFeedNotice.hidden = false;
      }

      if (!feedItems.length) {
        listContainer.replaceChildren(EmptyState({
          title: en.feed.emptyTitle,
          body: en.feed.emptyBody,
        }));
      }
    } catch (err) {
      if (disposed) return;
      if (!append) listContainer.replaceChildren();
      errorContainer.replaceChildren(ErrorState({
        message: friendlyError(err) || en.errors.network,
        onRetry: () => void loadFeed(append),
      }));
    } finally {
      loading = false;
    }
  }

  function renderFeedCards(items, append) {
    items.forEach((feedEntry) => {
      const el = buildCardForEntry(feedEntry);
      if (el) listContainer.append(el);
    });
  }

  function buildCardForEntry(feedEntry) {
    const { type, item } = feedEntry;

    if (type === 'post') {
      return WorkPostCard({
        post: item,
        isOwner: item.workerId === user?.id,
        onOpenProfile: (workerId) => {
          if (role === 'customer') {
            navigate(`/c/worker/${encodeURIComponent(workerId)}`);
          } else {
            navigate(`/p/${item.passportSlug || workerId}`);
          }
        },
        onSave: async (post, isSaved) => {
          await feedApi.saveWorker(post.workerId, crypto.randomUUID(), token());
          toast(isSaved ? en.find.saveSuccess : en.find.unsaveSuccess, 'success');
        },
        onFollow: async (post, isFollowing) => {
          if (isFollowing) {
            await feedApi.followUser(post.workerId, crypto.randomUUID(), token());
            toast(en.workerProfile.followSuccess.replace('{name}', post.workerName || 'Worker'), 'success');
          } else {
            await feedApi.unfollowUser(post.workerId, token());
            toast(en.workerProfile.unfollowSuccess, 'success');
          }
        },
        onReport: async (post, reportData) => {
          await reportsApi.submitReport({
            targetType: 'post',
            targetId: post.id,
            reason: reportData.reason,
            details: reportData.note,
          }, token());
          toast(en.publicPassport.reportSubmitted, 'success');
        },
      });
    }

    if (type === 'open_job' && role === 'worker') {
      return WorkerJobCard({
        job: item,
        onOpen: () => {
          JobDetailSheet({
            job: item,
            onAccept: async (j) => {
              await jobsApi.acceptJob(j.id, token());
              toast('Job accepted! Check My Work.', 'success');
              navigate('/w/work');
            },
          });
        },
      });
    }

    if (type === 'free_now' && role === 'customer') {
      return FreeWorkerCard({
        worker: item,
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
    }

    return null;
  }

  function openFreeNowBooking(worker) {
    const idempotencyKey = crypto.randomUUID();
    const dialog = h('dialog', {
      className: 'wc-modal wc-bottom-sheet wc-booking-sheet',
      'aria-labelledby': 'wc-booking-sheet-title',
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });

    const error = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });

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
