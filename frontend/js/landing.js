import { initMotion } from './motion.js';

document.documentElement.classList.add('has-js');
const initialize = () => {
  setupPreloader();
  setupRadarFilter();
  setupNavigation();
  initMotion();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();

function setupPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  const hide = () => preloader.classList.add('is-hidden');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { hide(); return; }
  if (sessionStorage.getItem('workcred_visited')) { hide(); return; }
  let count = 0;
  const counter = document.getElementById('preloader-counter');
  const timer = setInterval(() => {
    count = Math.min(100, count + 11);
    if (counter) counter.textContent = String(count).padStart(2, '0');
    if (count === 100) clearInterval(timer);
  }, 60);
  const finish = () => {
    clearInterval(timer);
    sessionStorage.setItem('workcred_visited', '1');
    hide();
  };
  document.getElementById('preloader-skip')?.addEventListener('click', finish, { once: true });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(); }, { once: true });
  window.setTimeout(finish, 750);
}

function setupRadarFilter() {
  const chips = document.querySelectorAll('[role="group"][aria-label="Available slot duration"] button');
  chips.forEach((button) => button.addEventListener('click', () => {
    chips.forEach((chip) => { chip.classList.remove('chip-dark'); chip.classList.add('chip-neutral'); chip.setAttribute('aria-pressed', 'false'); });
    button.classList.remove('chip-neutral'); button.classList.add('chip-dark'); button.setAttribute('aria-pressed', 'true');
  }));
}

function setupNavigation() {
  const toggle = document.getElementById('mobile-nav-toggle');
  const panel = document.getElementById('mobile-navigation');
  if (!toggle || !panel) return;
  const links = panel.querySelectorAll('a');
  const setOpen = (open, restoreFocus = true) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    panel.setAttribute('aria-hidden', String(!open));
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    if (open) links[0]?.focus(); else if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (event) => { if (event.target === panel) setOpen(false); });
  links.forEach((link) => link.addEventListener('click', () => setOpen(false, false)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setOpen(false); });
  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => { if (event.matches && toggle.getAttribute('aria-expanded') === 'true') setOpen(false, false); });
  const join = document.getElementById('nav-join');
  const hero = document.querySelector('.hero-section');
  if (join && hero && 'IntersectionObserver' in window) {
    try {
      const observer = new IntersectionObserver(([entry]) => join.classList.toggle('is-visible', !entry.isIntersecting));
      observer.observe(hero);
    } catch { /* Keep the join action visible if observation is unavailable. */ }
  }
}
