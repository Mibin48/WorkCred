/**
 * Worker Work Passport Screen (/app/w/passport)
 * Hero card with live QR code, sharing actions, print view,
 * live integrity check, and privacy-managed job timeline.
 */

import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Button, EmptyState, Skeleton } from '../../components/index.js';
import {
  PassportCard,
  IntegrityStrip,
  TimelineEntry,
  EntryDetailSheet,
  VerificationExplainerSheet,
} from '../../components/passport.js';
import { passportApi } from '../../api/passport.api.js';
import { usersApi } from '../../api/users.api.js';
import { store } from '../../store.js';
import { socket } from '../../realtime/socket.js';
import { EVENT_NAMES } from '/shared/constants.js';
import { friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderWorkerPassport({ navigate, user, toast, dev }) {
  let entries = [];
  let integrity = { status: 'pending', totalRecords: 0, isValid: true, tamperedPos: null };
  let pageSize = 20;
  let visibleCount = 20;
  let disposed = false;
  let newlyAddedId = null;

  const root = h('div', { className: 'wc-page-stack wc-worker-passport-page' }, Skeleton({ rows: 5 }));
  const page = workerShell({ title: en.passport.title, active: '/w/passport', navigate, user, content: root });

  async function load(isRefresh = false) {
    try {
      const [passportRes, verifyRes, meRes] = await Promise.all([
        passportApi.getMyPassport(token()),
        user.passportSlug ? passportApi.verifyPassport(user.passportSlug).catch(() => null) : null,
        usersApi.getMe(token()).catch(() => ({ user })),
      ]);

      if (disposed) return;
      entries = passportRes.passportEntries || [];
      const updatedUser = meRes.user || user;

      if (verifyRes) {
        integrity = {
          status: verifyRes.valid ? 'valid' : 'tampered',
          totalRecords: verifyRes.totalRecords || entries.length,
          isValid: verifyRes.valid,
          tamperedPos: verifyRes.firstBrokenIndex ?? null,
        };
      } else {
        integrity = { status: 'error', totalRecords: entries.length, isValid: false, tamperedPos: null };
      }

      render(updatedUser);
    } catch (err) {
      if (disposed) return;
      root.replaceChildren(
        EmptyState({
          title: en.errors.generic,
          body: friendlyError(err),
          actionLabel: 'Retry',
          onAction: () => void load(true),
        })
      );
    }
  }

  function render(currentUser) {
    root.replaceChildren();

    // Stats calculations
    const totalJobs = entries.length;
    const totalHours = entries.reduce((acc, e) => acc + (e.fields?.hoursWorked || 0), 0);
    const avgRating = totalJobs > 0
      ? (entries.reduce((acc, e) => acc + (e.fields?.rating || 5), 0) / totalJobs).toFixed(1)
      : (currentUser.rating || '4.8');

    // Top skills breakdown
    const skillsMap = {};
    for (const e of entries) {
      if (e.fields?.skill) skillsMap[e.fields.skill] = (skillsMap[e.fields.skill] || 0) + 1;
    }
    const topSkills = Object.entries(skillsMap)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count);

    const publicSlug = currentUser.passportSlug || `worker-${currentUser.id}`;
    const publicUrl = `${window.location.origin}/p/${publicSlug}`;

    // 1. Passport Card
    const passportCard = PassportCard({
      worker: currentUser,
      jobsCount: totalJobs,
      rating: avgRating,
      totalHours,
      topSkills,
      publicUrl,
      onShareWhatsapp: () => {
        const text = `Hi, check out my verified WorkCred Passport: ${publicUrl}`;
        if (navigator.share) {
          navigator.share({ title: `${currentUser.name} - Work Passport`, text, url: publicUrl }).catch(() => {});
        } else {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        }
      },
      onCopyLink: async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(publicUrl);
          } else {
            const temp = document.createElement('input');
            temp.value = publicUrl;
            document.body.append(temp);
            temp.select();
            document.execCommand('copy');
            temp.remove();
          }
          toast(en.passport.linkCopied, 'success');
        } catch {
          toast(publicUrl, 'info');
        }
      },
      onPrintCard: () => {
        window.print();
      },
      onSaveQr: () => {
        toast(en.passport.qrSaved, 'success');
      },
    });

    // 2. Public Link Preview Bar
    const publicBar = h('section', { className: 'wc-public-link-bar' },
      h('div', { className: 'wc-public-link-info' },
        h('span', { className: 'wc-label' }, en.passport.publicUrlLabel),
        h('input', {
          className: 'wc-input wc-public-url-input',
          type: 'text',
          readOnly: true,
          value: publicUrl,
          onClick: (e) => e.target.select(),
        })
      ),
      h('a', {
        href: `/p/${publicSlug}`,
        className: 'wc-button wc-button--outline',
        target: '_blank',
        rel: 'noopener noreferrer',
      }, en.passport.openPublicView)
    );

    // 3. Plain-English Integrity Strip
    const integrityStrip = IntegrityStrip({
      status: integrity.status,
      recordCount: integrity.totalRecords || totalJobs,
      isTampered: !integrity.isValid,
      tamperedPos: integrity.tamperedPos,
      isDev: dev,
      onRetry: () => void load(true),
      onOpenExplainer: (e) => {
        VerificationExplainerSheet({ count: integrity.totalRecords || totalJobs, trigger: e.currentTarget });
      },
    });

    // 4. Job History Section
    const historySection = h('section', { className: 'wc-timeline-section' });

    if (totalJobs === 0) {
      historySection.append(
        EmptyState({
          title: en.passport.emptyTitle,
          body: en.passport.emptyBody,
          actionLabel: en.passport.emptyAction,
          onAction: () => navigate('/w/home'),
        })
      );
    } else {
      const hiddenCount = entries.filter((e) => e.visibility === 'private').length;
      const visibleRecords = totalJobs - hiddenCount;

      const filterSummary = h('div', { className: 'wc-timeline-header-row' },
        h('h2', {}, en.passport.timelineTitle),
        h('span', { className: 'wc-badge wc-badge--neutral' },
          en.passport.filterSummary.replace('{visible}', String(visibleRecords)).replace('{hidden}', String(hiddenCount))
        )
      );

      // Global default mask switch
      const globalMaskToggle = h('label', { className: 'wc-check-row wc-global-mask-toggle' },
        h('input', {
          type: 'checkbox',
          checked: currentUser.hideEmployerNamesDefault !== false,
          onChange: async (e) => {
            const hide = e.target.checked;
            try {
              await usersApi.updateMe({ hideEmployerNamesDefault: hide }, token());
              toast(en.passport.privacyUpdated, 'success');
            } catch (err) {
              toast(friendlyError(err), 'error');
            }
          },
        }),
        h('div', {},
          h('strong', {}, en.passport.globalMaskLabel),
          h('small', { className: 'wc-hint' }, en.passport.globalMaskDesc)
        )
      );

      const list = h('ol', { className: 'wc-timeline-list' });
      const currentSlice = entries.slice(0, visibleCount);

      for (const entry of currentSlice) {
        if (newlyAddedId === entry.id) entry.isNew = true;

        const item = TimelineEntry({
          entry,
          isWorkerOwner: true,
          onOpenDetail: (e) => {
            EntryDetailSheet({
              entry,
              isWorkerOwner: true,
              onUpdatePrivacy: async (patch) => {
                try {
                  const res = await passportApi.updateEntry(entry.id, patch, token());
                  Object.assign(entry, res.entry);
                  toast(en.passport.privacyUpdated, 'success');
                  render(currentUser);
                } catch (err) {
                  toast(friendlyError(err), 'error');
                }
              },
              trigger: e?.currentTarget,
            });
          },
          onToggleVisibility: async (newVis) => {
            const prev = entry.visibility;
            entry.visibility = newVis;
            render(currentUser);
            try {
              await passportApi.updateEntry(entry.id, { visibility: newVis }, token());
              toast(en.passport.privacyUpdated, 'success');
            } catch {
              entry.visibility = prev;
              render(currentUser);
              toast(en.passport.privacyFailed, 'error');
            }
          },
          onToggleMask: async (newMask) => {
            const prev = entry.isMasked;
            entry.isMasked = newMask;
            render(currentUser);
            try {
              await passportApi.updateEntry(entry.id, { isMasked: newMask }, token());
              toast(en.passport.privacyUpdated, 'success');
            } catch {
              entry.isMasked = prev;
              render(currentUser);
              toast(en.passport.privacyFailed, 'error');
            }
          },
        });
        list.append(item);
      }

      historySection.append(filterSummary, globalMaskToggle, list);

      if (visibleCount < entries.length) {
        const moreBtn = Button({
          label: en.passport.showMore,
          variant: 'outline',
          onClick: () => {
            visibleCount += pageSize;
            render(currentUser);
          },
        });
        historySection.append(h('div', { className: 'wc-timeline-more' }, moreBtn));
      }
    }

    root.append(passportCard, publicBar, integrityStrip, historySection);
  }

  // Socket update on job completion
  const unsubscribe = socket.on(EVENT_NAMES.BOOKING_COMPLETED, (payload) => {
    if (disposed) return;
    newlyAddedId = payload?.entry?.id || null;
    toast(en.worker.jobDonePassport, 'success');
    void load(true);
  });

  void load();

  page.dispose = () => {
    disposed = true;
    unsubscribe();
  };

  return page;
}
