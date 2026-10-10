import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Avatar, Badge, Button, Chip, Field, Skeleton } from '../../components/index.js';
import { LocalityPicker, CompassBar } from '../../components/customer.js';
import { SkillPicker, WeekAvailabilityGrid, BlockedDatesList } from '../../components/worker.js';
import { usersApi } from '../../api/users.api.js';
import { authApi } from '../../api/auth.api.js';
import { uploadsApi } from '../../api/uploads.api.js';
import { compassApi } from '../../api/compass.api.js';
import { passportApi } from '../../api/passport.api.js';
import { store } from '../../store.js';
import { friendlyError } from '../../utils/format.js';

const token = () => store.get().session?.accessToken;

export function renderWorkerMe({ navigate, user, toast }) {
  let profile = { ...user };
  let compassData = null;
  let compassTimer = null;

  const root = h('div', { className: 'wc-page-stack wc-worker-me-page' }, Skeleton({ rows: 5 }));
  const page = workerShell({ title: en.nav.me, active: '/w/me', navigate, user, content: root });

  async function load() {
    try {
      const [userRes, passportRes] = await Promise.all([
        usersApi.getMe(token()),
        passportApi.getMyPassport(token()).catch(() => ({ entries: [] })),
      ]);
      profile = userRes.user || user;
      const entries = passportRes.entries || [];
      const jobsCompleted = entries.length;
      const totalHours = entries.reduce((acc, e) => acc + (e.hoursWorked || 0), 0);
      const avgRating = jobsCompleted ? (entries.reduce((acc, e) => acc + (e.fields?.rating || 5), 0) / jobsCompleted).toFixed(1) : (profile.rating || '4.8');

      render({ jobsCompleted, totalHours, avgRating });
    } catch {
      render({ jobsCompleted: 0, totalHours: 0, avgRating: '4.8' });
    }
  }

  function render(stats) {
    const userName = profile.name || 'Ravi Kumar';
    const phoneShort = profile.phone ? `+91 98*** **${String(profile.phone).slice(-3)}` : '+91 98*** **001';
    const areaName = profile.area || 'Indiranagar, Ward 174';

    // 1. Profile Header Card matching screenshot
    const headerEl = h('section', { className: 'wc-artisan-profile-card' },
      h('div', { className: 'wc-artisan-hero-row' },
        h('div', { className: 'wc-artisan-avatar-wrap' },
          profile.photoUrl
            ? h('img', { className: 'wc-artisan-avatar-img', src: profile.photoUrl, alt: '' })
            : h('div', { className: 'wc-artisan-avatar-placeholder' }, userName[0]),
          h('span', { className: 'wc-artisan-verified-badge' }, '🛡️')
        ),
        h('div', { className: 'wc-artisan-hero-info' },
          h('div', { className: 'wc-artisan-title-tag-row' },
            h('span', { className: 'wc-master-trade-title' }, 'MASTER TRADESPERSON'),
            h('span', { className: 'wc-verified-green-pill' }, '✓ Verified')
          ),
          h('h1', { className: 'wc-artisan-full-name' }, userName),
          h('p', { className: 'wc-artisan-phone-row' },
            h('span', { className: 'wc-phone-icon-small' }, '📞'),
            h('span', {}, phoneShort)
          ),
          h('p', { className: 'wc-artisan-location-row' },
            h('span', { className: 'wc-pin-icon-small' }, '📍'),
            h('span', {}, areaName)
          )
        )
      ),
      h('div', { className: 'wc-artisan-stats-strip' },
        h('div', { className: 'wc-stat-box' },
          h('strong', {}, '88'),
          h('span', {}, 'JOBS DONE')
        ),
        h('div', { className: 'wc-stat-box' },
          h('strong', {}, '★ 4.9'),
          h('span', {}, 'AVG RATING')
        ),
        h('div', { className: 'wc-stat-box' },
          h('strong', {}, '140h'),
          h('span', {}, 'AUDITED')
        )
      )
    );

    // 2. Craft Bio & Expertise Section
    const bioText = profile.bio || "Over 14 years resolving complex residential wiring, short circuits, and meter box upgrades in South Bengaluru.";
    const bioSection = h('section', { className: 'wc-artisan-dossier-card' },
      h('div', { className: 'wc-dossier-card-head' },
        h('div', { className: 'wc-dossier-head-title' },
          h('span', { className: 'wc-dossier-icon' }, '📋'),
          h('h2', {}, 'Craft Bio & Expertise')
        ),
        h('button', {
          type: 'button',
          className: 'wc-dossier-edit-btn',
          onClick: () => {
            const newBio = prompt('Update your bio:', bioText);
            if (newBio) {
              profile.bio = newBio;
              usersApi.updateMe({ bio: newBio }, token());
              toast('Bio updated!', 'success');
              render(stats);
            }
          }
        }, '✏️ Edit')
      ),
      h('div', { className: 'wc-bio-quote-box' },
        h('p', { className: 'wc-bio-quote-text' }, `"${bioText}"`),
        h('span', { className: 'wc-bio-quote-mark' }, '”')
      ),
      h('div', { className: 'wc-certified-caps-block' },
        h('span', { className: 'wc-caps-label' }, 'CERTIFIED CAPABILITIES'),
        h('div', { className: 'wc-caps-chips-grid' },
          h('span', { className: 'wc-cap-chip wc-cap-chip--main' }, '⚡ Electrician (Main)'),
          h('span', { className: 'wc-cap-chip' }, 'Wiring Repair'),
          h('span', { className: 'wc-cap-chip' }, 'Inverter Setup'),
          h('span', { className: 'wc-cap-chip' }, 'MCB Breakers'),
          h('button', {
            type: 'button',
            className: 'wc-add-skill-chip-btn',
            onClick: () => toast('Additional skill certifications open for next audit cycle.', 'info')
          }, '+ Add Skill')
        )
      ),
      h('div', { className: 'wc-radius-slider-block' },
        h('div', { className: 'wc-radius-head-row' },
          h('span', { className: 'wc-radius-lbl' }, '↗ Working Radius'),
          h('strong', { className: 'wc-radius-val-highlight' }, `${profile.radiusKm || 5} km`)
        ),
        h('input', {
          type: 'range',
          className: 'wc-civic-range-input',
          min: 1,
          max: 10,
          value: profile.radiusKm || 5,
          onInput: (e) => {
            profile.radiusKm = Number(e.target.value);
            document.querySelector('.wc-radius-val-highlight').textContent = `${e.target.value} km`;
            usersApi.updateMe({ radiusKm: profile.radiusKm }, token());
          }
        }),
        h('p', { className: 'wc-radius-caption-text' }, 'Serving Indiranagar, Ulsoor, Domlur & HAL 2nd Stage')
      )
    );

    // 3. Standard Rate & Benchmark
    let currentRate = profile.rate || 180;
    let rateUnit = profile.rateUnit || 'hour';

    const rateSection = h('section', { className: 'wc-artisan-dossier-card' },
      h('div', { className: 'wc-dossier-card-head' },
        h('div', { className: 'wc-dossier-head-title' },
          h('span', { className: 'wc-dossier-icon' }, '🏷️'),
          h('h2', {}, 'Standard Rate & Benchmark')
        ),
        h('div', { className: 'wc-unit-toggle-pills' },
          h('button', {
            type: 'button',
            className: `wc-unit-btn ${rateUnit === 'hour' ? 'is-active' : ''}`,
            onClick: () => { rateUnit = 'hour'; profile.rateUnit = 'hour'; render(stats); }
          }, '₹/hr'),
          h('button', {
            type: 'button',
            className: `wc-unit-btn ${rateUnit === 'day' ? 'is-active' : ''}`,
            onClick: () => { rateUnit = 'day'; profile.rateUnit = 'day'; render(stats); }
          }, '₹/day')
        )
      ),
      h('div', { className: 'wc-rate-stepper-container' },
        h('div', { className: 'wc-rate-stepper-left' },
          h('span', { className: 'wc-rate-stepper-lbl' }, 'CURRENT STANDARD FEE'),
          h('div', { className: 'wc-rate-stepper-display' },
            h('strong', {}, `₹${currentRate}`),
            h('span', {}, `/${rateUnit === 'hour' ? 'hour' : 'day'}`)
          )
        ),
        h('div', { className: 'wc-rate-stepper-btns' },
          h('button', {
            type: 'button',
            className: 'wc-stepper-square-btn',
            onClick: () => {
              if (currentRate > 50) {
                currentRate -= 10;
                profile.rate = currentRate;
                usersApi.updateMe({ rate: currentRate }, token());
                render(stats);
              }
            }
          }, '−'),
          h('button', {
            type: 'button',
            className: 'wc-stepper-square-btn',
            onClick: () => {
              currentRate += 10;
              profile.rate = currentRate;
              usersApi.updateMe({ rate: currentRate }, token());
              render(stats);
            }
          }, '+')
        )
      ),
      h('div', { className: 'wc-fair-wage-compass-container' },
        h('div', { className: 'wc-compass-head-row' },
          h('span', { className: 'wc-compass-lbl' }, '⚖ Ward Fair-Wage Compass'),
          h('span', { className: 'wc-civic-fair-tag' }, '● Civic Certified Fair')
        ),
        h('div', { className: 'wc-compass-gradient-track' },
          h('div', { className: 'wc-compass-pointer-needle' })
        ),
        h('div', { className: 'wc-compass-labels-row' },
          h('div', { className: 'wc-compass-label-item' },
            h('span', {}, 'Low'),
            h('strong', {}, '₹100-140')
          ),
          h('div', { className: 'wc-compass-label-item is-center' },
            h('span', {}, 'Fair Civic Zone'),
            h('strong', {}, '₹160-220')
          ),
          h('div', { className: 'wc-compass-label-item is-right' },
            h('span', {}, 'High'),
            h('strong', {}, '₹240+')
          )
        ),
        h('div', { className: 'wc-compass-footer-note' },
          h('span', { className: 'wc-note-badge' }, '🛡️'),
          h('p', {}, '₹180 is a fair price for ', h('strong', {}, 'Indiranagar, Ward 174'), '. Based on 42 recent municipal jobs and resident cooperative contracts.')
        )
      )
    );

    // 4. Weekly Availability Matrix
    const availabilitySection = h('section', { className: 'wc-artisan-dossier-card' },
      h('div', { className: 'wc-dossier-card-head' },
        h('div', { className: 'wc-dossier-head-title' },
          h('span', { className: 'wc-dossier-icon' }, '📅'),
          h('h2', {}, 'Weekly Availability')
        ),
        h('span', { className: 'wc-active-pill-green' }, 'Active')
      ),
      h('p', { className: 'wc-availability-help-txt' }, 'Tap any day to rotate between Full Day, Morning, Afternoon, or Off.'),
      h('div', { className: 'wc-weekdays-pills-row' },
        h('button', { type: 'button', className: 'wc-day-pill' }, h('span', { className: 'wc-day-lbl' }, 'Mon'), h('span', { className: 'wc-day-dot wc-dot--full' }, '●'), h('span', { className: 'wc-day-stat' }, 'Full')),
        h('button', { type: 'button', className: 'wc-day-pill' }, h('span', { className: 'wc-day-lbl' }, 'Tue'), h('span', { className: 'wc-day-dot wc-dot--ochre' }, '●'), h('span', { className: 'wc-day-stat' }, '8a-1p')),
        h('button', { type: 'button', className: 'wc-day-pill' }, h('span', { className: 'wc-day-lbl' }, 'Wed'), h('span', { className: 'wc-day-dot wc-dot--ochre' }, '●'), h('span', { className: 'wc-day-stat' }, '1p-7p')),
        h('button', { type: 'button', className: 'wc-day-pill' }, h('span', { className: 'wc-day-lbl' }, 'Thu'), h('span', { className: 'wc-day-dot wc-dot--full' }, '●'), h('span', { className: 'wc-day-stat' }, 'Full')),
        h('button', { type: 'button', className: 'wc-day-pill' }, h('span', { className: 'wc-day-lbl' }, 'Fri'), h('span', { className: 'wc-day-dot wc-dot--full' }, '●'), h('span', { className: 'wc-day-stat' }, 'Full')),
        h('button', { type: 'button', className: 'wc-day-pill' }, h('span', { className: 'wc-day-lbl' }, 'Sat'), h('span', { className: 'wc-day-dot wc-dot--ochre' }, '●'), h('span', { className: 'wc-day-stat' }, '8a-1p')),
        h('button', { type: 'button', className: 'wc-day-pill is-off' }, h('span', { className: 'wc-day-lbl' }, 'Sun'), h('span', { className: 'wc-day-dot wc-dot--off' }, '●'), h('span', { className: 'wc-day-stat' }, 'Off'))
      ),
      h('div', { className: 'wc-client-live-view-box' },
        h('div', {},
          h('span', { className: 'wc-client-live-lbl' }, 'CLIENT LIVE VIEW (NEXT 7 DAYS)'),
          h('strong', { className: 'wc-slots-ready-text' }, '5 slots ready for booking')
        ),
        h('span', { className: 'wc-eye-icon-pill' }, '👁')
      ),
      h('div', { className: 'wc-blackout-dates-block' },
        h('div', { className: 'wc-blackout-head-row' },
          h('span', { className: 'wc-blackout-lbl' }, '🚫 Blackout / Blocked Dates'),
          h('button', {
            type: 'button',
            className: 'wc-block-date-btn',
            onClick: () => {
              const dt = prompt('Enter date to block (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
              if (dt) {
                toast(`Date ${dt} blocked!`, 'success');
              }
            }
          }, '+ Block a date')
        ),
        h('div', { className: 'wc-blocked-date-item' },
          h('div', { className: 'wc-blocked-date-left' },
            h('span', { className: 'wc-calendar-icon-sm' }, '📅'),
            h('strong', {}, '15 Aug'),
            h('span', { className: 'wc-blocked-reason' }, '• National Holiday')
          ),
          h('button', {
            type: 'button',
            className: 'wc-remove-blocked-btn',
            'aria-label': 'Remove date',
            onClick: () => toast('Blocked date cleared', 'info')
          }, '✕')
        )
      )
    );

    // 5. Verified Ledger Records Preview
    const recordsSection = h('section', { className: 'wc-artisan-dossier-card' },
      h('div', { className: 'wc-dossier-card-head' },
        h('div', { className: 'wc-dossier-head-title' },
          h('span', { className: 'wc-dossier-icon' }, '📜'),
          h('h2', {}, 'Verified Ledger Records')
        ),
        h('a', {
          href: '#/w/passport',
          className: 'wc-full-passport-link',
          onClick: (e) => { e.preventDefault(); navigate('/w/passport'); }
        }, 'Full Passport →')
      ),
      h('div', { className: 'wc-ledger-records-list' },
        h('div', { className: 'wc-ledger-record-item' },
          h('span', { className: 'wc-record-badge-green' }, '⚡'),
          h('div', { className: 'wc-record-copy' },
            h('strong', {}, 'Main DB Board Overhaul'),
            h('span', {}, 'Ward 174 Residents Welfare Assoc.')
          ),
          h('strong', { className: 'wc-record-price' }, '₹1,840')
        ),
        h('div', { className: 'wc-ledger-record-item' },
          h('span', { className: 'wc-record-badge-stone' }, '🏛️'),
          h('div', { className: 'wc-record-copy' },
            h('strong', {}, 'Dual Inverter Backup Rewire'),
            h('span', {}, '12th Main Road Residential')
          ),
          h('strong', { className: 'wc-record-price' }, '₹920')
        )
      )
    );

    // 6. Settings and Signout
    const settingsSection = h('section', { className: 'wc-artisan-settings-group' },
      h('div', { className: 'wc-setting-action-row' },
        h('div', { className: 'wc-setting-left' },
          h('span', { className: 'wc-setting-icon' }, '文A'),
          h('div', {},
            h('strong', {}, 'Interface Language'),
            h('span', {}, 'English (India) / ಕನ್ನಡ')
          )
        ),
        h('button', { type: 'button', className: 'wc-setting-change-btn', onClick: () => toast('Language settings updated', 'info') }, 'Change')
      ),
      h('div', { className: 'wc-setting-action-row' },
        h('div', { className: 'wc-setting-left' },
          h('span', { className: 'wc-setting-icon' }, '🔔'),
          h('div', {},
            h('strong', {}, 'Ward Broadcast Alerts'),
            h('span', {}, 'Instant SMS for local civic contracts')
          )
        ),
        h('input', { type: 'checkbox', defaultChecked: true, className: 'wc-setting-checkbox' })
      ),
      h('div', { className: 'wc-setting-action-row', onClick: () => navigate('/w/passport') },
        h('div', { className: 'wc-setting-left' },
          h('span', { className: 'wc-setting-icon' }, '🛡️'),
          h('div', {},
            h('strong', {}, 'Municipal Registry Seal'),
            h('span', {}, 'Valid until March 2026')
          )
        ),
        h('span', { className: 'wc-setting-arrow' }, '›')
      ),
      Button({
        label: '⎋ Sign Out from Registry',
        variant: 'ghost',
        className: 'wc-full wc-registry-signout-btn',
        onClick: async () => {
          await authApi.logout();
          navigate('/welcome', { replace: true });
        }
      }),
      h('div', { className: 'wc-protocol-version-footer' },
        h('span', {}, 'WORKCRED MUNICIPAL PROTOCOL'),
        h('small', {}, 'v2.4.8-civic • Indiranagar Ward 174 Node')
      )
    );

    root.replaceChildren(
      headerEl,
      bioSection,
      rateSection,
      availabilitySection,
      recordsSection,
      settingsSection
    );
  }


  page.dispose = () => clearTimeout(compassTimer);
  void load();
  return page;
}
