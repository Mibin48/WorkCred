/**
 * WorkCred Landing Page Controller
 * Handles preloader, interactive filter chips, and motion initialization.
 */

import { initMotion } from './motion.js';

document.addEventListener('DOMContentLoaded', () => {
  setupPreloader();
  setupRadarFilter();
  initMotion();
});

/**
 * Preloader: Under 1.2s, skippable, runs once per session
 */
function setupPreloader() {
  const preloader = document.getElementById('preloader');
  const counterEl = document.getElementById('preloader-counter');
  const skipBtn = document.getElementById('preloader-skip-btn');

  if (!preloader) return;

  const hasVisited = sessionStorage.getItem('workcred_visited');
  if (hasVisited) {
    preloader.classList.add('is-hidden');
    return;
  }

  let count = 0;
  let isDismissed = false;

  function dismiss() {
    if (isDismissed) return;
    isDismissed = true;
    sessionStorage.setItem('workcred_visited', '1');
    preloader.classList.add('is-hidden');
  }

  // Counter loop: 00 to 100 over ~900ms
  const interval = setInterval(() => {
    count += 5;
    if (counterEl) {
      counterEl.textContent = count < 10 ? `0${count}` : `${Math.min(count, 100)}`;
    }
    if (count >= 100) {
      clearInterval(interval);
      setTimeout(dismiss, 150);
    }
  }, 45);

  // Esc key or Skip button
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      clearInterval(interval);
      dismiss();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearInterval(interval);
      dismiss();
    }
  });

  // Safety timeout: always dismiss by 1.2s
  setTimeout(() => {
    clearInterval(interval);
    dismiss();
  }, 1200);
}

/**
 * Radar Filter Chips Interaction
 */
function setupRadarFilter() {
  const chips = document.querySelectorAll(
    '[role="group"][aria-label="Available slot duration"] button'
  );
  chips.forEach((btn) => {
    btn.addEventListener('click', () => {
      chips.forEach((c) => {
        c.classList.remove('chip-dark');
        c.classList.add('chip-neutral');
        c.setAttribute('aria-pressed', 'false');
      });
      btn.classList.remove('chip-neutral');
      btn.classList.add('chip-dark');
      btn.setAttribute('aria-pressed', 'true');
    });
  });
}
