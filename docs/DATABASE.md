# WorkCred Database Specification & Ledger Architecture

This document specifies the MongoDB database schemas, explicit indexes, cryptographic ledger immutability rules, data encryption standards, and transaction workflows for the WorkCred backend.

---

## 1. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ Booking : "requests / fulfills"
    User ||--o{ Job : "posts / accepts"
    User ||--o{ PassportEntry : "owns ledger blocks"
    User ||--o{ Availability : "broadcasts radar"
    User ||--o{ Post : "shares portfolio"
    User ||--o{ Follow : "saves / follows"
    User ||--o{ Endorsement : "endorses / receives"
    User ||--o{ PushSubscription : "registers device"
    Job ||--o{ Booking : "originates"
    Booking ||--|| PassportEntry : "chains on completion"

    User {
        string _id PK
        string phone UK
        string name
        string role "worker | customer"
        stringArray skills
        string mainSkill
        number rate
        string rateUnit "day | hour"
        string area
        string city
        object location "GeoJSON Point [lng, lat]"
        string passportSlug UK "sparse"
        object passportStats
        boolean defaultMaskEmployerNames
        boolean profileComplete
        boolean isPublicPassportEnabled
        boolean isActive
        boolean isSample
    }

    Booking {
        string _id PK
        string customerId FK
        string workerId FK
        string jobId FK "optional"
        string source "direct | freenow | job"
        string status "pending | confirmed | in_progress | completed | cancelled | no_show"
        number rate
        string rateUnit
        datetime scheduledAt
        number hours
        number hoursWorked
        number amountPaid
        boolean paidCash
        number rating "1..5"
        string comment
        string startCodeEnc "AES-256-GCM select:false"
        string finishCodeEnc "AES-256-GCM select:false"
        object startedGeo "GeoJSON Point"
        datetime startedAt
        datetime finishedAt
    }

    PassportEntry {
        string _id PK
        string bookingId UK
        string workerId FK
        number seq UK "workerId + seq"
        string prevHash "SHA-256"
        string hash UK "SHA-256"
        object fields "Hashed payload"
        string visibility "public | private"
        boolean isMasked
    }

    Availability {
        string _id PK
        string workerId FK UK "partial (active:true)"
        string skill
        number hours "2 | 4 | 8"
        object location "GeoJSON Point [lng, lat]"
        boolean active
        datetime expiresAt "TTL: 0s"
    }

    RateStat {
        string _id PK
        string skill UK "skill + localityKey"
        string localityKey UK
        string locality
        string city
        number p25
        number median
        number p75
        number sampleSize
        boolean isSeed
    }

    Job {
        string _id PK
        string customerId FK
        string title
        string skill
        string area
        string city
        object location "GeoJSON Point [lng, lat]"
        number rate
        string status "open | filled | cancelled"
    }

    Post {
        string _id PK
        string workerId FK
        string skill
        string caption
        string beforePhotoUrl
        string afterPhotoUrl
        string linkedBookingId FK
        object location "GeoJSON Point"
    }

    Follow {
        string _id PK
        string fromUserId FK UK "from + to + type"
        string toUserId FK UK
        string type "save | follow"
    }

    Endorsement {
        string _id PK
        string customerId FK UK "cust + worker + skill"
        string workerId FK UK
        string skill UK
        string comment
    }

    PushSubscription {
        string _id PK
        string userId FK
        string endpoint UK
        object keys
    }

    Report {
        string _id PK
        string targetType "passport | worker | booking | post"
        string targetId
        string reason
        string note
        string reporterId FK "optional"
    }

    IdempotencyKey {
        string _id PK
        string userId UK "userId + key + route"
        string key UK
        string route UK
        object response
        datetime createdAt "TTL: 86400s"
    }
```

---

## 2. Collection & Index Catalog

| Collection | Model | Index Fields & Type | Explicit Name | Constraints & Business Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `users` | `User.js` | `{ phone: 1 }` (unique) | `users_phone_unique` | Unique E.164 phone per account |
| | | `{ passportSlug: 1 }` (unique, sparse) | `users_passport_slug_unique` | Worker public passport URL slug |
| | | `{ location: '2dsphere' }` | `users_location_2dsphere` | Spatial search for nearby workers |
| | | `{ role: 1, isActive: 1, skills: 1 }` | `users_role_active_skills` | Filter active workers by skill |
| | | `{ role: 1, 'passportStats.avgRating': -1 }` | `users_role_rating_sort` | Sort qualified workers by rating |
| `otps` | `Otp.js` | `{ expiresAt: 1 }` (TTL: 0s) | `otps_expires_at_ttl` | Automatic document cleanup upon expiry |
| | | `{ phone: 1, createdAt: -1 }` | `otps_phone_created_at` | Quick lookup for verification & rate windowing |
| `refreshTokens` | `RefreshToken.js` | `{ tokenHash: 1 }` (unique) | `refresh_tokens_token_hash_unique` | Prevent token collisions & verify refresh tokens |
| | | `{ expiresAt: 1 }` (TTL: 0s) | `refresh_tokens_expires_at_ttl` | Automatic session expiry |
| | | `{ userId: 1, familyId: 1 }` | `refresh_tokens_user_family` | Token family reuse detection & bulk revocation |
| `jobs` | `Job.js` | `{ location: '2dsphere' }` | `jobs_location_2dsphere` | Spatial search for broadcast jobs |
| | | `{ status: 1, skill: 1, scheduledAt: 1 }` | `jobs_status_skill_scheduled` | Filter available open jobs |
| | | `{ customerId: 1, status: 1 }` | `jobs_customer_status` | Customer job history query |
| `bookings` | `Booking.js` | `{ workerId: 1, status: 1, scheduledAt: 1 }` | `bookings_worker_status_scheduled` | Worker schedule & overlap validation |
| | | `{ customerId: 1, status: 1, scheduledAt: 1 }` | `bookings_customer_status_scheduled` | Customer bookings list |
| | | `{ jobId: 1 }` | `bookings_job_id` | Broadcast job association |
| | | `{ workerId: 1, jobId: 1 }` (unique, partial) | `bookings_worker_job_active_unique` | Only 1 active booking per worker per broadcast job |
| `passportEntries` | `PassportEntry.js` | `{ bookingId: 1 }` (unique) | `passport_entries_booking_id_unique` | 1 ledger block per completed booking |
| | | `{ workerId: 1, seq: 1 }` (unique) | `passport_entries_worker_seq_unique` | Strict immutable sequence ordering per worker |
| | | `{ workerId: 1, createdAt: -1 }` | `passport_entries_worker_created` | Worker passport feed display |
| `availability` | `Availability.js` | `{ location: '2dsphere' }` | `availability_location_2dsphere` | Free-Now Radar spatial search |
| | | `{ expiresAt: 1 }` (TTL: 0s) | `availability_expires_at_ttl` | TTL index for auto-cleanup |
| | | `{ workerId: 1 }` (unique, partial) | `availability_worker_active_unique` | Max 1 active Free-Now window per worker |
| `rateStats` | `RateStat.js` | `{ skill: 1, localityKey: 1 }` (unique) | `rate_stats_skill_locality_unique` | Compass fair rate lookup by skill & 0.05° cell |
| `posts` | `Post.js` | `{ location: '2dsphere' }` | `posts_location_2dsphere` | Nearby work post discovery |
| | | `{ createdAt: -1 }` | `posts_created_at_desc` | Community feed reverse chronological sort |
| | | `{ workerId: 1, createdAt: -1 }` | `posts_worker_created_desc` | Worker portfolio tab |
| `follows` | `Follow.js` | `{ fromUserId: 1, toUserId: 1, type: 1 }` (unique) | `follows_from_to_type_unique` | Prevent duplicate follow / save |
| | | `{ toUserId: 1, type: 1 }` | `follows_to_type` | Count worker saves / followers |
| `endorsements` | `Endorsement.js` | `{ customerId: 1, workerId: 1, skill: 1 }` (unique) | `endorsements_customer_worker_skill_unique` | 1 endorsement per customer per worker skill |
| `pushSubscriptions` | `PushSubscription.js` | `{ endpoint: 1 }` (unique) | `push_subs_endpoint_unique` | Unique push subscription endpoint |
| | | `{ userId: 1 }` | `push_subs_user_id` | User device push dispatch |
| `reports` | `Report.js` | `{ targetType: 1, targetId: 1 }` | `reports_target` | Incident moderation queue |
| | | `{ createdAt: -1 }` | `reports_created_desc` | Moderation queue ordering |
| `idempotencyKeys` | `IdempotencyKey.js` | `{ userId: 1, key: 1, route: 1 }` (unique) | `idempotency_user_key_route_unique` | Idempotent POST retry protection |
| | | `{ createdAt: 1 }` (TTL: 86400s) | `idempotency_created_at_ttl` | 24-hour cache expiry |

---

## 3. Work Passport Cryptographic Ledger Specification

The Work Passport is an append-only, tamper-evident cryptographic hash chain.

### Hashed Fields vs Mutable Fields
Each block in the ledger chains to the previous block's SHA-256 hash using canonical JSON formatting:
```text
payload = prevHash + canonicalJSON(fields)
hash = SHA-256(payload)
```

The **`fields`** subdocument consists of exactly 9 fields:
1. `bookingId`
2. `workerId`
3. `customerId`
4. `skill`
5. `hoursWorked`
6. `amountPaid`
7. `startedAt` (ISO 8601 string)
8. `finishedAt` (ISO 8601 string)
9. `rating` (Integer 1..5)

> [!IMPORTANT]
> **Immutability Guard**: The fields above, along with `prevHash`, `hash`, `seq`, and `workerId`, are completely immutable. Pre-save and pre-update hooks block any mutation or deletion. Only `visibility` (`'public' | 'private'`) and `isMasked` (`boolean`) are mutable, allowing workers full privacy control without compromising cryptographic audit integrity.

---

## 4. Handshake Codes Encryption at Rest

Booking handshake verification codes (`startCode` and `finishCode`) are 4-digit numbers generated at booking creation.

- **Storage**: Never stored in plain text. Stored in fields `startCodeEnc` and `finishCodeEnc` marked with `select: false`.
- **Encryption Scheme**: AES-256-GCM.
- **Envelope Format**: `v1:<iv-base64url>:<tag-base64url>:<ciphertext-base64url>`
- **Key**: 256-bit (32 bytes) key loaded from `CODES_ENC_KEY` environment variable.
- **Decryption & Verification**: Handshake codes are only decrypted when verifying a customer/worker submission, and are never emitted in public JSON responses.

---

## 5. TTL Monitor & Read-Time Expiry Filter

MongoDB Atlas runs an internal background TTL monitor approximately once every 60 seconds.

> [!WARNING]
> Because documents may remain in the database for up to 60 seconds after their `expiresAt` timestamp, **all read queries on time-sensitive collections (such as `availability`) MUST apply a read-time clock filter**:
> ```javascript
> {
>   active: true,
>   expiresAt: { $gt: clock.toDate() },
>   location: { $near: ... }
> }
> ```
> This is encapsulated in `Availability.activeNear({ lat, lng, radiusKm, skill })`.

---

## 6. Multi-Document Transaction Management

MongoDB multi-document ACID transactions are used when coordinating operations across collections (e.g., finishing a booking and appending a passport ledger block).

All transactional workflows must use the `withTransaction` helper from `config/db.js`:
```javascript
import { withTransaction } from '../config/db.js';

await withTransaction(async (session) => {
  await Booking.updateOne({ _id: bookingId }, { status: 'completed' }, { session });
  await PassportEntry.create([entryData], { session });
});
```
`withTransaction` handles transient replica set election errors (`TransientTransactionError`) and commits automatically.
