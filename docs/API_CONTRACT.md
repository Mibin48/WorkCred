# WorkCred API contract additions

This file records the customer app contracts implemented against the Phase A mock. The shared envelope remains `{ success, data, message }` on success and `{ success: false, error: { code, message, details? } }` on failure.

## Customer discovery

- `GET /workers?q=&skills=&area=&lat=&lng=&radiusKm=&minRate=&maxRate=&minRating=&sortBy=&cursor=&limit=` returns `{ workers, nextCursor, total }`. `minRate` and `maxRate` are rupees per hour; daily worker rates are normalized using an eight-hour day. Worker summaries include rating, completed-job count, approximate distance, sample marker, save state for the signed-in customer, and `isFreeNow`. Phone and exact coordinates are never returned.
- `GET /workers/:id` returns `{ worker }`, including approximate distance, `totalHoursWorked`, skill endorsement counts, up to three masked Work Passport entries, availability summary, follow/save state, and scheduled busy windows. It does not return the worker phone number.
- `GET /compass?skill=&area=&city=&rate=&rateUnit=` is public and returns the local rate quartiles, sample size/source, and optional Low/Fair/High verdict.
- `GET /follows?type=save|follow` returns `{ workers }` for the signed-in customer. Worker summaries do not include private contact information.
- `POST /follows` toggles `{ toUserId, type: save|follow }` and returns `{ active, type, toUserId }`.

## Customer booking and jobs

- `POST /bookings` accepts `{ workerId, source: "direct", skill, rate, rateUnit, scheduledAt, hours, note }`. `Idempotency-Key` is accepted for safe retries. A conflicting scheduled booking returns HTTP-style error code `ALREADY_BOOKED`.
- `GET /bookings` returns customer bookings with a `workerName` summary and no worker phone.
- `GET /bookings/:id` returns the handshake codes to the customer. `workerPhone` is included only for `confirmed` or `in_progress` bookings. Worker-facing responses never receive handshake codes.
- `POST /bookings/:id/finish` requires a four-digit `finishCode`, `paidCash: true`, and integer `rating` from 1–5; it records the optional comment and adds a chained Work Passport entry. Invalid codes report attempts remaining; the lockout uses `RATE_LIMITED`.
- `POST /jobs` accepts the original job fields plus `hoursPerWorker` and `scheduledAt`, and supports `Idempotency-Key`. `GET /jobs/mine` returns the signed-in customer's posts; `POST /jobs/:id/cancel` cancels an open post.

## Worker operations and profile

- `GET /availability/status` returns the worker's current Free Now status (`{ active, expiresAt, durationHours }`).
- `POST /availability/freenow` toggles or extends Free Now (`{ action: "start" | "extend" | "stop", durationHours: 2 | 4 | 8 }`).
- `POST /bookings/:id/accept` and `POST /bookings/:id/decline` allow workers to respond to incoming direct requests (`status: "pending"`).
- `POST /bookings/:id/start` requires the four-digit `startCode` provided by the customer at the job site, with optional geolocation `{ lat, lng }`. Rate-limited after 5 failed attempts.
- `POST /bookings/:id/report` submits an incident report or dispute (`{ reason, note }`) on an active or confirmed booking.
- `PATCH /users/me` accepts worker profile updates (`{ bio, skills, mainSkill, rate, rateUnit, radiusKm, calendar, blockedDates, photoUrl, defaultMaskEmployer }`).

## Work Passport & Public Verification

- `GET /passport/:slug` public or authenticated retrieval of worker's Work Passport. Returns `{ worker, entries, stats, integrity }`. When unauthenticated or requested by non-owners, entries with `visibility: "hidden"` are excluded, and customer names are masked (e.g., `R*** K.`) unless `isMasked: false` is explicitly set by the worker. Rate-limited to 60 requests/minute per client IP/session.
- `GET /passport/:slug/verify` unauthenticated integrity check. Verifies the SHA-256 cryptographic chain of all completed job entries. Returns `{ valid: boolean, verifiedCount: number, firstEntryDate: string, lastEntryDate: string, brokenAtId?: string }`.
- `GET /passport/:slug/qr` returns an inline, dependency-free SVG representation of the worker's public passport QR code with aria-labels.
- `PATCH /passport/entries/:id` authenticated worker endpoint to update privacy controls of a specific ledger entry (`{ visibility: "visible" | "hidden", isMasked: boolean }`).
- `GET /receipts/:bookingId` returns complete job receipt and ledger proof for a completed booking (`{ booking, worker, customer, entry, integrity }`).
- `POST /reports` accepts incident or trust-and-safety reports (`{ targetType: "passport" | "worker" | "booking", targetId, reason, details }`). Returns `{ success: true, reportId }`.

## Privacy and error handling

Profile and list endpoints omit phone numbers and exact location coordinates. The detail endpoint is the only customer-facing booking response that can reveal a worker's fictional mock phone, and only after confirmation or job start. Worker responses never contain handshake codes (`startCode` or `finishCode`). Work Passport public views strictly respect worker visibility preferences and mask employer identities by default. UI code maps common mock errors (`ALREADY_BOOKED`, `INVALID_START_CODE`, `INVALID_FINISH_CODE`, `RATE_LIMITED`, `DUPLICATE_ENDORSEMENT`, `NOT_FOUND`, and network failures) to plain-language messages without technical or crypto jargon.

