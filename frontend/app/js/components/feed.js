/**
 * WorkCred Feed & Social Components
 * Pure ES module for Free Worker Cards, Work Posts, Image Zoom Modal, and Feed stream.
 */

import { h } from '../utils/dom.js';
import { en } from '../i18n/en.js';
import { Avatar, Badge, Button, StarRating } from './index.js';
import { formatBookingDate, formatDistance, formatMoney, formatSkill } from '../utils/format.js';
import { CompassBar } from './customer.js';
import { ReportSheetModal } from './passport.js';

/**
 * Free Worker Card for Free Now List and Feed
 */
export function FreeWorkerCard({
  worker,
  onOpen,
  onBookNow,
  onSave,
  className = '',
}) {
  const saveBtn = h('button', {
    type: 'button',
    className: `wc-save-button${worker.isSaved ? ' is-saved' : ''}`,
    'aria-label': worker.isSaved ? en.find.unsave : en.find.saved,
    'aria-pressed': String(Boolean(worker.isSaved)),
    onClick: (e) => {
      e.stopPropagation();
      onSave?.(worker, e.currentTarget);
    },
  }, worker.isSaved ? '♥' : '♡');

  const distanceStr = worker.distanceKm != null ? formatDistance(worker.distanceKm) : (worker.distanceLabel || '');
  const areaStr = worker.area || worker.city || 'Pune';
  const locationLabel = distanceStr ? `${areaStr} · ${distanceStr}` : areaStr;

  // Time remaining calculation
  const getTimeLeftStr = (expiresAt) => {
    if (!expiresAt) return '2 hours';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return '0 min';
    const totalMin = Math.floor(diffMs / 60000);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hrs > 0) return `${hrs} h ${mins} min`;
    return `${mins} min`;
  };

  const timeLeftSpan = h('span', { className: 'wc-freenow-time' },
    en.freenowList.freeFor.replace('{timeLeft}', getTimeLeftStr(worker.expiresAt))
  );

  const card = h('article', {
    className: `wc-worker-card wc-freenow-card ${className}`.trim(),
    'aria-label': `${worker.workerName || worker.name}, ${formatSkill(worker.skill || worker.skills?.[0])}`,
  },
    h('div', { className: 'wc-worker-card-body' },
      h('div', { className: 'wc-worker-card-head' },
        worker.photoUrl || worker.workerPhotoUrl
          ? h('img', { className: 'wc-avatar wc-avatar-photo', src: worker.photoUrl || worker.workerPhotoUrl, alt: '' })
          : Avatar({ name: worker.workerName || worker.name || 'Worker' }),
        h('div', { className: 'wc-worker-copy' },
          h('h2', {}, worker.workerName || worker.name || 'Worker'),
          h('p', { className: 'wc-worker-skill' }, formatSkill(worker.skill || worker.skills?.[0] || 'helper')),
          h('p', { className: 'wc-worker-meta' },
            StarRating({ value: worker.rating ?? '4.8' }),
            h('span', { className: 'wc-jobs-count' }, `· ${worker.jobsCompleted ?? 0} jobs`)
          )
        ),
        saveBtn
      ),
      h('div', { className: 'wc-worker-tags' },
        Badge({ label: `● ${en.freenowList.liveDot}`, kind: 'clay' }),
        worker.passportSlug ? Badge({ label: '✓ Verified', kind: 'success' }) : null,
        timeLeftSpan
      ),
      h('div', { className: 'wc-worker-card-foot' },
        h('span', { className: 'wc-worker-location' },
          h('span', { className: 'wc-pin-icon', 'aria-hidden': 'true' }, '📍'),
          locationLabel
        ),
        h('div', { className: 'wc-rate-badge' },
          h('strong', {}, formatMoney(worker.rate || 500)),
          h('small', {}, ` / ${worker.rateUnit || 'day'}`)
        )
      ),
      h('div', { className: 'wc-freenow-card-actions' },
        Button({
          label: en.freenowList.bookNow,
          variant: 'primary',
          className: 'wc-full',
          onClick: (e) => {
            e.stopPropagation();
            onBookNow?.(worker);
          },
        }),
        h('button', {
          type: 'button',
          className: 'wc-profile-link-btn',
          onClick: (e) => {
            e.stopPropagation();
            onOpen?.(worker);
          },
        }, `${en.common.viewProfile} →`)
      )
    )
  );

  card.updateTime = () => {
    timeLeftSpan.textContent = en.freenowList.freeFor.replace('{timeLeft}', getTimeLeftStr(worker.expiresAt));
  };

  card.addEventListener('click', () => onOpen?.(worker));
  return card;
}

/**
 * Accessible Modal Image Viewer (focus trap & escape to close)
 */
export function ImageViewerModal({ src, alt = '', trigger }) {
  const dialog = h('dialog', {
    className: 'wc-modal wc-image-viewer-modal',
    'aria-label': alt || en.workPost.viewFullImage,
  });

  const img = h('img', { src, alt, className: 'wc-image-viewer-img' });
  const closeBtn = Button({
    label: en.common.close,
    variant: 'outline',
    className: 'wc-image-viewer-close',
    onClick: () => dialog.close(),
  });

  dialog.append(closeBtn, img);

  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger?.focus?.();
  }, { once: true });

  dialog.showModal();
  return dialog;
}

/**
 * Work Post Card (Photos, before/after comparison, caption, follow/save, report)
 */
