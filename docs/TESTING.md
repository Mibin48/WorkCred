# WorkCred End-to-End Testing Script (Demo Day)

This document provides the step-by-step walkthrough for evaluating WorkCred Phase A across both Worker and Customer experiences, realtime radar, Work Passport verification, and offline resilience.

---

## 1. Demo Accounts

| Role | Name | Phone | OTP | Starting URL | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Worker** | Ravi Kumar | `9000000001` | `123456` | `http://localhost:3000/app/#/login` | Electrician in Kothrud, Pune. 32 verified ledger entries. |
| **Customer** | Meera Nair | `9000000002` | `123456` | `http://localhost:3000/app/#/login` | Homeowner in Deccan, Pune. Active bookings & posts. |

---

## 2. Complete Lifecycle Walkthrough

### Scenario A: Free Now Radar & Instant Booking
1. **Worker Goes Live**:
   - Log in as Ravi (`9000000001`). On `/app/#/w/home`, select **"4h"** and tap **"Go Free Now"**.
   - Note the live timer ring and countdown start ticking.
2. **Customer Discovers Live Worker**:
   - In another browser tab (or window), log in as Meera (`9000000002`).
   - Navigate to the **"Free now"** tab (`/app/#/c/free-now`).
   - See Ravi Kumar appear with the `● Live` indicator, approximate distance, and remaining time.
3. **Instant Booking**:
   - Tap **"Book now"** on Ravi's card.
   - The booking bottom sheet opens pre-filled for today (+30 min, 2 hours, `source: "freenow"`).
   - Tap **"Confirm request"**.

---

### Scenario B: Complete Job Lifecycle & Cryptographic Handshake
1. **Worker Accepts Booking**:
   - Switch back to Ravi. Under **"Needs your answer"**, tap **"Accept"**.
   - Booking transitions to `Confirmed`.
2. **Customer Reveals Start Code**:
   - As Meera, open the booking detail view (`/app/#/c/booking/:id`).
   - Tap **"Show code"** to reveal the 4-digit `startCode`.
3. **Worker Starts Job**:
   - As Ravi, open the booking detail and enter the 4-digit code.
   - Tap **"Verify & start job"**. Haptic feedback triggers, and booking moves to `In Progress`.
4. **Customer Completes Cash Payment & Finish Handshake**:
   - As Meera, tap **"Finish & pay worker"**.
   - Enter the 4-digit `finishCode`, check *"I have paid cash in full"*, give a 5-star rating, and submit.
   - Customer is navigated to the clean **Job Receipt** (`/app/#/c/receipt/:id`).

---

### Scenario C: Work Passport & Public Verification
1. **Worker Passport Updated**:
   - As Ravi, go to the **Passport** tab (`/app/#/w/passport`).
   - Observe the animated counter increment, and the newly completed job appended at the top of the tamper-proof ledger.
2. **Public Passport Verification**:
   - Open unauthenticated URL: `http://localhost:3000/p/ravi-kumar-pune-842`.
   - See the green `✓ Valid` integrity badge.
   - Click the integrity badge to open the 4-node verification explainer modal.
   - Confirm customer names are masked (`M*** N.`).

---

### Scenario D: Community Feed & Work Posts
1. **Worker Publishes Work Post**:
   - As Ravi, go to the **Post** tab (`/app/#/w/post`).
   - Choose an "After" photo and optional "Before" photo.
   - Select skill "Electrician", enter caption *"Installed heavy duty power outlet"*, and link to a completed job.
   - Tap **"Post work"**.
2. **Customer Views in Community Feed**:
   - As Meera, open the **Feed** (`/app/#/feed` via top bar icon).
   - See the new post with Before/After photo comparison, verified job badge, and Save/Follow buttons.
   - Tap photo to open the focus-trapped image zoom modal.

---

### Scenario E: Offline Resilience & Action Queue
1. **Airplane Mode / Network Throttling**:
   - In DevTools, set Network to **Offline**.
   - Navigate to `/app/#/c/saved` and `/app/#/c/bookings`.
   - Notice the top **"Saved copy"** banner indicating offline cached data is served.
   - Notice live actions (accepting jobs, entering start codes, Free Now) are gracefully disabled with clear warnings.
2. **Safe Action Queue**:
   - Tap Save (heart icon) on a worker in `/app/#/c/find`.
   - Go to Me tab (`/app/#/c/me`). See the action listed under **"Actions waiting for internet"**.
   - Re-enable Network in DevTools. The action automatically syncs with toast confirmation.
