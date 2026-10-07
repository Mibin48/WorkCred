# WorkCred System Architecture & Design Specification

## 1. Overview

WorkCred is a mobile-first Progressive Web App (PWA) enabling daily-wage workers in India to build verified, tamper-proof proof-of-work histories and connect directly with nearby household and business customers with 0% platform commission cuts.

- **Brand Name**: WorkCred
- **Tagline**: Proof of work, work near you.
- **Core Values**: Dignity, transparent rates, tamper-proof handshakes, low-literacy accessibility.

## 2. Monorepo Structure

```text
workcred/
  frontend/                     # Client application (PWA, vanilla HTML/CSS/ESM)
    index.html                  # Landing page
    app.html                    # /app placeholder
    manifest.webmanifest        # PWA configuration
    css/
      tokens.css                # Approved 16 color tokens, typography scales, spacing
      base.css                  # Modern reset, fluid typography, accessibility
      components.css            # Reusable UI primitives (pill buttons, chips, cards, code-boxes)
      landing.css               # Landing section layouts & responsive rules
    js/
      landing.js                # Landing page controller & interactive components
      motion.js                 # Progressive motion system (IntersectionObserver / GSAP)
      vendor/                   # Local ESM dependencies (gsap, ScrollTrigger, lenis)
    assets/
      images/                   # Optimized WebP assets & placeholders
      icons/                    # Local SVG icons
  backend/                      # Express API (Phase B)
    README.md                   # Backend notes
    src/
      server.js
      app.js
      config/env.js
  shared/
    constants.js                # Shared constants, sample data, copy
  docs/
    SYSTEM_DESIGN.md            # System architecture document
  package.json
  README.md
```

## 3. Technology Stack

- **Frontend**: Plain HTML5, CSS3 (Vanilla custom properties, fluid `clamp()`, zero Tailwind/React), JavaScript (ES Modules).
- **Smooth Scroll & Animation**: GSAP + ScrollTrigger, Lenis (dynamically imported on desktop ≥768px; mobile uses lightweight IntersectionObserver + CSS transitions).
- **Backend (Phase B)**: Node.js 20 + Express. Static serving of `/frontend`, security headers via Helmet, compression, error handling, health check endpoint.
- **Database (Phase C)**: MongoDB.

## 4. Design Tokens & Visual Language

Strict color token palette:

- `--ink: #14171A;`
- `--ink-soft: #1F2428;`
- `--lime: #DFF84C;`
- `--lime-deep: #C8E12E;`
- `--paper: #F6F5EF;`
- `--surface: #FFFFFF;`
- `--sage: #E6EEE0;`
- `--green: #17794F;`
- `--green-tint: #DDF1E6;`
- `--blue: #2457C5;`
- `--blue-tint: #E3EBFA;`
- `--amber: #B76E00;`
- `--amber-tint: #FCEFD6;`
- `--red: #B3261E;`
- `--red-tint: #FBE4E2;`
- `--gray-600: #5B6168;`
- `--gray-300: #D9DBD3;`

Color balance: 60% Paper, 30% Ink, 10% Lime.
Zero hex codes are permitted anywhere in CSS outside `tokens.css`.
Typography: Display font Bricolage Grotesque (700-800), Body Inter (400-700). Fluid scaling using `clamp()`. Tabular figures (`tnum`) for monetary/code values.
Border-radius: 24px cards, 16px inputs, 9999px pill buttons. 1px hairline borders (`--gray-300`).
