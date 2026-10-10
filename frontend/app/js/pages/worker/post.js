/**
 * WorkCred Worker Post Screen (/app/w/post)
 * Create Work Posts with Before/After photos, linked completed jobs, and caption safety.
 */

import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../../components/index.js';
import { WorkPostCard } from '../../components/feed.js';
import { ConfirmSheet } from '../../components/customer.js';
import { feedApi } from '../../api/feed.api.js';
import { bookingsApi } from '../../api/bookings.api.js';
import { uploadApi } from '../../api/uploads.api.js';
import { store } from '../../store.js';
import { formatBookingDate, formatSkill, friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderWorkerPost({ navigate, user, toast }) {
  let disposed = false;
  const mySkills = user?.skills || ['helper'];
  let selectedSkill = user?.mainSkill || mySkills[0] || 'helper';

  let afterPhotoDataUrl = null;
  let beforePhotoDataUrl = null;
  let linkedBookingId = '';
  const completedBookings = [];
  const myPosts = [];

  // Form State Elements
  const skillChips = mySkills.map((sk) =>
    Chip({
      label: formatSkill(sk),
      selected: sk === selectedSkill,
      onClick: () => {
        selectedSkill = sk;
        skillChips.forEach((chip, idx) => {
          const active = mySkills[idx] === sk;
          chip.classList.toggle('is-selected', active);
          chip.setAttribute('aria-pressed', String(active));
        });
        updatePreview();
      },
    })
  );

  const captionInput = h('textarea', {
    className: 'wc-input wc-textarea',
    maxlength: 140,
    rows: 3,
    placeholder: en.workPost.captionPlaceholder,
    'aria-label': en.workPost.captionLabel,
    onInput: (e) => {
      captionCounter.textContent = en.workPost.captionCounter.replace('{count}', String(e.currentTarget.value.length));
      updatePreview();
    },
  });
  const captionCounter = h('span', { className: 'wc-hint' }, en.workPost.captionCounter.replace('{count}', '0'));

  // Photo Input Helpers
  const afterPhotoInput = h('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    className: 'wc-sr-only',
    id: 'after-photo-file',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          afterPhotoStatus.textContent = 'Compressing…';
          afterPhotoDataUrl = await compressImage(file);
          afterPhotoStatus.textContent = '✓ Photo attached';
          afterPreviewImg.src = afterPhotoDataUrl;
          afterPreviewImg.hidden = false;
          updatePreview();
        } catch (err) {
          afterPhotoStatus.textContent = friendlyError(err);
        }
      }
    },
  });

  const afterPhotoStatus = h('span', { className: 'wc-hint' }, 'No photo chosen');
  const afterPreviewImg = h('img', { className: 'wc-photo-thumbnail', alt: 'After photo preview', hidden: true });
  const afterPhotoBtn = h('label', {
    htmlFor: 'after-photo-file',
    className: 'wc-button wc-button--outline wc-photo-pick-btn',
  }, '📷 Choose After photo', afterPhotoInput);

  const beforePhotoInput = h('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    className: 'wc-sr-only',
    id: 'before-photo-file',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          beforePhotoStatus.textContent = 'Compressing…';
          beforePhotoDataUrl = await compressImage(file);
          beforePhotoStatus.textContent = '✓ Photo attached';
          beforePreviewImg.src = beforePhotoDataUrl;
          beforePreviewImg.hidden = false;
          updatePreview();
        } catch (err) {
          beforePhotoStatus.textContent = friendlyError(err);
        }
      }
    },
  });

  const beforePhotoStatus = h('span', { className: 'wc-hint' }, 'Optional');
  const beforePreviewImg = h('img', { className: 'wc-photo-thumbnail', alt: 'Before photo preview', hidden: true });
  const beforePhotoBtn = h('label', {
    htmlFor: 'before-photo-file',
    className: 'wc-button wc-button--outline wc-photo-pick-btn',
  }, '📷 Choose Before photo', beforePhotoInput);

  // Completed Bookings Dropdown
  const bookingSelect = h('select', {
    className: 'wc-input',
    'aria-label': en.workPost.linkedJobLabel,
    onChange: (e) => {
      linkedBookingId = e.target.value;
      updatePreview();
    },
  },
    h('option', { value: '' }, en.workPost.linkedJobNone)
  );

  // Form Error Display
  const formError = h('p', { className: 'wc-form-error', role: 'alert', hidden: true });

  // Post Preview Area
  const previewContainer = h('div', { className: 'wc-post-preview-card' });

  // Submit Button
  const submitBtn = Button({
    label: en.workPost.postBtn,
    variant: 'primary',
    className: 'wc-full',
    onClick: () => void handlePublish(),
  });

  // My Posts List
  const myPostsList = h('div', { className: 'wc-my-posts-list' });

  const formSection = h('section', { className: 'wc-card wc-form wc-post-form' },
    h('h2', { className: 'wc-section-title' }, en.workPost.createTitle),
    h('div', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, en.workPost.skillLabel),
      h('div', { className: 'wc-chip-group', role: 'group' }, ...skillChips)
    ),
    h('div', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, en.workPost.afterPhotoLabel),
      h('div', { className: 'wc-photo-input-row' }, afterPhotoBtn, afterPhotoStatus, afterPreviewImg)
    ),
    h('div', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, en.workPost.beforePhotoLabel),
      h('div', { className: 'wc-photo-input-row' }, beforePhotoBtn, beforePhotoStatus, beforePreviewImg)
    ),
    h('div', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, en.workPost.linkedJobLabel),
      bookingSelect
    ),
    h('div', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, en.workPost.captionLabel),
      captionInput,
      captionCounter
    ),
    formError,
    h('div', { className: 'wc-field' },
      h('span', { className: 'wc-label' }, en.workPost.previewTitle),
      previewContainer
    ),
    submitBtn
  );

  const root = h('div', { className: 'wc-page-stack wc-worker-post-page' },
    formSection,
    h('section', { className: 'wc-my-posts-section' },
      h('h2', { className: 'wc-section-title' }, en.workPost.myPostsTitle),
      myPostsList
    )
  );

  const page = workerShell({
    title: en.workPost.title,
    active: '/w/post',
    navigate,
    user,
    content: root,
  });

  page.dispose = () => {
    disposed = true;
  };

  void loadInitialData();
  updatePreview();

  async function loadInitialData() {
    try {
      const [bookingsRes, postsRes] = await Promise.all([
        bookingsApi.getBookings('completed', token()).catch(() => ({ bookings: [] })),
        feedApi.getMyPosts(token()).catch(() => ({ posts: [] })),
      ]);

      if (disposed) return;
      const bList = bookingsRes.bookings || [];
      completedBookings.length = 0;
      completedBookings.push(...bList);

      bookingSelect.replaceChildren(
        h('option', { value: '' }, en.workPost.linkedJobNone),
        ...completedBookings.map((b) =>
          h('option', { value: b.id },
            `${formatSkill(b.skill)} · ${formatBookingDate(b.finishedAt || b.createdAt)} (${(b.customerName || 'Customer').split(' ')[0]})`
          )
        )
      );

      myPosts.length = 0;
      if (Array.isArray(postsRes.posts)) {
        myPosts.push(...postsRes.posts);
      }
      renderMyPosts();
    } catch { /* handle quiet loads */ }
  }

  function renderMyPosts() {
    if (!myPosts.length) {
      myPostsList.replaceChildren(
        h('p', { className: 'wc-hint' }, en.workPost.noPostsYet)
      );
      return;
    }

    myPostsList.replaceChildren(
      ...myPosts.map((post) =>
        WorkPostCard({
          post,
          isOwner: true,
          onDelete: (p) => {
            ConfirmSheet({
              title: en.workPost.deletePostTitle,
              body: en.workPost.deletePostBody,
              confirmLabel: en.workPost.deletePostConfirm,
              onConfirm: async () => {
                await feedApi.deletePost(p.id, token());
                const idx = myPosts.findIndex((m) => m.id === p.id);
                if (idx >= 0) myPosts.splice(idx, 1);
                renderMyPosts();
                toast(en.workPost.deleteSuccess, 'success');
              },
            });
          },
        })
      )
    );
  }

  function updatePreview() {
    const linked = completedBookings.find((b) => b.id === linkedBookingId);
    const mockPost = {
      id: 'preview',
      workerId: user?.id,
      workerName: user?.name || 'You',
      workerArea: user?.area || 'Pune',
      workerPhotoUrl: user?.photoUrl || null,
      skill: selectedSkill,
      caption: captionInput.value.trim() || 'Your caption will appear here…',
      beforePhotoUrl: beforePhotoDataUrl,
      afterPhotoUrl: afterPhotoDataUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23EBE5DC" width="400" height="300"/><text fill="%236B5E54" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16">After Photo Preview</text></svg>',
      linkedBooking: linked ? { bookingId: linked.id, skill: linked.skill, finishedAt: linked.finishedAt } : null,
      createdAt: new Date().toISOString(),
    };

    previewContainer.replaceChildren(
      WorkPostCard({
        post: mockPost,
        isOwner: true,
      })
    );
  }

  async function handlePublish() {
    formError.hidden = true;

    if (!navigator.onLine) {
      formError.textContent = en.workPost.offlineWarning;
      formError.hidden = false;
      return;
    }

    if (!afterPhotoDataUrl) {
      formError.textContent = 'Please select an After photo for your post.';
      formError.hidden = false;
      return;
    }

    const caption = captionInput.value.trim();
    if (!caption || caption.length < 5) {
      formError.textContent = 'Caption must be at least 5 characters long.';
      formError.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = en.workPost.postingBtn;

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await feedApi.createPost({
        skill: selectedSkill,
        caption,
        afterPhotoUrl: afterPhotoDataUrl,
        beforePhotoUrl: beforePhotoDataUrl || undefined,
        linkedBookingId: linkedBookingId || undefined,
      }, idempotencyKey, token());

      if (res.post) {
        myPosts.unshift(res.post);
        renderMyPosts();
      }

      // Reset form
      captionInput.value = '';
      captionCounter.textContent = en.workPost.captionCounter.replace('{count}', '0');
      afterPhotoDataUrl = null;
      beforePhotoDataUrl = null;
      afterPhotoStatus.textContent = 'No photo chosen';
      beforePhotoStatus.textContent = 'Optional';
      afterPreviewImg.hidden = true;
      beforePreviewImg.hidden = true;
      bookingSelect.value = '';
      linkedBookingId = '';
      updatePreview();

      toast(en.workPost.postSuccess, 'success');
    } catch (err) {
      formError.textContent = friendlyError(err);
      formError.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = en.workPost.postBtn;
    }
  }

  return page;
}

/**
 * In-browser canvas image compressor (max 1280px, WebP/JPEG, max 5MB)
 */
async function compressImage(file) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image size must be less than 5 MB.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image content.'));
      img.onload = () => {
        const MAX_DIM = 1280;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