export function WorkPostCard({
  post,
  onOpenProfile,
  onSave,
  onFollow,
  onReport,
  onDelete,
  isOwner = false,
}) {
  const card = h('article', {
    className: 'wc-card wc-work-post-card',
    'aria-label': `Work post by ${post.workerName || 'Worker'}`,
  });

  let isSaved = Boolean(post.isSaved);
  let isFollowing = Boolean(post.isFollowing);

  const saveBtn = h('button', {
    type: 'button',
    className: `wc-save-button${isSaved ? ' is-saved' : ''}`,
    'aria-label': isSaved ? en.find.unsave : en.find.saved,
    'aria-pressed': String(isSaved),
    onClick: async (e) => {
      e.stopPropagation();
      const prev = isSaved;
      isSaved = !prev;
      saveBtn.classList.toggle('is-saved', isSaved);
      saveBtn.setAttribute('aria-pressed', String(isSaved));
      saveBtn.textContent = isSaved ? '♥' : '♡';
      try {
        await onSave?.(post, isSaved);
      } catch {
        isSaved = prev;
        saveBtn.classList.toggle('is-saved', isSaved);
        saveBtn.setAttribute('aria-pressed', String(isSaved));
        saveBtn.textContent = isSaved ? '♥' : '♡';
      }
    },
  }, isSaved ? '♥' : '♡');

  const followBtn = Button({
    label: isFollowing ? en.workerProfile.unfollow : en.workerProfile.follow,
    variant: 'outline',
    className: 'wc-post-follow-btn',
    onClick: async (e) => {
      e.stopPropagation();
      const prev = isFollowing;
      isFollowing = !prev;
      followBtn.textContent = isFollowing ? en.workerProfile.unfollow : en.workerProfile.follow;
      try {
        await onFollow?.(post, isFollowing);
      } catch {
        isFollowing = prev;
        followBtn.textContent = isFollowing ? en.workerProfile.unfollow : en.workerProfile.follow;
      }
    },
  });

  const relativeTime = formatBookingDate(post.createdAt);
  const locationStr = post.workerArea ? `${post.workerArea} · ` : '';

  // Header
  const head = h('div', { className: 'wc-work-post-head' },
    post.workerPhotoUrl
      ? h('img', { className: 'wc-avatar wc-avatar-photo', src: post.workerPhotoUrl, alt: '' })
      : Avatar({ name: post.workerName || 'Worker' }),
    h('div', { className: 'wc-work-post-author' },
      h('h3', { className: 'wc-work-post-name' }, post.workerName || 'Worker'),
      h('p', { className: 'wc-work-post-meta' },
        `${locationStr}${formatSkill(post.skill)} · ${relativeTime}`
      )
    ),
    !isOwner ? saveBtn : null
  );

  // Photos Area
  const photosContainer = h('div', { className: 'wc-work-post-photos' });

  const createPhotoItem = (url, label) => {
    const item = h('div', { className: 'wc-work-post-photo-wrap' },
      h('img', {
        src: url,
        alt: `${label} work photo by ${post.workerName || 'Worker'}`,
        className: 'wc-work-post-img',
        loading: 'lazy',
      }),
      h('span', { className: 'wc-photo-tag' }, label)
    );
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      ImageViewerModal({ src: url, alt: `${label} work photo`, trigger: item });
    });
    return item;
  };

  if (post.beforePhotoUrl && post.afterPhotoUrl) {
    photosContainer.classList.add('wc-work-post-photos--split');
    photosContainer.append(
      createPhotoItem(post.beforePhotoUrl, en.workPost.beforeLabel),
      createPhotoItem(post.afterPhotoUrl, en.workPost.afterLabel)
    );
  } else if (post.afterPhotoUrl) {
    photosContainer.append(createPhotoItem(post.afterPhotoUrl, en.workPost.afterLabel));
  }

  // Verified Job Link Tag
  const verifiedBadge = post.linkedBooking
    ? h('div', { className: 'wc-work-post-verified-row' },
        Badge({ label: `✓ ${en.workPost.verifiedJobBadge}`, kind: 'success' })
      )
    : null;

  // Caption (strictly via textContent)
  const captionP = h('p', { className: 'wc-work-post-caption' });
  captionP.textContent = post.caption || '';

  // Footer & Actions
  const foot = h('div', { className: 'wc-work-post-foot' },
    h('div', { className: 'wc-work-post-actions' },
      !isOwner ? followBtn : null,
      post.workerId ? h('button', {
        type: 'button',
        className: 'wc-profile-link-btn',
        onClick: (e) => {
          e.stopPropagation();
          onOpenProfile?.(post.workerId);
        },
      }, `${en.common.viewProfile} →`) : null
    ),
    h('div', { className: 'wc-work-post-menu' },
      isOwner && onDelete
        ? Button({
            label: en.common.delete,
            variant: 'ghost',
            className: 'wc-danger-text',
            onClick: (e) => {
              e.stopPropagation();
              onDelete(post);
            },
          })
        : Button({
            label: '···',
            variant: 'ghost',
            'aria-label': en.workPost.reportPost,
            onClick: (e) => {
              e.stopPropagation();
              ReportSheetModal({
                title: en.workPost.reportPost,
                trigger: e.currentTarget,
                onSubmit: (report) => onReport?.(post, report),
              });
            },
          })
    )
  );

  card.append(head, photosContainer, verifiedBadge, captionP, foot);
  return card;
}
