# WorkCred

> **"Proof of work, work near you."**  
> A mobile-first Progressive Web App (PWA) that empowers daily-wage workers across India to build verified, tamper-proof work histories and connect directly with local households and businesses with 0% platform commission cuts.

---

## 1. Quick Start

### Prerequisites
- Node.js 20+ (tested on Node.js 24)
- npm 10+

### Installation & Development
```bash
# Install dependencies & vendor local motion assets (GSAP, Lenis)
npm install

# Start local development server
npm run dev
# Or run headlessly:
npm run serve
```
The application will be live at **http://localhost:3000** (or `http://127.0.0.1:3000`).

### Additional Scripts
```bash
# Run ESLint across authored code
npm run lint

# Format code with Prettier
npm run format

# Re-copy ESM vendor distributions (GSAP, ScrollTrigger, Lenis)
npm run vendor
```

---

## 2. Monorepo Architecture

Following section 17 of `SYSTEM_DESIGN.md`:

```text
workcred/
├── backend/
│   └── README.md                 # "Built in Phase B" placeholder
├── frontend/
│   ├── index.html                # Accessible landing page (mobile-first 390px, tablet 768px, desktop 1280px)
│   ├── app.html                  # Coming-soon onboarding placeholder (/app?role=worker|customer)
│   ├── manifest.webmanifest      # PWA Web App Manifest
│   ├── css/
│   │   ├── tokens.css            # 16 approved color tokens, fluid clamp typography, 8pt spacing
│   │   ├── base.css              # Accessible reset, focus-visible styles, skip link
│   │   ├── components.css        # Pure CSS buttons, chips, cards, code-boxes, range bar
│   │   └── landing.css           # Section-specific layouts and responsive rules
│   ├── js/
│   │   ├── landing.js            # Page controller, preloader, interactive filter chips
│   │   ├── motion.js             # Progressive motion (IntersectionObserver on mobile; GSAP/Lenis on desktop)
│   │   └── vendor/               # Local ESM builds of GSAP, ScrollTrigger, Lenis (no CDN)
│   └── assets/
│       ├── icons/                # Local SVG icons and PWA maskable icons (192px, 512px)
│       └── images/               # Optimized SVG portraits and avatars
├── shared/
│   └── constants.js              # Shared brand strings, roles, and sample data dictionaries
├── docs/
│   └── SYSTEM_DESIGN.md          # Architecture and design specifications
├── scripts/
│   ├── generate-assets.js        # SVG avatar asset generator
│   └── vendor-copy.js            # Copies node_modules ESM builds into frontend/js/vendor
├── .env.example
├── .gitignore
├── eslint.config.js              # ESLint 9 configuration
├── .prettierrc
├── package.json
└── README.md
```

---

## 3. Strict Design Tokens (16 Colors Only)

The interface strictly adheres to the approved 16 custom properties. **No other hex, RGB, or HSL values are allowed anywhere in CSS.**

| Token | Hex Value | Semantic Usage |
| :--- | :--- | :--- |
| `--ink` | `#14171A` | Primary structural text, dark containers, high-emphasis icons (30% balance) |
| `--ink-soft` | `#1F2428` | Offset dark card fills and interactive borders |
| `--lime` | `#DFF84C` | Brand accent & primary interactive fill; always carries `--ink` text (10% balance) |
| `--lime-deep`| `#C8E12E` | Pressed / active state for lime elements |
| `--paper` | `#F6F5EF` | Foundational background canvas eliminating harsh screen glare (60% balance) |
| `--surface` | `#FFFFFF` | Interactive cards, modal sheets, elevated components |
| `--sage` | `#E6EEE0` | Soft grouping containers (Ledger modules, Public Rails) |
| `--green` | `#17794F` | Trust & verification signal (Completed payouts, verified hours) |
| `--green-tint` | `#DDF1E6` | Surface tint for verified tags and valid credentials |
| `--blue` | `#2457C5` | Civic & informational indicators (Institutional records, Aadhaar) |
| `--blue-tint` | `#E3EBFA` | Surface tint for civic and customer items |
| `--amber` | `#B76E00` | Attention & escrow status (Started jobs, pending codes) |
| `--amber-tint` | `#FCEFD6` | Surface tint for pending badges |
| `--red` | `#B3261E` | Critical alert / urgent job indicators |
| `--red-tint` | `#FBE4E2` | Surface tint for urgent tags |
| `--gray-600` | `#5B6168` | Secondary metadata, labels, and subtext (passes WCAG AA contrast) |
| `--gray-300` | `#D9DBD3` | 1px hairline boundary borders (eliminating diffuse blurs) |

---

## 4. Typography & Layout Rules

- **Display Font**: *Bricolage Grotesque* (Weights 700 and 800) for headlines and numerical badges.
- **Body Font**: *Inter* (Weights 400, 500, 600, 700). Minimum body copy size is 16px (`1rem`); labels minimum 13px.
- **Tabular Figures**: `font-variant-numeric: tabular-nums` applied via `.tnum` to lock alignment on currency (`₹500`), codes (`8429`), and job hours (`140`).
- **Touch Targets**: All interactive elements (buttons, chips, form inputs) exceed the 48px touch minimum.
- **Grid**: Strict 8pt spatial grid (`--space-xs: 8px` to `--space-3xl: 64px`).

---

## 5. Motion System & Accessibility

- **No-JS Baseline**: The entire landing page is 100% readable and functional with JavaScript disabled.
- **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by presenting immediate static layout without parallax or marquee.
- **Mobile (<768px)**: Uses native `IntersectionObserver` with CSS transitions (fade-up and cubic bezier ease). No heavy libraries or scroll-pinning.
- **Desktop (≥768px)**: Dynamically imports local `gsap`, `ScrollTrigger`, and `Lenis` smooth scroll (zero external CDNs).
- **Preloader**: Lightweight session-cached preloader completing in under 1.2s; dismissible via Escape key or Skip button.
