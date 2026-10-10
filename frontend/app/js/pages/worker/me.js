import { h } from '../../utils/dom.js';
import { en } from '../../i18n/en.js';
import { workerShell } from '../../layouts/workerShell.js';
import { Avatar, Badge, Button, Field, Skeleton } from '../../components/index.js';
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
    // 1. Profile Header
    const headerEl = h('section', { className: 'wc-profile-header-card' },
      h('div', { className: 'wc-profile-header-main' },
        profile.photoUrl ? h('img', { className: 'wc-avatar wc-avatar-photo', src: profile.photoUrl, alt: '' }) : Avatar({ name: profile.name }),
        h('div', { className: 'wc-profile-header-info' },
          h('h2', {}, profile.name || 'Worker'),
          h('p', { className: 'wc-profile-meta' },
            Badge({ label: `✓ ${en.profile.phone}`, kind: 'success' }),
            h('span', {}, `+91 ••••••${String(profile.phone || '0000').slice(-4)}`)
          ),
          h('p', { className: 'wc-hint' }, `📍 ${profile.area || 'Pune'}, ${profile.city || 'Pune'}`)
        )
      ),
      h('div', { className: 'wc-profile-stats' },
        h('div', {}, h('strong', {}, String(stats.jobsCompleted)), h('span', {}, en.workerProfile.jobsLabel)),
        h('div', {}, h('strong', {}, `${stats.avgRating}★`), h('span', {}, en.workerProfile.ratingLabel)),
        h('div', {}, h('strong', {}, String(stats.totalHours)), h('span', {}, en.workerProfile.hoursLabel))
      )
    );

    // 2. Photo Upload Picker
    const photoFileEl = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', className: 'wc-visually-hidden' });
    const photoBtn = Button({
      label: `📷 ${en.worker.photoUploadBtn}`,
      variant: 'outline',
      onClick: () => photoFileEl.click()
    });
    photoFileEl.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      photoBtn.disabled = true;
      photoBtn.textContent = en.worker.photoUploading;
      try {
        const compressed = await uploadsApi.uploadImage(file);
        profile.photoUrl = compressed.dataUrl;
        await usersApi.updateMe({ photoUrl: compressed.dataUrl }, token());
        toast('Profile photo updated!', 'success');
        render(stats);
      } catch (err) {
        toast(err.message || en.errors.generic, 'error');
        photoBtn.disabled = false;
        photoBtn.textContent = `📷 ${en.worker.photoUploadBtn}`;
      }
    });

    const photoSection = h('section', { className: 'wc-profile-section' },
      h('h2', {}, en.worker.photoUploadTitle),
      h('div', { className: 'wc-photo-upload-row' },
        profile.photoUrl ? h('img', { className: 'wc-photo-preview', src: profile.photoUrl, alt: '' }) : null,
        photoBtn,
        photoFileEl
      )
    );

    // 3. Edit Basic Info
    const nameField = Field({ id: 'worker-name', label: en.onboarding.name, value: profile.name || '', required: true });
    const bioField = h('div', { className: 'wc-field' },
      h('label', { className: 'wc-label', for: 'worker-bio' }, 'About you (Bio)'),
      h('textarea', { id: 'worker-bio', className: 'wc-input wc-textarea', maxlength: 200, placeholder: 'Tell customers about your skills and experience…' })
    );
    bioField.querySelector('textarea').value = profile.bio || '';

    const areaBtn = Button({
      label: `📍 ${profile.area || 'Pune'} ⌄`,
      variant: 'outline',
      onClick: (e) => LocalityPicker({
        value: profile.area || 'Pune',
        trigger: e.currentTarget,
        onSelect: (newArea) => {
          profile.area = newArea;
          e.currentTarget.textContent = `📍 ${newArea} ⌄`;
        }
      })
    });

    const radiusInput = h('input', { type: 'range', min: 1, max: 10, value: profile.radiusKm || 5 });
    const radiusVal = h('output', { className: 'wc-range-value' }, `${profile.radiusKm || 5} km`);
    radiusInput.addEventListener('input', (e) => {
      profile.radiusKm = Number(e.target.value);
      radiusVal.textContent = `${e.target.value} km`;
    });

    const saveBasicBtn = Button({
      label: en.common.save,
      className: 'wc-full',
      onClick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const updates = {
            name: nameField.querySelector('input').value.trim(),
            bio: bioField.querySelector('textarea').value.trim(),
            area: profile.area,
            radiusKm: profile.radiusKm,
          };
          await usersApi.updateMe(updates, token());
          toast(en.profile.saved, 'success');
        } catch (err) {
          toast(friendlyError(err), 'error');
        } finally {
          e.currentTarget.disabled = false;
        }
      }
    });

    const basicSection = h('section', { className: 'wc-profile-section' },
      h('h2', {}, 'Basic Details'),
      nameField,
      bioField,
      h('div', { className: 'wc-field' }, h('span', { className: 'wc-label' }, 'Your locality'), areaBtn),
      h('div', { className: 'wc-range-field' },
        h('span', { className: 'wc-label' }, en.worker.searchRadiusLabel.replace('{km}', String(profile.radiusKm || 5))),
        radiusInput,
        radiusVal
      ),
      saveBasicBtn
    );

    // 4. Skills & Main Skill Picker
    const skillPicker = SkillPicker({
      skills: profile.skills || ['helper'],
      mainSkill: profile.mainSkill || profile.skills?.[0] || 'helper',
      onChange: async ({ skills, mainSkill }) => {
        profile.skills = skills;
        profile.mainSkill = mainSkill;
        try {
          await usersApi.updateMe({ skills, mainSkill }, token());
          toast('Skills updated.', 'success');
          scheduleCompass();
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      }
    });

    const skillsSection = h('section', { className: 'wc-profile-section' },
      h('h2', {}, 'Your Skills (Select up to 6)'),
      skillPicker
    );

    // 5. Rate Editor with Live Compass Feedback
    let rateUnit = profile.rateUnit || 'day';
    const rateInput = h('input', { type: 'number', className: 'wc-input', min: 50, max: 5000, value: profile.rate || (rateUnit === 'day' ? 550 : 70) });
    const unitHourChip = Chip({ label: 'Per hour (₹/hr)', selected: rateUnit === 'hour', onClick: () => setRateUnit('hour') });
    const unitDayChip = Chip({ label: 'Per day (8 hrs)', selected: rateUnit === 'day', onClick: () => setRateUnit('day') });
    const compassWrap = h('div', { className: 'wc-compass-wrap' });
    const compassFeedback = h('p', { className: 'wc-hint' });

    function setRateUnit(u) {
      rateUnit = u;
      unitHourChip.classList.toggle('is-selected', u === 'hour');
      unitDayChip.classList.toggle('is-selected', u === 'day');
      scheduleCompass();
    }

    function scheduleCompass() {
      clearTimeout(compassTimer);
      compassTimer = setTimeout(async () => {
        const rate = Number(rateInput.value) || 500;
        const mainSkill = profile.mainSkill || profile.skills?.[0] || 'helper';
        try {
          const res = await compassApi.getCompass({
            skill: mainSkill,
            area: profile.area || 'Pune',
            city: profile.city || 'Pune',
            rate,
            rateUnit
          });
          compassData = res;
          compassWrap.replaceChildren(CompassBar({ data: res, rate }));
          const verdict = res.verdict?.level || res.verdict || 'fair';
          compassFeedback.textContent = verdict === 'low'
            ? en.worker.rateCompassLow
            : verdict === 'high'
            ? en.worker.rateCompassHigh
            : en.worker.rateCompassFair;
        } catch {
          compassWrap.replaceChildren();
        }
      }, 300);
    }

    rateInput.addEventListener('input', scheduleCompass);

    const saveRateBtn = Button({
      label: 'Save Rates',
      className: 'wc-full',
      onClick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await usersApi.updateMe({
            rate: Number(rateInput.value),
            rateUnit
          }, token());
          toast('Rates saved successfully!', 'success');
        } catch (err) {
          toast(friendlyError(err), 'error');
        } finally {
          e.currentTarget.disabled = false;
        }
      }
    });

    const ratesSection = h('section', { className: 'wc-profile-section' },
      h('h2', {}, en.worker.editRateTitle),
      h('div', { className: 'wc-chip-group', role: 'group', 'aria-label': 'Rate unit' }, unitDayChip, unitHourChip),
      h('div', { className: 'wc-field' }, h('span', { className: 'wc-label' }, 'Your rate (₹)'), rateInput),
      compassWrap,
      compassFeedback,
      saveRateBtn
    );

    scheduleCompass();

    // 6. Availability Calendar & Blocked Dates
    const calendarGrid = WeekAvailabilityGrid({
      value: profile.calendar || { monday: 'full', tuesday: 'full', wednesday: 'full', thursday: 'full', friday: 'full', saturday: 'full', sunday: 'off' },
      onChange: async (newCal) => {
        profile.calendar = newCal;
        try {
          await usersApi.updateMe({ calendar: newCal }, token());
          toast('Weekly availability updated.', 'success');
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      }
    });

    const blockedDatesMgr = BlockedDatesList({
      dates: profile.blockedDates || [],
      onAdd: async (dateStr) => {
        const nextDates = [...(profile.blockedDates || []), dateStr];
        profile.blockedDates = nextDates;
        await usersApi.updateMe({ blockedDates: nextDates }, token());
        toast(`Blocked ${dateStr}`, 'success');
        render(stats);
      },
      onRemove: async (dateStr) => {
        const nextDates = (profile.blockedDates || []).filter((d) => d !== dateStr);
        profile.blockedDates = nextDates;
        await usersApi.updateMe({ blockedDates: nextDates }, token());
        toast(`Unblocked ${dateStr}`, 'info');
        render(stats);
      }
    });

    const availabilitySection = h('section', { className: 'wc-profile-section' },
      h('h2', {}, en.worker.availabilityTitle),
      calendarGrid,
      h('h3', { className: 'wc-section-subtitle' }, en.worker.blockDateTitle),
      blockedDatesMgr
    );

    // 7. Account Actions
    const logoutBtn = Button({
      label: en.profile.logout,
      variant: 'outline',
      className: 'wc-full',
      onClick: async () => {
        await authApi.logout();
        navigate('/welcome', { replace: true });
      }
    });

    // Data saver line
    const isDataSaver = navigator.connection?.saveData === true;
    const dataSaverNotice = isDataSaver ? h('p', { className: 'wc-data-saver-line' }, `⚡ ${en.offlineData.dataSaverOn}`) : null;

    const accountSection = h('section', { className: 'wc-profile-section' },
      h('h2', {}, 'Account'),
      dataSaverNotice,
      h('p', { className: 'wc-hint' }, `Language: English (${en.worker.moreLanguagesComing})`),
      h('p', { className: 'wc-hint' }, en.worker.deleteAccountComing),
      h('p', { className: 'wc-hint' }, en.offlineData.appVersion.replace('{version}', '1.0.0-phase-a')),
      logoutBtn
    );


    root.replaceChildren(
      headerEl,
      photoSection,
      basicSection,
      skillsSection,
      ratesSection,
      availabilitySection,
      accountSection
    );
  }

  page.dispose = () => clearTimeout(compassTimer);
  void load();
  return page;
}
