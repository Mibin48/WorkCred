---
name: WorkCred Design System
colors:
  surface: '#faf9f3'
  surface-dim: '#dbdad4'
  surface-bright: '#faf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f4ee'
  surface-container: '#efeee8'
  surface-container-high: '#e9e8e2'
  surface-container-highest: '#e3e3dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#44474a'
  inverse-surface: '#30312d'
  inverse-on-surface: '#f2f1eb'
  outline: '#75777b'
  outline-variant: '#c5c6ca'
  surface-tint: '#5c5f62'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#191c1f'
  on-primary-container: '#828488'
  inverse-primary: '#c5c6ca'
  secondary: '#586400'
  on-secondary: '#ffffff'
  secondary-container: '#d6ef43'
  on-secondary-container: '#5d6b00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002112'
  on-tertiary-container: '#3a9467'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e2e6'
  primary-fixed-dim: '#c5c6ca'
  on-primary-fixed: '#191c1f'
  on-primary-fixed-variant: '#44474a'
  secondary-fixed: '#d6ef43'
  secondary-fixed-dim: '#bad225'
  on-secondary-fixed: '#191e00'
  on-secondary-fixed-variant: '#424b00'
  tertiary-fixed: '#9bf5c1'
  tertiary-fixed-dim: '#7fd9a6'
  on-tertiary-fixed: '#002112'
  on-tertiary-fixed-variant: '#005232'
  background: '#faf9f3'
  on-background: '#1b1c19'
  surface-variant: '#e3e3dd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for low-literacy Indian daily-wage workers and everyday customers who require an interface of unmistakable clarity, dignity, and immediate legibility. The aesthetic merges Neo-Fintech precision with the reassuring permanence of Modern Utility and Digital Public Service, wrapped in a grounded ethos of Warm Minimalism. 

The core philosophy balances two contrasting emotional states: **BOLD** in headlines and primary calls-to-action to eradicate functional ambiguity, and **CALM** across backgrounds and data containers to reduce visual fatigue and cognitive overload. Every surface must feel earned, transparent, and unshakeably secure. The experience shuns ephemeral visual gimmicks, faux luxury, and tech elitism, providing a robust, tactile digital utility that communicates authority, accessibility, and respect for every user's livelihood.

## Colors

The palette is strictly calibrated for maximum readability in direct outdoor sunlight, passing stringent WCAG AAA/AA contrast criteria (minimum 4.5:1 for body copy and 3:1 for large graphical elements).

- **Primary Dark (Ink / Ink Soft):** `#14171A` serves as the primary structural anchor for text, high-emphasis icons, and solid status headers. `#1F2428` acts as an offset for secondary structural elements and interactive borders.
- **Brand Accent (Lime Spark / Lime Deep):** `#DFF84C` is the primary interactive catalyst. It must **ALWAYS** be paired with `#14171A` text or iconography for contrast compliance; white text on lime is strictly prohibited. `#C8E12E` serves as the pressed/active state.
- **Canvas & Containers (Paper / Surface / Sage):** The foundational screen background uses `#F6F5EF` (Paper) to eliminate harsh white glare. `#FFFFFF` (Surface) is reserved for interactive cards, sheets, and elevated modules. `#E6EEE0` (Sage) serves as a subtle grouping background for ledger modules and receipt panels.
- **Functional Semantics (Signal & State):**
  - **Trust & Verification (Trust Green):** `#17794F` (Surface tint: `#DDF1E6`) signals verified credentials, completed daily payouts, and validated identity.
  - **Civic & Informational (Civic Blue):** `#2457C5` (Surface tint: `#E3EBFA`) indicates institutional records, bank accounts, and scheme linkages.
  - **Attention & Escrow (Amber):** `#B76E00` (Surface tint: `#FCEFD6`) denotes pending approvals, cash in escrow, or daily check-ins.
  - **Critical Alert (Alert Red):** `#B3261E` (Surface tint: `#FBE4E2`) highlights wage disputes, missing verification steps, or transaction failures.
- **Neutrals & Borders:** `#5B6168` (Gray 600) handles secondary metadata, timestamps, and placeholder copy. `#D9DBD3` (Gray 300) delivers crisp, unblurred boundary lines.

## Typography

The typographic hierarchy is built on extreme legibility and fast semantic scanning. Body text never drops below 16px (`1rem`) on mobile interfaces to ensure immediate comprehension under variable ambient lighting and across varied literacy levels.

- **Display & Headlines (Plus Jakarta Sans):** Set at weights 700 and 800 with tight, deliberate letter-spacing (`-0.01em` to `-0.03em`). This establishes an assertive, rock-solid editorial structure for monetary values, critical job stages, and verification statuses.
- **Body & Numerical Readouts (Inter):** Weights are constrained strictly to 400 (Regular) and 500 (Medium). Numerical values, transaction IDs, and daily wage balances require `font-feature-settings: "tnum" 1` (tabular figures) to ensure mathematical alignment across stacked tables and receipts.
- **Multi-Script Parity:** When rendering regional Indic scripts (such as Devanagari, Tamil, or Telugu), font metrics must scale base body line-height by an additional 15% to maintain optical balance and avoid diacritic clipping.

