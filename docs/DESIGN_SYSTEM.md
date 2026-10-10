# WorkCred Warm design system

WorkCred Warm is the shared visual language for the landing page and the `/app` experience. `frontend/css/tokens.css` is the source of truth for color, type scale, spacing, shape, shadow, layer, and motion values. Component styles should use those tokens rather than adding one-off palette or type values.

## Tokens

| Group | Token | Value |
| --- | --- | --- |
| Brand | `--clay` | `#c85a32` |
| Brand | `--clay-dark` | `#9f3c16` |
| Brand | `--clay-text` | `#9f3c16` |
| Brand tint/border | `--clay-tint` / `--clay-border` | `#f9ece6` / `#eccdc0` |
| Brand soft accent | `--clay-light` | `#f0a27f` |
| Trust green | `--moss` / `--moss-light` | `#2a5a3b` / `#386848` |
| Trust green tint/border | `--moss-tint` / `--moss-border` | `#e2efe6` / `#b8dac2` |
| Trust green accent | `--moss-bright` | `#7ecf99` |
| Warm yellow | `--ochre` / `--ochre-tint` / `--ochre-border` | `#d49b35` / `#faf3e4` / `#f0deb4` |
| Ink | `--charcoal` / `--charcoal-soft` | `#23201e` / `#2d2724` |
| Text | `--stone` / `--stone-dark` / `--river` | `#5c544e` / `#514943` / `#8a7e74` |
| Surface | `--paper` / `--surface` | `#faf7f2` / `#ffffff` |
| Surface | `--linen` / `--cream` / `--cream-deep` / `--parchment` | `#f3efe6` / `#f4f0ea` / `#eee8df` / `#e9e2d5` |
| Border | `--border` / `--border-strong` | `#ddd5c5` / `#ccc3b3` |
| Status | `--success` / `--success-tint` | `#2a5a3b` / `#e2efe6` |
| Status | `--warning` / `--warning-tint` | `#815300` / `#faf3e4` |
| Status | `--error` / `--error-tint` | `#ba1a1a` / `#ffdad6` |
| Status | `--info` / `--info-tint` | `#365c70` / `#e8f0f2` |
| Font | `--font-serif` | Newsreader with Georgia fallback |
| Font | `--font-sans` | Plus Jakarta Sans with system fallback |
| Font | `--font-mono` | System monospace stack |
| Type | `--text-display` | `clamp(2.25rem, 4.5vw + 1rem, 3.5rem)` |
| Type | `--text-h1` | `clamp(1.875rem, 3vw + 0.8rem, 2.5rem)` |
| Type | `--text-h2` | `clamp(1.5rem, 2vw + 0.6rem, 1.75rem)` |
| Type | `--text-h3` | `clamp(1.125rem, 1.2vw + 0.5rem, 1.375rem)` |
| Type | `--text-h4`, `--text-body-xl` | `1.125rem` |
| Type | `--text-body`, `--text-body-lg` | `1rem` |
| Type | `--text-label`, `--text-caption` | `0.8125rem` (13px) |
| Spacing | `--space-2xs` through `--space-3xl` | `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`, `2.5rem`, `4rem` |
| Shape | `--radius-sm` through `--radius-pill` | `0.375rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `9999px` |
| Shape | `--radius-hero`, `--radius-feature`, `--radius-soft` | `3.625rem`, `2.875rem`, `1.375rem` |
| Motion | `--duration-fast/normal/slow/drawer` | `160ms / 320ms / 600ms / 220ms` |
| Motion | `--ease-spring` | `cubic-bezier(0.22, 1, 0.36, 1)` |

The full inventory also includes typography variants, 8px rhythm spacers, borders, shadows, and z-index layers in `tokens.css`. Semantic status pairs have been chosen for readable foreground/background combinations; never use a color by itself to communicate an error, verification state, or availability.

## Type and spacing

- Use Newsreader for expressive page headings and Plus Jakarta Sans for reading, forms, and controls. Use italics and terracotta sparingly to emphasize a phrase.
- Keep body text at least 16px and labels at least 13px. Use `--text-*` for every `font-size` declaration.
- Build vertical rhythm from the 8px spacing steps; 4px and 12px values are optical subdivisions only. Let long copy wrap instead of forcing fixed heights.
- Use the 48px minimum control height for primary taps and a visible focus ring for keyboard users.

## Components

- **Buttons:** pill silhouette; solid clay primary, warm outline secondary, transparent ghost, semantic red danger. Async actions expose disabled and busy states.
- **Inputs and fields:** persistent visible label, 48px control, warm surface, hairline border, hint and plain-language error below the field.
- **Chips:** pill controls with `aria-pressed`; selected state uses tint and text as well as color.
- **Cards:** warm surfaces and soft borders; use sparingly and vary layout in editorial sections.
- **Badges:** concise labels with distinct text and tint; “Sample profile” is required for illustrative names, ratings, jobs, and rates.
- **Tabs:** fixed floating pill navigation with icon and text; active state also uses `aria-current="page"`.
- **Feedback:** Toast uses a polite live region; Skeleton signals loading; EmptyState explains what belongs in the view; ErrorState includes a retry action; OfflineBanner announces connection state.
- **Dialogs:** native `dialog` for modal behavior, with a bottom-sheet shape on compact screens.
- **Customer discovery:** SearchField provides skill suggestions; WorkerCard presents profile, rating, approximate distance, rate, verification, availability, and save state; FilterSheet groups keyboard-operable skill, distance, rate, rating, and sort controls; RangeSlider exposes a labelled two-thumb price range.
- **Worker profile:** PassportPreview, IntegrityBadge, and LocalityPicker show public work history, hash-check status, and an approximate service area. Contact details remain hidden on profiles.
- **Booking and jobs:** DayTimePicker, Stepper, CompassBar, BookingCard, CodeDisplay, StatusTimeline, SegmentedTabs, and ConfirmSheet cover customer scheduling and job status. Booking codes start masked and reveal only on request.
- **Customer completion:** booking and finish sheets keep payment confirmation, ratings, optional notes, and error feedback in a single accessible flow.
- **Worker Free Now:** FreeNowCard handles idle chips (2h, 4h, 8h), active animated timer with countdown ring SVG, extend, stop, and offline warning states.
- **Worker Job & Booking Operations:** RequestCard, WorkerJobCard, StartCodeSheet (with optional geolocation and lockout protections), and ReportSheet for live problem escalations and customer dispute handling.
- **Worker Availability & Profile:** WeekAvailabilityGrid (morning, afternoon, evening matrix), BlockedDatesList, SkillPicker with primary skill indicator, and live CompassBar market rate feedback.
- **Work Passport & Verification:** PassportCard (Espresso theme hero with animated count-up and QR), IntegrityStrip (plain-English chain verification status), ChainVisual (4 linked check markers), VerificationExplainerSheet ("How we check" 3-step guide), TimelineEntry (with visibility/masking toggles and 8-character Record ID), EntryDetailSheet, and ReportSheetModal for incident logging.
- **Receipts & Handshake Polish:** ReceiptCard (cash payment summary, hours, rating, and Passport deep-link for both customer and worker), HelpSheet ("Having trouble?" 3 plain troubleshooting tips), and collapsible JobRecord evidence audit.
- **Feed & Work Posts:** WorkPostCard (Before/After side-by-side or single photo, 140-char caption, verified job badge, follow/save actions), FreeWorkerCard (live dot, remaining time countdown, direct booking trigger), and ImageViewerModal (accessible focus-trapped image zoom).
- **PWA & Offline Resilience:** InstallBanner (non-intrusive Add to Home Screen trigger), SavedCopyBanner (indicates offline cached data with timestamp), DataSaverNotice (respects `navigator.connection.saveData`), and SWUpdateToast for seamless updates without form interruption.
- **Print Stylesheet:** `css/print.css` for clean A6 ID-card passport and receipt printing without interactive chrome or navigation.


## Layout and accessibility

- The app is mobile-first at 390px. Above 600px, center the app in a phone-width surface over linen. Include safe-area inset padding for bottom tabs.
- Keep content readable at 200% zoom and allow room for translated strings that are 30% longer.
- Use semantic landmarks, associate every form control with a label, preserve keyboard operation, move focus to the page heading after route changes, and announce toast/status updates.
- Respect `prefers-reduced-motion`. Landing reveals are progressive enhancement: content is visible by default and is hidden only after a working observer is installed.
- Build DOM through safe element helpers and `textContent`; never insert user-provided text as HTML.

## Do / avoid

- **Do:** use the warm palette and hairline boundaries, keep real product claims factual, and mark illustrative profiles.
- **Do:** make small-screen screens feel intentional instead of scaling down desktop layouts.
- **Avoid:** adding hex colors or literal `font-size` values outside `tokens.css`, relying on color alone, fake metrics or testimonials, generic repeated card grids, and inline scripts/styles.

## Verification

Run `npm run lint:tokens` to find hex colors and literal font-size declarations outside the token file.
