/** Scroll reveals only activate after IntersectionObserver is confirmed usable. */
export function initMotion() {
  const elements = [...document.querySelectorAll('.fade-up')];
  const revealAll = () => elements.forEach((element) => element.classList.add('is-visible'));
  if (!elements.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { revealAll(); return; }
  if (!('IntersectionObserver' in window)) { revealAll(); return; }

  let observer;
  try {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  } catch { revealAll(); return; }

  document.documentElement.classList.add('has-reveal');
  const viewBottom = window.innerHeight;
  elements.forEach((element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.top < viewBottom && bounds.bottom > 0) element.classList.add('is-visible');
    else observer.observe(element);
  });
  window.setTimeout(() => {
    elements.forEach((element) => element.classList.add('is-visible'));
    observer.disconnect();
  }, 1500);
}
