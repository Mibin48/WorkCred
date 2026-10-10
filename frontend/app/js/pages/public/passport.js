/**
 * Public Work Passport Page (/p/:slug)
 * Unauthenticated, lightweight, fast-loading view of verified worker records.
 * Carries noindex, nofollow for Phase A MVP.
 */

import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { Avatar, Badge, Button, EmptyState, Skeleton } from '../../components/index.js';
import {
  AnimatedCounter,
  IntegrityStrip,
  TimelineEntry,
  EntryDetailSheet,
  VerificationExplainerSheet,
  ReportSheetModal,
} from '../../components/passport.js';
import { passportApi } from '../../api/passport.api.js';
import { reportsApi } from '../../api/reports.api.js';
import { store } from '../../store.js';
import { formatBookingDate, formatSkill, friendlyError } from '../../utils/format.js';

export function renderPublicPassport({ navigate, slug, toast }) {
  let worker = null;
  let entries = [];
  let integrity = { status: 'pending', totalRecords: 0, isValid: true, tamperedPos: null };
  let disposed = false;
  let isRateLimited = false;
  let rateLimitCountdown = 60;
  let countdownTimer = null;

  // Set robots meta
  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.name = 'robots';
    document.head.append(robotsMeta);
  }
  robotsMeta.content = 'noindex, nofollow';

  const root = h('div', { className: 'wc-public-passport-layout' });

  // Slim Public Header
  const header = h('header', { className: 'wc-public-header' },
    h('a', { href: '/', className: 'wc-public-brand' },
      h('img', { src: '/assets/workcred-mark.png', alt: '', width: 28, height: 28 }),
      h('span', {}, en.brand.name)
    ),
    h('a', { href: '/login', className: 'wc-public-login-link' }, 'Sign in')
  );

  const main = h('main', { className: 'wc-public-main' }, Skeleton({ rows: 5 }));

  // Public Footer
  const footer = h('footer', { className: 'wc-public-footer' },
    h('p', {}, en.publicPassport.verifiedRecordsHeading),
    h('a', { href: '/', className: 'wc-link' }, 'Learn about WorkCred')
  );

  root.append(header, main, footer);

  async function load() {
    try {
      // Parallel fetch: public profile & chain verification
      const [passportRes, verifyRes] = await Promise.all([
        passportApi.getPublicPassport(slug),
        passportApi.verifyPassport(slug).catch(() => null),
      ]);

      if (disposed) return;
      worker = passportRes.worker;
      entries = passportRes.passportEntries || [];

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

      document.title = en.publicPassport.title
        .replace('{name}', worker.name)
        .replace('{skill}', formatSkill(worker.mainSkill));

      render();
    } catch (err) {
      if (disposed) return;
      const status = err?.status || err?.details?.status;
      if (status === 429) {
        renderRateLimited(err?.details?.retryAfter || 60);
      } else if (status === 404) {
        renderNotFound();
      } else {
        renderError(err);
      }
    }
  }

  function renderRateLimited(sec = 60) {
    isRateLimited = true;
    rateLimitCountdown = sec;
    clearInterval(countdownTimer);

    const countdownText = h('strong', {}, String(rateLimitCountdown));
    const countdownMsg = h('p', { className: 'wc-lead' },
      en.publicPassport.rateLimitedBody.replace('{sec}', ''),
      countdownText,
      ' seconds.'
    );

    countdownTimer = setInterval(() => {
      rateLimitCountdown--;
      countdownText.textContent = String(Math.max(0, rateLimitCountdown));
      if (rateLimitCountdown <= 0) {
        clearInterval(countdownTimer);
        void load();
      }
    }, 1000);

    main.replaceChildren(
      EmptyState({
        title: en.publicPassport.rateLimitedTitle,
        body: countdownMsg.textContent,
        actionLabel: en.publicPassport.rateLimitRetry,
        onAction: () => void load(),
      })
    );
  }

  function renderNotFound() {
    main.replaceChildren(
      EmptyState({
        title: en.publicPassport.notFoundTitle,
        body: en.publicPassport.notFoundBody,
        actionLabel: 'Go to WorkCred Home',
        onAction: () => navigate('/'),
      })
    );
  }

  function renderError(err) {
    main.replaceChildren(
      EmptyState({
        title: en.errors.generic,
        body: friendlyError(err),
        actionLabel: 'Retry',
        onAction: () => void load(),
      })
    );
  }

  function render() {
    main.replaceChildren();

    if (worker.isDisabled) {
      main.append(
        EmptyState({
          title: en.publicPassport.privateNoticeTitle,
          body: en.publicPassport.privateNoticeBody,
        })
      );
      return;
    }

    // 1. Worker Hero Profile
    const hero = h('section', { className: 'wc-public-hero' },
      h('div', { className: 'wc-public-hero-head' },
        Avatar({ name: worker.name, photoUrl: worker.avatarUrl, size: 'large' }),
        h('div', { className: 'wc-public-hero-copy' },
          h('h1', { className: 'wc-public-name' }, worker.name),
          h('p', { className: 'wc-public-skill' }, `${formatSkill(worker.mainSkill)} • ${worker.area}, ${worker.city}`),
          h('div', { className: 'wc-public-badges' },
            Badge({ label: en.passport.verifiedPhoneBadge, variant: 'success', icon: '✓' })
          )
        )
      ),
      h('div', { className: 'wc-public-stats-grid' },
        h('div', { className: 'wc-stat-box' },
          AnimatedCounter({ value: worker.totalJobs || entries.length }),
          h('span', {}, en.passport.statsJobs)
        ),
        h('div', { className: 'wc-stat-box' },
          h('strong', {}, `${worker.rating}★`),
          h('span', {}, en.passport.statsRating)
        ),
        h('div', { className: 'wc-stat-box' },
          AnimatedCounter({ value: worker.totalHours || 0 }),
          h('span', {}, en.passport.statsHours)
        )
      )
    );

    // 2. Skill breakdown chips
    if (worker.topSkills && worker.topSkills.length > 0) {
      hero.append(
        h('div', { className: 'wc-public-top-skills' },
          h('span', { className: 'wc-label' }, `${en.passport.statsTopSkills}:`),
          h('div', { className: 'wc-skill-count-chips' },
            ...worker.topSkills.map((item) =>
              h('span', { className: 'wc-skill-count-chip' },
                h('strong', {}, formatSkill(item.skill)),
                h('small', {}, ` ×${item.count}`)
              )
            )
          )
        )
      );
    }

    // 3. Plain-English Integrity Strip
    const integrityStrip = IntegrityStrip({
      status: integrity.status,
      recordCount: integrity.totalRecords || entries.length,
      isTampered: !integrity.isValid,
      tamperedPos: integrity.tamperedPos,
      onRetry: () => void load(),
      onOpenExplainer: (e) => {
        VerificationExplainerSheet({ count: integrity.totalRecords || entries.length, trigger: e.currentTarget });
      },
    });

    // 4. Job Records Timeline (Visible Only)
    const timelineSection = h('section', { className: 'wc-public-timeline-section' });

    if (entries.length === 0) {
      timelineSection.append(
        EmptyState({
          title: en.publicPassport.newWorkerTitle,
          body: en.publicPassport.newWorkerBody,
        })
      );
    } else {
      timelineSection.append(h('h2', { className: 'wc-section-heading' }, en.publicPassport.verifiedRecordsHeading));

      if (worker.hiddenRecordsCount > 0) {
        timelineSection.append(
          h('p', { className: 'wc-hint wc-hidden-notice' },
            en.publicPassport.hiddenIncludedNotice.replace('{count}', String(worker.hiddenRecordsCount))
          )
        );
      }

      const list = h('ol', { className: 'wc-timeline-list' });
      for (const entry of entries) {
        const item = TimelineEntry({
          entry,
          isWorkerOwner: false,
          onOpenDetail: (e) => {
            EntryDetailSheet({ entry, isWorkerOwner: false, trigger: e?.currentTarget });
          },
        });
        list.append(item);
      }
      timelineSection.append(list);
    }

    // 5. Member Since Line & Report Link
    const metaBar = h('div', { className: 'wc-public-meta-bar' },
      h('span', {}, en.publicPassport.memberSince.replace('{date}', formatBookingDate(worker.memberSince || '2024-01-01'))),
      h('div', { className: 'wc-public-page-actions' },
        Button({
          label: en.publicPassport.sharePage,
          variant: 'ghost',
          icon: '🔗',
          onClick: () => {
            const url = window.location.href;
            if (navigator.share) {
              navigator.share({ title: document.title, url }).catch(() => {});
            } else {
              navigator.clipboard?.writeText?.(url);
              toast(en.passport.linkCopied, 'success');
            }
          },
        }),
        h('button', {
          type: 'button',
          className: 'wc-link-button wc-report-link',
          onClick: (e) => {
            ReportSheetModal({
              title: en.publicPassport.reportTitle,
              onSubmit: async (reportData) => {
                try {
                  await reportsApi.submitReport({
                    targetType: 'passport',
                    targetSlug: slug,
                    ...reportData,
                  });
                  toast(en.publicPassport.reportSubmitted, 'success');
                } catch {
                  toast(en.publicPassport.reportSubmitted, 'success');
                }
              },
              trigger: e.currentTarget,
            });
          },
        }, en.publicPassport.reportPage)
      )
    );

    // 6. Sticky Bottom CTA (Role & Session Aware)
    const session = store.get().session;
    const currentUser = session?.user;

    const stickyBar = h('div', { className: 'wc-public-sticky-cta' });
    if (currentUser?.role === 'worker') {
      stickyBar.append(h('p', { className: 'wc-worker-cant-book' }, en.publicPassport.workerCannotBook));
    } else {
      const bookBtn = Button({
        label: en.publicPassport.bookWorker.replace('{name}', worker.name.split(' ')[0]),
        variant: 'primary',
        className: 'wc-full',
        onClick: () => {
          if (currentUser?.role === 'customer') {
            navigate(`/c/worker/${worker.id}`);
          } else {
            sessionStorage.setItem('workcred.pendingRole', 'customer');
            navigate('/login', { returnTo: `/c/worker/${worker.id}` });
          }
        },
      });
      stickyBar.append(bookBtn);
    }

    main.append(hero, integrityStrip, timelineSection, metaBar, stickyBar);
  }

  void load();

  root.dispose = () => {
    disposed = true;
    clearInterval(countdownTimer);
  };

  return root;
}