## Layout & Spacing

Layouts follow a rigorous 8pt spatial grid designed for single-hand mobile utility. Content is structured within a mobile-first fluid column model:

- **Breakpoints:**
  - **Mobile (< 640px):** 4-column fluid grid, 16px margins, 16px gutters. All primary action anchors pin to the bottom viewport with a persistent 48px to 56px touch footprint.
  - **Tablet (640px – 1024px):** 8-column grid, 32px margins, 24px gutters. Center-aligned card stacks constrained to a 560px reading max-width.
  - **Desktop (> 1024px):** 12-column grid, 48px margins, 32px gutters, with content canvases capped at 1120px to prevent horizontal eye strain.
- **Layout Model:** Vertical rhythm is driven strictly by multiples of 8px. Spacing between independent cards relies on `space-md` (16px), while component-internal vertical gaps default to `space-sm` (12px) and `space-xs` (8px). Bottom navigation and fixed CTA trays incorporate hardware-safe area insets (`env(safe-area-inset-bottom)` + 16px).

## Elevation & Depth

Visual hierarchy uses physical, tactile structure rather than diffuse, floating shadows:

- **Low-Contrast Outlines & Tonal Stacking:** Depth is conveyed by layering `#FFFFFF` (Surface) atop `#F6F5EF` (Paper), demarcated with a 1px solid border of `#D9DBD3` (Gray 300).
- **Shadow Direction:** Traditional diffuse blurs are eliminated to preserve performance across budget Android hardware and ensure clean edge clarity. When actionable cards require elevation on hover or press, use an offset shadow of `0 4px 0 0 #14171A` or a soft ambient drop of `0 2px 4px rgba(20, 23, 26, 0.06)`.
- **Modals & Drawers:** High-priority bottom sheets utilize a solid 20% `#14171A` backdrop scrim, bringing the sheet surface up with a 1px border along top and lateral edges.

## Shapes

The shape system combines rounded macro-surfaces with pill-shaped micro-actions:

- **Cards & Enclosures:** Large containers and transactional cards use `24px` corner radii (`rounded-2xl`). This softens data-dense records and imparts a welcoming, approachable character.
- **Interactive Controls (Inputs):** Form inputs, date selectors, and ledger dropdowns use a consistent `16px` radius (`rounded-xl`), creating visual continuity between form fields and containers.
- **Buttons, Badges & Chips:** All primary buttons, tag chips, and status pills are shaped with full pill curvature (`rounded-full` / `9999px`), clearly separating interactive calls-to-action from content modules.

## Components

### Buttons
- **Primary Action (CTA):** Full-pill shape (`border-radius: 9999px`), minimum height of 52px (always exceeding the 48px touch boundary). Fill is `#DFF84C` (Lime Spark) with text and leading/trailing icons rendered in `#14171A` (Ink) at weight 700. Pressed state transitions to `#C8E12E`.
- **Secondary Action:** Full-pill shape, minimum height of 52px. Background is transparent, bordered by a 2px solid stroke of `#14171A` with `#14171A` text.
- **Tertiary / Utility:** Flat `#E6EEE0` or `#F6F5EF` fill with `#14171A` text, 48px height, full-pill.

### Chips & Filter Pills
- Pill-shaped tags (`border-radius: 9999px`) with a minimum height of 48px for interactive filters, and 32px for passive status indicators.
- Inactive state: `#FFFFFF` fill with 1px border in `#D9DBD3` and `#5B6168` text.
- Active state: `#14171A` fill with `#FFFFFF` text or `#DFF84C` text for accented selections.

### Inputs & Form Controls
- **Text Inputs:** Height of 56px, `16px` border radius, `#FFFFFF` surface fill, and a 1.5px solid border in `#D9DBD3`. Label text is anchored at 14px weight 600 above the input. Filled text renders at 18px in `#14171A`. Active focus switches the stroke to a crisp 2px solid `#14171A` with zero outer glow.
- **Checkboxes & Radios:** Scaled to 24px × 24px with a minimum 48px invisible touch hit target. Border is 2px `#14171A`. Checked state uses `#14171A` fill with a high-contrast white tick mark.

### Cards & Ledger Blocks
- 24px border radius with a `#FFFFFF` fill and a 1px solid `#D9DBD3` border.
- Interior padding is fixed at 20px or 24px.
- Sections within cards are segmented using `#F6F5EF` backgrounds with zero additional shadow.

### List Items & Navigation Cards
- Interactive list tiles feature a 56px minimum row height.
- **List Arrow Element:** Every actionable navigation item incorporates a dedicated black circular arrow button on the right edge: a 36px × 36px circle filled with `#14171A`, housing an unclipped, right-pointing directional arrow in `#FFFFFF`. This provides an immediate, unmistakable signifier for page transit without requiring textual literacy.

### Audio-Assisted UI / Voice Prompts
- Given the low-literacy context, actionable modules may include a voice-prompt button: a 48px pill or circle in `#DFF84C` featuring a high-contrast `#14171A` speaker icon, announcing the card's contents in the user's localized dialect.