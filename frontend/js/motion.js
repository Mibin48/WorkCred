/**
 * WorkCred Progressive Motion System
 * - Below 768px: Lightweight IntersectionObserver + CSS transitions.
 * - 768px and up: Dynamically imports GSAP + ScrollTrigger and Lenis smooth scroll.
 * - Respects prefers-reduced-motion (instant static state).
 * - Animates only transform and opacity with cubic-bezier(0.22, 1, 0.36, 1).
 */

export async function initMotion() {
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isReduced) {
    document.querySelectorAll('.word-reveal').forEach((el) => {
      el.style.opacity = '1';
    });
    return;
  }

  const isDesktop = window.matchMedia('(min-width: 768px)').matches;

  if (!isDesktop) {
    initMobileMotion();
  } else {
    try {
      await initDesktopMotion();
    } catch (err) {
      console.warn('Desktop motion fallback to lightweight observer:', err);
      initMobileMotion();
    }
  }
}

/**
 * Mobile (<768px): IntersectionObserver + lightweight counter & fade
 */
function initMobileMotion() {
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.15,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');

        // Handle counter animations
        if (entry.target.hasAttribute('data-count')) {
          animateCounter(entry.target);
        }

        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe cards, step cards, and counter elements
  document.querySelectorAll('.card, .step-card, .passport-card, [data-count]').forEach((el) => {
    el.style.transition =
      'opacity 750ms cubic-bezier(0.22, 1, 0.36, 1), transform 750ms cubic-bezier(0.22, 1, 0.36, 1)';
    observer.observe(el);
  });

  // Simple sequential reveal for problem statement words
  const words = document.querySelectorAll('.word-reveal');
  const wordObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          words.forEach((w, idx) => {
            setTimeout(() => {
              w.style.opacity = '1';
            }, idx * 40);
          });
          wordObserver.disconnect();
        }
      });
    },
    { threshold: 0.2 }
  );

  const problemHeading = document.getElementById('problem-heading');
  if (problemHeading) {
    words.forEach((w) => {
      w.style.opacity = '0.2';
      w.style.transition = 'opacity 500ms ease';
    });
    wordObserver.observe(problemHeading);
  }
}

/**
 * Desktop (>=768px): GSAP + ScrollTrigger + Lenis
 */
async function initDesktopMotion() {
  // Dynamic imports of local ESM vendor files
  const { default: Lenis } = await import('./vendor/lenis.js');
  const { gsap } = await import('./vendor/gsap.js');
  const { ScrollTrigger } = await import('./vendor/ScrollTrigger.js');

  gsap.registerPlugin(ScrollTrigger);

  // Initialize Lenis Smooth Scroll
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // 1. Hero headline reveal & underline draw
  const heroHeading = document.querySelector('.hero-headline');
  const limeUnderline = document.querySelector('.underline-lime');
  if (heroHeading) {
    gsap.from(heroHeading, {
      opacity: 0,
      y: 28,
      duration: 0.85,
      ease: 'power3.out',
    });
  }
  if (limeUnderline) {
    gsap.from(limeUnderline, {
      scaleX: 0,
      transformOrigin: 'left center',
      duration: 0.9,
      delay: 0.3,
      ease: 'power3.out',
    });
  }

  // 2. Hero card stack parallax
  const heroCardStack = document.getElementById('hero-card-stack');
  if (heroCardStack) {
    window.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const xOffset = (clientX / window.innerWidth - 0.5) * 16;
      const yOffset = (clientY / window.innerHeight - 0.5) * 16;
      gsap.to(heroCardStack, {
        x: xOffset,
        y: yOffset,
        duration: 0.6,
        ease: 'power2.out',
      });
    });
  }

  // 3. Problem Statement Word-by-Word Scroll Opacity Reveal & Background ease
  const problemSection = document.getElementById('problem-section');
  const words = document.querySelectorAll('.word-reveal');
  if (problemSection && words.length > 0) {
    gsap.set(words, { opacity: 0.15 });

    ScrollTrigger.create({
      trigger: problemSection,
      start: 'top 70%',
      end: 'bottom 40%',
      scrub: 0.5,
      onUpdate: (self) => {
        const progress = self.progress;
        const totalWords = words.length;
        const activeCount = Math.floor(progress * totalWords);
        words.forEach((word, index) => {
          gsap.to(word, {
            opacity: index <= activeCount ? 1 : 0.2,
            duration: 0.1,
            overwrite: 'auto',
          });
        });
      },
    });
  }

  // 4. "How It Works" 4 Steps Pin & Highlight
  const steps = document.querySelectorAll('.step-card');
  steps.forEach((step, i) => {
    gsap.from(step, {
      scrollTrigger: {
        trigger: step,
        start: 'top 85%',
      },
      opacity: 0,
      y: 30,
      duration: 0.7,
      delay: i * 0.12,
      ease: 'power3.out',
    });
  });

  // 5. Work Passport Counter Animation
  const counters = document.querySelectorAll('[data-count]');
  counters.forEach((counter) => {
    ScrollTrigger.create({
      trigger: counter,
      start: 'top 85%',
      once: true,
      onEnter: () => animateCounter(counter),
    });
  });

  // 6. Bento Grid Staggered Entrance
  const bentoCards = document.querySelectorAll('.bento-grid > .card');
  if (bentoCards.length > 0) {
    gsap.from(bentoCards, {
      scrollTrigger: {
        trigger: '.bento-grid',
        start: 'top 80%',
      },
      opacity: 0,
      y: 40,
      stagger: 0.15,
      duration: 0.8,
      ease: 'power3.out',
    });
  }

  // 7. Respect Columns Entrance
  const respectCols = document.querySelectorAll('.respect-col');
  if (respectCols.length > 0) {
    gsap.from(respectCols, {
      scrollTrigger: {
        trigger: '.respect-grid',
        start: 'top 80%',
      },
      opacity: 0,
      y: 35,
      stagger: 0.2,
      duration: 0.8,
      ease: 'power3.out',
    });
  }

  // 8. Final CTA Card Entrance
  const ctaCard = document.querySelector('.cta-card');
  if (ctaCard) {
    gsap.from(ctaCard, {
      scrollTrigger: {
        trigger: ctaCard,
        start: 'top 85%',
      },
      opacity: 0,
      scale: 0.96,
      duration: 0.85,
      ease: 'power3.out',
    });
  }
}

/**
 * Numerical counter animation for stat boxes
 */
function animateCounter(el) {
  const target = parseFloat(el.getAttribute('data-count') || '0');
  if (isNaN(target)) return;

  const duration = 1200;
  const start = 0;
  const startTime = performance.now();

  function updateCount(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // cubic ease out
    const current = Math.floor(start + (target - start) * easeProgress);

    if (el.textContent.includes('%')) {
      el.textContent = `${current}%`;
    } else {
      el.textContent = current.toString();
    }

    if (progress < 1) {
      requestAnimationFrame(updateCount);
    } else {
      if (el.textContent.includes('%')) {
        el.textContent = `${target}%`;
      } else {
        el.textContent = target.toString();
      }
    }
  }

  requestAnimationFrame(updateCount);
}
