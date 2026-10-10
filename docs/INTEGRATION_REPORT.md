# WorkCred Frontend & Backend Integration Report

## Phase B - Step 14: Frontend Integration & Production Hardening

This report documents every interface discrepancy, payload shape adjustment, and behavioral reconciliation identified and resolved during Step 14 between the frontend mobile-first PWA and the MongoDB Atlas production backend.

---

### 1. Architectural Overview & Session Management

| Layer | Mock Implementation (Phase A) | Real Backend Implementation (Phase B) | Reconciliation Applied |
|---|---|---|---|
| **API Base** | In-memory synthetic router intercepting `fetch` | Express API running on `/api/v1` (same origin) | `config.js` sets `USE_MOCK = false` by default. Real network requests dispatched via `http.js`. |
| **Session Storage** | Mock user and mock token stored in browser `localStorage` | Pure in-memory access token storage; HttpOnly cookie `wc_rt` for refresh token | `http.js` holds access token exclusively in JS memory. Zero persistence to `localStorage`, `sessionStorage`, `IndexedDB`, or `CacheStorage`. |
| **Silent Refresh** | Synchronous token generation | `POST /api/v1/auth/refresh` with HttpOnly cookie | Single-flight cross-tab mutex via `navigator.locks.request('workcred_token_refresh')` prevents refresh token race conditions across multiple open tabs. |
| **Multi-tab Coordination** | Storage event listening | `BroadcastChannel('workcred_auth')` | Broadcasts `'logout'` and auth events across tabs immediately upon token revocation or explicit logout. |
| **Clock Synchronization** | Client `Date.now()` | Server `Date` HTTP response header tracking | `store.js` computes `serverClockOffset` on every HTTP response, guaranteeing that Free-Now timers, code lockout timers, and OTP cooldowns match Atlas server truth. |

---

### 2. Screen-by-Screen Shape & Contract Reconciliations

#### 2.1 Find Screen (`find.js`) & Worker Search
* **Locality Fallback Discrepancy**: The frontend fallback coordinates were previously set to Bangalore (`12.9784, 77.6408`). All 40 seed workers and jobs in MongoDB Atlas reside within the Pune city cluster (`18.5204, 73.8567`). If location permission was denied, 0 workers were returned.
  * **Fix**: Updated `queryFor` fallback in `find.js` to Pune city center (`18.5204, 73.8567`).
* **Pagination Cursor**: Mock mode passed numeric integer offsets (`cursor = 0`). The backend requires opaque base64url cursor strings (`encodeCursor(sortValue, id)`). Passing `"0"` caused cursor decode failure.
  * **Fix**: Updated `queryFor` to send `cursor: cursor || undefined`, passing `null` on the first page and the backend's opaque `nextCursor` on subsequent "Load More" pages.

#### 2.2 Worker Profile Screen (`workerProfile.js`) & Workers API
* **Response Unwrapping**: `GET /api/v1/workers/:id` returns `{ success: true, data: { worker: { ... } } }`. Callers in `workerProfile.js` destructure `const [{ worker }] = await Promise.all(...)`.
  * **Fix**: Updated `workersApi.getWorkerById` to return `{ ...worker, worker }`, supporting both `{ worker }` destructuring and direct object access.

#### 2.3 Post Job (`postJob.js`), Bookings (`bookings.js`), & Booking Detail (`bookingDetail.js`)
* **Envelopes and Unwrapping**: Backend endpoints for bookings return `{ booking: { ... } }`.
  * **Fix**: `bookingsApi.createBooking`, `confirmBooking`, `getBookingById`, `startBooking`, `finishBooking`, and `cancelBooking` return `{ ...booking, booking }`.
* **Idempotency Keys**: Ensured all booking mutations (`POST /bookings`, `POST /jobs/:id/accept`) automatically generate a UUID idempotency key if not explicitly supplied, protecting daily workers from double-charges or duplicate slot assignments on mobile network dropouts.
* **Handshake Privacy Enforcement**:
  * Customers receive `startCode` and `finishCode` in `GET /api/v1/bookings/:id` only when status is `confirmed` or `in_progress`.
  * Workers never receive codes from the server; workers collect the 4-digit code verbally from the customer and submit it via `POST /api/v1/bookings/:id/start`.
  * Counterpart phone numbers are strictly masked until a booking is `confirmed` or `in_progress`.

#### 2.4 Worker Home (`home.js`) & Free-Now Radar
* **Missing HTTP Routes**: In Phase A, Free-Now availability was simulated in mock memory. The backend had the `Availability` model and 2dsphere indexes, but lacked REST routes.
  * **Fix**: Implemented `backend/src/modules/availability/availability.routes.js`:
    * `POST /api/v1/availability`: Sets active Free-Now window and emits `radar:worker_free` to nearby area cells.
    * `DELETE /api/v1/availability`: Deactivates window and emits `radar:worker_busy`.
    * `GET /api/v1/availability/status`: Returns current active window for worker.
    * `GET /api/v1/availability/nearby`: Queries active workers for customers on map and list.

#### 2.5 Compass Fair Rate Indicator (`compass.api.js`)
* **Route Implementation**: Added `backend/src/modules/compass/compass.routes.js` exposing `GET /api/v1/compass`, connecting the frontend's `CompassBar` directly to the 3-tier quartile calculator (`p25`, `median`, `p75`) computed from 90-day completed booking history in Atlas.

#### 2.6 Work Passport Presentation (`passport.api.js`)
* **Ledger Presentation & Cryptographic Verification**:
  * Implemented `backend/src/modules/passport/passport.routes.js`:
    * `GET /api/v1/passport/me`: Worker's private view with full ledger entries and customer names.
    * `PATCH /api/v1/passport/entries/:id`: Strict privacy updates (`public`/`private`, `isMasked`).
    * `GET /api/v1/passport/:slug`: Public passport presentation with customer masking.
    * `GET /api/v1/passport/:slug/verify`: Independent SHA-256 chain verification returning `{ valid: true/false, checkedEntries, brokenAtSeq }`.
    * `GET /api/v1/passport/:slug/qr`: Dynamic QR code endpoint for verified passport URL sharing.

---

### 3. Verification & Safety Assurances
* Zero secrets printed or stored in git.
* Automated unit test suite `tests/http.test.js` passes 6/6 tests:
  * Enforces `credentials: 'same-origin'`.
  * Attaches `X-Requested-With: workcred` on state-changing requests.
  * In-memory `Authorization: Bearer` token handling.
  * Clock drift tracking via `Date` response header.
  * Single-flight 401 coalescing into exactly 1 refresh call.
  * Web storage scanner confirms 0 tokens in `localStorage` or `sessionStorage`.
