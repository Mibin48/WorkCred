# Phase B Handoff Specification (WorkCred Backend)

This document tracks the backend requirements, database schemas, business rules, cryptographic ledger protocols, indexes, events, API contracts, and implementation milestones for **WorkCred Phase B** (production backend replacing the Phase A mock API).

---

## 1. Implementation Progress & Milestones

| Step | Milestone | Status | Notes / Decisions |
| :--- | :--- | :--- | :--- |
| **Step 9** | **Backend Foundation, Models, Indexes & Seed** | ✅ **COMPLETE** | Modular Express app, MongoDB Atlas support, Mongoose 8 models, AES-256-GCM code encryption at rest, append-only ledger hooks, deterministic seed with SHA-256 hash chains, and automated test suite. |
| **Step 10**| **Auth & User Sessions** | ✅ **COMPLETE** | Phone OTP auth (`/auth/otp/request`, `/auth/otp/verify`), JWT access + refresh token rotation with family revocation, session management (`/auth/refresh`, `/auth/logout`), `/users/me`, `/users/me/role`. |
| **Step 11**| **Workers Discovery, Free Now & Compass** | ✅ **COMPLETE** | `/workers`, `/workers/:id`, `/compass`, `/availability` (Free Now Radar). 2dsphere geo queries, 3-mode cursor pagination (distance, rating, price), rate normalization, busy calendar projections. |
| **Step 12**| **Bookings, Job Broadcast & Double Handshake Protocol** | ✅ **COMPLETE** | Direct & Radar bookings, multi-slot Job Broadcast & race-free concurrent claiming, AES-256-GCM encrypted start/finish codes, tamper-proof state machine, automatic Work Passport chaining, dispute reporting. |
| **Step 13**| **Work Passport, Feed, Social Endpoints & Realtime Engine** | ✅ **COMPLETE** | `/passport/:slug` (with full SHA-256 ledger verification & offline SVG QR), `/feed` (role-specific unified stream), `/posts`, `/follows`, `/endorsements`, `/uploads/sign` (Cloudinary HMAC-SHA1), `/reports`, `/push/subscribe`, and Socket.io realtime server with JWT auth and geographic area rooms. |
| **Step 14**| **Frontend Integration & Production Hardening** | ⏳ *Next Step* | Switch `USE_MOCK = false`, wire frontend to backend `/api/v1` and Socket.io, full system validation. |

---

## 2. Resolved Architectural Decisions

1. **Database & Infrastructure**: MongoDB Atlas M0 (Replica Set enabled by default for multi-document ACID transactions). Tests run against embedded in-memory replica set (`mongodb-memory-server`) with zero external tooling requirements.
2. **Booking Handshake Codes at Rest**: Handshake codes (`startCode` and `finishCode`) are encrypted using **AES-256-GCM** in the format `v1:<iv>:<tag>:<ciphertext>` (base64url) using the `CODES_ENC_KEY` (32-byte key). Fields are marked `select: false` and excluded from all JSON serializations.
3. **Cryptographic Ledger Integrity**: Passport blocks chain sequential SHA-256 hashes computed on 9 canonical fields. Mongoose pre-save and pre-update hooks enforce strict append-only immutability for all historical blocks, while allowing worker privacy controls (`visibility: 'public'|'private'` and `isMasked: boolean`).
4. **Validation**: Pure isomorphic validation reusing `/shared/validators.js`. Zero external schema dependencies.
5. **Time Management**: Centralized `clock.now()` utility in `src/utils/clock.js` supporting test time-travel.
6. **Cloudinary Upload Signing & Asset Ownership**: Uploads are signed server-side using Node crypto HMAC-SHA1. Image URLs enforce caller folder paths (`workcred/<userId>/...`), rejecting foreign folders, path traversal, userinfo, and non-image extensions. Asset destruction is best-effort and signed.
7. **Activity Feed Merging**: Feed uses `$geoWithin` with `$centerSphere` for radius queries, preserving strict reverse-chronological ordering (`createdAt` desc) without forcing distance ordering. Followed workers' posts (up to 200) are merged in-memory and deduplicated.
8. **Realtime Socket Architecture**: Socket.io server shares the HTTP listener, authenticates handshakes via Jose JWT access token with 5-minute session freshness validation, joins clients to role-separated area rooms (`area:<cellKey>:worker|customer`), and only broadcasts allowlisted events (`EVENT_PROJECTORS`) with projected payloads.

