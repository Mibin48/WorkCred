# WorkCred UI State Audit & Matrix

This document audits every screen, modal, and bottom sheet across WorkCred Phase A to verify that **Loading**, **Empty**, **Error**, **Offline**, and **Permission-Denied** states are handled consistently in adherence with the WorkCred Warm design tokens and principles.

---

## Screen & Sheet State Matrix

| Screen / Sheet Route | Component / Page File | Loading State | Empty State | Error / Validation State | Offline Behavior | Role / Permission Guard | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Landing Page (`/`)** | `frontend/index.html` | Static HTML | N/A | N/A | Cached by Service Worker shell | Public | **Done** |
| **Welcome (`/app/#/welcome`)** | `shared/welcome.js` | Instant boot screen | N/A | N/A | Cached shell | Public | **Done** |
| **Login (`/app/#/login`)** | `shared/login.js` | Button loading state (`wc-button--primary[aria-busy]`) | N/A | Inline phone validation error (`wc-form-error`) | Network error message on attempt | Unauthenticated | **Done** |
| **OTP Verification (`/app/#/otp`)** | `shared/otp.js` | Button loading state | N/A | `INVALID_OTP` / `OTP_EXPIRED` inline alert | Offline error on attempt | Phone session guard | **Done** |
| **Role Selection (`/app/#/role`)** | `shared/role.js` | Instant | N/A | N/A | Cached | Authenticated (new user) | **Done** |
| **Onboarding (`/app/#/onboarding`)** | `shared/onboarding.js` | Submit button loading state | N/A | Field validation errors | Requires online | Authenticated | **Done** |
| **Customer Find Workers (`/app/#/c/find`)** | `customer/find.js` | 4-row card Skeleton list | `EmptyState` ("No workers found nearby" + Clear filters) | `ErrorState` with Retry button | `OfflineBanner` + cached search results with `Saved copy` banner | Customer only | **Done** |
| **Customer Free Now List (`/app/#/c/free-now`)** | `customer/freeNow.js` | 3-row card Skeleton list | `EmptyState` ("No one is free nearby" + "Post a job") | `ErrorState` with Retry button | `OfflineBanner` + realtime radar listener | Customer only | **Done** |
| **Customer Worker Profile (`/app/#/c/worker/:id`)** | `customer/workerProfile.js` | 5-row profile Skeleton | N/A | `ErrorState` with Retry button | Cached profile | Customer only | **Done** |
| **Booking Bottom Sheet** | `customer.js` (`BookingSheet`) | Compass Skeleton loader | N/A | Inline `wc-form-error`, `ALREADY_BOOKED` handling | Submit disabled with offline notice | Customer only | **Done** |
| **Customer Post Job (`/app/#/c/post-job`)** | `customer/postJob.js` | Submit button loading | N/A | Form validation errors | Kept in form on offline error | Customer only | **Done** |
| **Customer Bookings (`/app/#/c/bookings`)** | `customer/bookings.js` | 3-row booking Skeleton | `EmptyState` ("No active bookings") | `ErrorState` with Retry | Cached list with `startCode`/`finishCode` stripped | Customer only | **Done** |
| **Customer Booking Detail (`/app/#/c/booking/:id`)** | `customer/bookingDetail.js` | Skeleton card | N/A | `ErrorState` with Retry | Live codes hidden, cached audit info | Customer & participant | **Done** |
| **Customer Saved (`/app/#/c/saved`)** | `customer/saved.js` | Skeleton list | `EmptyState` ("No saved workers yet") | `ErrorState` with Retry | Whitelisted cache fallback | Customer only | **Done** |
| **Customer Me Profile (`/app/#/c/me`)** | `shared/me.js` | Instant profile card | N/A | Profile update errors | Offline action queue list with Retry/Discard | Authenticated | **Done** |
| **Worker Home (`/app/#/w/home`)** | `worker/home.js` | Skeleton cards | `EmptyState` for requests & jobs | `ErrorState` with Retry | Free Now disabled with warning | Worker only | **Done** |
| **Worker My Work (`/app/#/w/work`)** | `worker/work.js` | Tab Skeleton loaders | `EmptyState` per tab (Today, Upcoming, History) | `ErrorState` with Retry | Whitelisted cached booking list | Worker only | **Done** |
| **Worker Booking Detail (`/app/#/w/booking/:id`)** | `worker/work.js` | Skeleton | N/A | `ErrorState` with Retry | Handshake buttons disabled offline | Worker & participant | **Done** |
| **Worker Passport Tab (`/app/#/w/passport`)** | `worker/passport.js` | Counter Skeleton loader | `EmptyState` with info on first job | `ErrorState` with Retry | Cached passport records + SHA-256 integrity check | Worker only | **Done** |
| **Worker Post Screen (`/app/#/w/post`)** | `worker/post.js` | Instant form + compression indicator | `EmptyState` ("No work posted yet") | Inline validation (140 max, phone/URL moderation) | "No internet" alert, form preserved | Worker only | **Done** |
| **Worker Me Settings (`/app/#/w/me`)** | `worker/me.js` | 5-row Skeleton loader | N/A | Inline field errors | App version, data saver notice | Worker only | **Done** |
| **Universal Community Feed (`/app/#/feed`)** | `shared/feed.js` | 4-row polymorphic Skeleton list | `EmptyState` ("No updates right now") | `ErrorState` with Retry | Whitelisted cache fallback + auto-pagination | Worker & Customer | **Done** |
| **Public Passport (`/p/:slug`)** | `public/passport.js` | Minimal header Skeleton | `EmptyState` for new workers | 60 req/min rate limit countdown overlay | Cached public proof view | Public / Unauthenticated | **Done** |
| **Shared Job Receipt (`/app/#/w/receipt/:id`, `/app/#/c/receipt/:id`)** | `shared/receipt.js` | Skeleton card | N/A | `ErrorState` with Retry | Cached receipt | Participant worker/customer | **Done** |

---

## State Audit Checklist & Findings
1. **Placeholders Removed**: All "Coming in Step N" placeholder tabs and routes (`/w/post`, `/c/free-now`, `/feed`) are completely replaced with working screens.
2. **Dev Inspector Isolation**: The inspector is completely hidden and excluded unless `?dev=1` is explicitly present in the query string.
3. **Offline Resilience**:
   - Safe actions (Save / Unsave, Follow / Unfollow) are safely queued with idempotency keys.
   - High-integrity actions (accepting jobs, entering handshake codes, starting Free Now, posting work) remain disabled offline with clear, polite guidance.
   - Whitelisted GET responses are cached in IndexedDB and served with a *"Saved copy"* indicator when offline.
   - Sensitive handshake codes (`startCode`, `finishCode`) are **never** persisted in IndexedDB or client caches.
