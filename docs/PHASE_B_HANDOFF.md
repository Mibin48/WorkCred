# Phase B Handoff Specification (WorkCred Backend)

This document specifies the complete backend requirements, database schemas, business rules, cryptographic ledger protocols, indexes, events, and API contracts necessary to implement **WorkCred Phase B** (production backend) replacing the Phase A mock API.

---

## 1. Core Architecture & Modules

The backend implementation must directly integrate and utilize the shared business logic modules defined in [`/shared`](file:///d:/WorkCred/shared):
- [`shared/constants.js`](file:///d:/WorkCred/shared/constants.js): Skills list, limits, rate units, booking status enum.
- [`shared/errors.js`](file:///d:/WorkCred/shared/errors.js): Standardized `AppError` error codes, HTTP statuses, and JSON envelope schemas.
- [`shared/geo.js`](file:///d:/WorkCred/shared/geo.js): Haversine distance calculations, 0.05-degree locality cell grids.
- [`shared/hash.js`](file:///d:/WorkCred/shared/hash.js): Canonical JSON sorting, SHA-256 hash chaining, and ledger verification.
- [`shared/stateMachine.js`](file:///d:/WorkCred/shared/stateMachine.js): Formal transition rules for job bookings (`pending -> confirmed -> in_progress -> completed / cancelled / no_show`).
- [`shared/validators.js`](file:///d:/WorkCred/shared/validators.js): Payload schemas for auth, jobs, bookings, handshakes, passport privacy, and posts.
- [`shared/compass.js`](file:///d:/WorkCred/shared/compass.js): Localized wage quartiles and fair-rate calculations.

---

## 2. API Contract Endpoints

All responses must adhere to the standard envelope:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable confirmation"
}
```
Failures:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | RATE_LIMITED | ALREADY_BOOKED | DUPLICATE_ENDORSEMENT | SERVER_ERROR",
    "message": "Plain-English description",
    "details": []
  }
}
```

### 2.1 Auth & User Sessions
- `POST /auth/otp/request`: `{ phone: "9000000001" }`. Rate-limit: 5 OTPs / hour per phone.
- `POST /auth/otp/verify`: `{ phone: "9000000001", code: "123456" }`. Returns `{ user, accessToken, refreshToken }`.
- `POST /auth/refresh`: `{ refreshToken }`. Returns `{ accessToken }`.
- `POST /auth/logout`: Revokes refresh token.
- `GET /users/me`: Current session user.
- `PATCH /users/me`: Updates profile fields (`name`, `bio`, `skills`, `mainSkill`, `rate`, `rateUnit`, `area`, `city`, `radiusKm`, `calendar`, `blockedDates`, `photoUrl`, `defaultMaskEmployer`).

### 2.2 Workers Discovery & Compass
- `GET /workers`: Query params: `q`, `skills`, `area`, `lat`, `lng`, `radiusKm`, `minRate`, `maxRate`, `minRating`, `sortBy`, `cursor`, `limit`. Never reveals worker phone or exact coordinates.
- `GET /workers/:id`: Full profile, stats, up to 3 masked passport entries, busy windows. Phone omitted.
- `GET /compass`: `skill`, `area`, `city`, `rate`, `rateUnit`. Returns wage percentiles (`p25`, `median`, `p75`) and verdict.

### 2.3 Free Now / Radar
- `POST /availability`: Worker sets Free Now window (`{ hours: 2|4|8, lat, lng }`). Emits `radar:worker_free`.
- `DELETE /availability`: Worker cancels Free Now. Emits `radar:worker_busy`.
- `GET /availability/status`: Worker's active status.
- `GET /availability/nearby`: Customer query with `lat`, `lng`, `radiusKm`, `skill`. Filters active windows and sorts by distance.

### 2.4 Bookings & Double Handshake Protocol
- `POST /bookings`: Direct or Free Now booking (`{ workerId, source: "direct"|"freenow", skill, rate, rateUnit, scheduledAt, hours, note }`). Supports `Idempotency-Key`. Generates random 4-digit `startCode` and `finishCode` visible only to customer.
- `GET /bookings`: Customer or worker booking list.
- `GET /bookings/:id`: Booking details. Handshake codes only returned to customer. Worker phone only revealed on `confirmed` or `in_progress`.
- `POST /bookings/:id/confirm`: Worker accepts request.
- `POST /bookings/:id/decline`: Worker declines.
- `POST /bookings/:id/start`: Worker inputs 4-digit `startCode` and GPS `{ lat, lng }`. Rate-limited to 5 attempts before locking (`RATE_LIMITED`).
- `POST /bookings/:id/finish`: Customer inputs 4-digit `finishCode`, `paidCash: true`, and integer rating `1..5`. Automatically appends block to worker's SHA-256 Work Passport ledger.
- `POST /bookings/:id/cancel`: Customer/worker cancels pending or confirmed booking.
- `POST /bookings/:id/report`: Incident reporting on booking.

### 2.5 Work Passport & Cryptographic Ledger
- `GET /passport/:slug`: Public or authenticated ledger. Masks employer names by default (`R*** K.`) and excludes entries with `visibility: "hidden"` for non-owners. Rate-limited to 60 req/min.
- `GET /passport/:slug/verify`: Unauthenticated full chain audit. Calculates sequential SHA-256 hashes from genesis. Returns `{ valid: boolean, verifiedCount: number, firstEntryDate, lastEntryDate, brokenAtId? }`.
- `GET /passport/:slug/qr`: SVG QR code for public passport URL.
- `PATCH /passport/entries/:id`: Worker updates privacy flags (`{ visibility: "visible"|"hidden", isMasked: boolean }`).
- `GET /receipts/:bookingId`: Returns complete job receipt and ledger audit record.

### 2.6 Community Feed & Work Posts
- `GET /feed`: Polymorphic cursor-paginated stream (`post`, `open_job`, `free_now`). Filter: `all`, `posts`, `jobs`, `freenow`.
- `POST /posts`: Worker posts portfolio update (`{ skill, caption, afterPhotoUrl, beforePhotoUrl?, linkedBookingId? }`). Moderation: max 140 chars, rejects phone numbers and URLs. Linked booking must be a completed job of the worker. Supports `Idempotency-Key`.
- `DELETE /posts/:id`: Deletes post (owner-only, 403 otherwise).
- `GET /posts/mine`: Worker's posts.
- `POST /follows`: Toggle save/follow (`{ toUserId, type: "save"|"follow" }`).
- `GET /follows`: List of saved/followed workers.
- `POST /reports`: Incident & safety reports (`{ targetType: "passport"|"worker"|"post"|"booking", targetId, reason, details }`).

---

## 3. Database Indexes & Performance Requirements

1. **`users` Collection**:
   - `passportSlug`: Unique index (`{ passportSlug: 1 }`).
   - `phone`: Unique index (`{ phone: 1 }`).
   - `role + area`: Compound index for search (`{ role: 1, area: 1 }`).
   - `location`: 2dsphere geospatial index for spatial queries (`{ "location.coordinates": "2dsphere" }`).

2. **`passport_entries` Collection**:
   - `workerId + seq`: Unique compound index (`{ workerId: 1, seq: 1 }`).
   - `hash`: Index for integrity verification (`{ hash: 1 }`).

3. **`availability` Collection**:
   - `expiresAt`: TTL index or index for active filtering (`{ expiresAt: 1 }`).
   - `location`: 2dsphere geospatial index (`{ "location.coordinates": "2dsphere" }`).

4. **`posts` Collection**:
   - `workerId + createdAt`: Compound index for profile posts (`{ workerId: 1, createdAt: -1 }`).
   - `createdAt`: Index for global feed sorting (`{ createdAt: -1 }`).

---

## 4. Realtime Events & WebSockets

WebSockets / Socket.io server channels:
- `radar:worker_free`: Emitted when worker goes Free Now.
- `radar:worker_busy`: Emitted when worker stops Free Now or expires.
- `job:new`: Emitted when a customer posts a new broadcast job.
- `booking:update`: Direct room notification for booking state changes.