---

## 3. Core Architecture & Modules

The backend directly reuses shared isomorphic business logic modules in [`/shared`](file:///d:/WorkCred/shared):
- [`shared/constants.js`](file:///d:/WorkCred/shared/constants.js): Skills, roles, limits, booking status enum.
- [`shared/errors.js`](file:///d:/WorkCred/shared/errors.js): Standard `AppError` codes, HTTP statuses, JSON envelope schema.
- [`shared/geo.js`](file:///d:/WorkCred/shared/geo.js): Haversine distance, 0.05-degree cell grid.
- [`shared/hash.js`](file:///d:/WorkCred/shared/hash.js): Canonical JSON serialization, SHA-256 hash chaining, ledger verification.
- [`shared/stateMachine.js`](file:///d:/WorkCred/shared/stateMachine.js): Booking state transitions (`pending -> confirmed -> in_progress -> completed / cancelled / no_show`).
- [`shared/validators.js`](file:///d:/WorkCred/shared/validators.js): Handwritten input validators.
- [`shared/compass.js`](file:///d:/WorkCred/shared/compass.js): Local wage quartiles and fair-rate calculations.

---

## 4. API Contract Endpoints Checklist

All responses adhere to the standard envelope:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional confirmation message"
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

### 4.1 Step 10 Checklist (Auth & User Sessions)
- [x] `POST /api/v1/auth/otp/request`: `{ phone: "9000000001" }`. Cooldown: 30s, 3/10m, 10/day limits, HMAC-SHA256 hash storage.
- [x] `POST /api/v1/auth/otp/verify`: `{ phone: "9000000001", code: "123456" }`. Returns `{ user, accessToken }` and sets `wc_rt` HttpOnly cookie.
- [x] `POST /api/v1/auth/refresh`: Cookie-based session refresh with family token rotation, 10s multi-tab grace window, and CSRF protection.
- [x] `POST /api/v1/auth/logout`: Idempotent family revocation and cookie clearing.
- [x] `GET /api/v1/users/me`: Current authenticated user session (private owner view).
- [x] `PATCH /api/v1/users/me`: Strict field whitelisting (`name`, `bio`, `skills`, `mainSkill`, `rate`, `rateUnit`, `area`, `city`, `radiusKm`, `calendar`, `blockedDates`, `photoUrl`, `defaultMaskEmployerNames`), passport slug collision handling, `profileComplete` computation.
- [x] `PATCH /api/v1/users/me/role`: One-time worker or customer role assignment with worker defaults initialization.

### 4.2 Step 11 Checklist (Discovery & Radar)
- [x] `GET /api/v1/workers`: Search with filters (`skills`, `radiusKm`, `minRate`, `maxRate`, `minRating`, `sortBy`, `cursor`).
- [x] `GET /api/v1/workers/:id`: Worker profile, ratings summary, up to 3 masked passport entries, busy calendar.
- [x] `GET /api/v1/compass`: Quartiles (`p25`, `median`, `p75`) and verdict.
- [x] `POST /api/v1/availability`: Free-Now toggle (`{ hours: 2|4|8, lat, lng }`).
- [x] `DELETE /api/v1/availability`: Free-Now cancellation.
- [x] `GET /api/v1/availability/status`: Worker's active Free-Now window status.
- [x] `GET /api/v1/availability/nearby`: Nearby available workers within radius.

### 4.3 Step 12 Checklist (Bookings & Double Handshake)
- [x] `POST /api/v1/bookings`: Direct / Radar booking. Idempotent. Generates encrypted 4-digit codes.
- [x] `GET /api/v1/bookings`: User booking history.
- [x] `GET /api/v1/bookings/:id`: Booking details (customer gets codes; worker only gets phone after confirmation).
- [x] `POST /api/v1/bookings/:id/confirm`: Worker confirms booking.
- [x] `POST /api/v1/bookings/:id/decline`: Worker declines booking.
- [x] `POST /api/v1/bookings/:id/start`: Worker inputs 4-digit `startCode` and GPS coordinates.
- [x] `POST /api/v1/bookings/:id/finish`: Customer inputs 4-digit `finishCode`, `paidCash: true`, and `rating: 1..5`. Chains to Passport.
- [x] `POST /api/v1/bookings/:id/cancel`: Booking cancellation.
- [x] `POST /api/v1/bookings/:id/report`: Dispute reporting.
- [x] `POST /api/v1/jobs`: Post multi-slot broadcast job with Compass wage quartile check.
- [x] `GET /api/v1/jobs`: Worker queries nearby open jobs matching their skills.
- [x] `POST /api/v1/jobs/:id/accept`: Worker claims a slot atomically with compare-and-set and automatic status transition.
- [x] `POST /api/v1/jobs/:id/cancel`: Customer cancels job, cascading cancellation to all confirmed worker bookings.

### 4.4 Step 13 Checklist (Passport, Feed, Social & Realtime)
- [x] `GET /api/v1/passport/:slug`: Public/authenticated Work Passport with masked employer names and verified ledger entries.
- [x] `GET /api/v1/passport/:slug/verify`: Cryptographic verification of SHA-256 chain from GENESIS to latest block.
- [x] `GET /api/v1/passport/:slug/qr`: Standalone offline SVG QR code generation without external network calls.
- [x] `PATCH /api/v1/passport/entries/:id`: Worker entry privacy toggle (`visibility: public|private`, `isMasked: boolean`).
- [x] `GET /api/v1/receipts/:bookingId`: Completed booking receipt with payment details and block hash proof.
- [x] `GET /api/v1/feed`: Role-specific aggregated feed (jobs & posts for workers; free-now & posts for customers; followed workers' posts regardless of distance).
- [x] `POST /api/v1/posts`: Worker portfolio upload with Cloudinary folder ownership validation, rate limits (10/day, 100 total), and optional completed booking verification.
- [x] `DELETE /api/v1/posts/:id`: Owner deletion of portfolio post with signed Cloudinary asset destruction.
- [x] `GET /api/v1/posts/mine`: Worker's own published posts with cursor pagination.
- [x] `POST /api/v1/follows`: Follow or save a worker with self-action guards.
- [x] `DELETE /api/v1/follows/:toId`: Unfollow / unsave worker.
- [x] `GET /api/v1/follows`: List followed or saved workers with pagination.
- [x] `POST /api/v1/endorsements`: Skill endorsement requiring a completed booking for that specific skill.
- [x] `POST /api/v1/uploads/sign`: Generate HMAC-SHA1 signed parameters for direct client uploads to Cloudinary.
- [x] `POST /api/v1/reports`: Incident report accepting `targetType: 'post' | 'booking' | 'user'` with IP hashing and 24h deduplication.
- [x] `POST /api/v1/push/subscribe` & `DELETE /api/v1/push/subscribe`: Web push subscription stubs.
- [x] **Socket.io Realtime Server**: JOSE JWT handshake authentication, role-separated area rooms (`area:<cellKey>:worker|customer`), `area:join`, `auth:refresh`, 5-minute session freshness validation, and allowlist event projection.

---

## 5. Step 14 Integration Checklist (Frontend -> Real Backend)

When starting Step 14, follow this roadmap:
1. **Frontend API Client**: In `frontend/app/js/api/client.js`, point `BASE_URL` to `/api/v1` and toggle `USE_MOCK = false` in `frontend/app/js/config.js`.
2. **Socket.io Client Wiring**: Connect `frontend/app/js/realtime/socket.js` to the backend server with `auth.token = accessToken`, join area rooms on location changes (`area:join`), and listen for real-time events (`job:new`, `booking:request`, `booking:confirmed`, `radar:worker_free`).
3. **Cloudinary Upload Helper**: In frontend media upload flows, call `POST /api/v1/uploads/sign` first, upload directly to `uploadUrl` via `fetch(uploadUrl, { method: 'POST', body: formData })`, and submit the resulting `secure_url` to `/users/me` or `/posts`.
4. **End-to-End User Journeys**: Validate worker OTP login -> profile completion -> radar toggle -> job acceptance -> start/finish code exchange -> passport verification.
