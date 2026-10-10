# WorkCred Backend Setup & Operations Guide (MongoDB Atlas)

This guide documents the local setup, environment configuration, database management, seeding procedures, and troubleshooting for the **WorkCred Phase B** backend service.

---

## 1. Prerequisites

- **Node.js**: v20.x or higher (`node -v`)
- **MongoDB Atlas Cluster**: Free M0 Sandbox Cluster (Replica Set enabled by default)
- **Zero Local Database Installation Required**: Unit/integration tests run against an embedded in-memory replica set (`mongodb-memory-server`) with zero external dependencies.

---

## 2. MongoDB Atlas Configuration

WorkCred requires a MongoDB replica set for multi-document ACID transactions and 2dsphere geospatial indexing. A free MongoDB Atlas M0 cluster fulfills all requirements.

### 2.1 Cluster Setup
1. Create a free shared cluster (e.g. `Cluster0` on AWS or GCP region nearest to you, like Mumbai `ap-south-1`).
2. **Database Name**: WorkCred strictly uses the database name `workcred`. Ensure your connection URI specifies `/workcred`.

### 2.2 Database User Setup
1. Navigate to **Security > Database Access** in Atlas.
2. Create a Database User with **Password Authentication**.
3. **Privileges**: Grant `readWrite` permission on database `workcred` (and `workcred_test` if you plan to run automated tests against Atlas).
4. **URL Encoding**: If your database user password contains special characters (such as `@`, `:`, `/`, `%`, `#`), you **must URL-encode** them (e.g., `#` becomes `%23`).

### 2.3 Network Access (IP Whitelist)
1. Navigate to **Security > Network Access** in Atlas.
2. Add your current public IP address (`Add Current IP Address`).
3. If your ISP assigns a dynamic IP that changes frequently, remember to re-authorize your new IP when connection errors arise.

### 2.4 M0 Free Tier Limits & Considerations
- **Storage Cap**: 512 MB storage limit (plenty for development, seeding, and demo data).
- **Throughput**: Shared vCPU with standard connection pool limits. `config/db.js` caps `maxPoolSize` at 10.
- **Inactivity Pause**: Clusters inactive for extended periods may be paused by Atlas. Check the Atlas dashboard to resume if connections time out.

---

## 3. Environment Variables Configuration

Copy `.env.example` to `.env` inside the `backend/` directory:
```bash
cp backend/.env.example backend/.env
```

Generate cryptographically secure JWT secrets and AES-256 encryption keys:
```bash
npm run gen:secrets
```

### Environment Variables Reference

| Variable | Type | Required | Default / Example | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | Yes | `development` | `development`, `production`, or `test` |
| `PORT` | Number | No | `4000` | Port for Express HTTP server |
| `APP_ORIGIN` | String | Yes | `http://localhost:3000` | Client origin allowed for CORS |
| `MONGODB_URI` | String | Yes | `mongodb+srv://.../workcred?retryWrites=true` | Atlas connection string (must include `/workcred`) |
| `TEST_MONGODB_URI` | String | No | `mongodb+srv://.../workcred_test?retryWrites=true` | Optional Atlas URI for tests (must end in `_test`) |
| `JWT_ACCESS_SECRET` | String | Yes | 32+ characters | Secret for signing short-lived access tokens |
| `JWT_REFRESH_SECRET`| String | Yes | 32+ characters | Secret for signing session refresh tokens |
| `CODES_ENC_KEY` | String | Yes | 32 bytes base64 | AES-256-GCM encryption key for booking codes |
| `OTP_MODE` | String | No | `dev` | `dev` (fixed code) or `sms` (live provider) |
| `OTP_DEV_CODE` | String | No | `123456` | Fixed code allowed only when `OTP_MODE=dev` |
| `SMS_PROVIDER` | String | No | `dev` | `dev` (console log) or `msg91` (MSG91 API) |
| `MSG91_AUTH_KEY` | String | Conditional | - | Required if `SMS_PROVIDER=msg91` |
| `MSG91_TEMPLATE_ID`| String | Conditional | - | Approved DLT template ID in MSG91 |
| `PHOTO_HOST_ALLOWLIST`| String| No | `res.cloudinary.com` | Comma-separated allowed image CDNs for user avatars |
| `LOG_LEVEL` | String | No | `info` (`debug` in dev) | Pino log level (`debug`, `info`, `warn`, `error`) |
| `TRUST_PROXY` | Boolean| No | `false` | Enable if running behind reverse proxy / load balancer |

---

## 4. SMS Provider & DLT Compliance (MSG91)

When running in production or staging with `OTP_MODE=sms` and `SMS_PROVIDER=msg91`:

1. **DLT Registration (TRAI / India)**:
   - WorkCred uses Indian transactional SMS routing for 6-digit OTP delivery.
   - Register the sender ID and OTP template with Indian DLT telecom operators (e.g. Jio, Airtel, Vil).
   - The registered DLT template message format is: `Your WorkCred verification code is ##OTP##. Valid for 5 minutes. Do not share it with anyone.`
2. **MSG91 Setup**:
   - Set `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` in `backend/.env`.
   - The backend passes `template_id`, `mobile` (formatted with `91` prefix), and `otp` variable.
   - When SMS sending fails or returns an error, the backend gracefully returns `503 SMS_UNAVAILABLE`.
3. **Outbound IP Whitelisting**:
   - If your MSG91 account has IP restrictions enabled, remember to add your deployment server's outbound elastic IP to the MSG91 dashboard allowlist.
4. **Development Testing**:
   - Keep `OTP_MODE=dev` and `SMS_PROVIDER=dev` for zero-cost local testing.
   - In dev mode, the backend generates and accepts `123456` (or `OTP_DEV_CODE`) without sending SMS.
   - Server logs output masked phone numbers (e.g., `+91*****3210`) with zero code leakage.

---

## 5. Running the Backend & Scripts

All backend scripts can be executed from the root workspace directory or within `backend/`:

| Command | Description |
| :--- | :--- |
| `npm run dev:backend` | Start backend with automatic reload on changes (`node --watch`) |
| `npm run start:backend` | Start backend production mode (`node src/server.js`) |
| `npm run test:backend` | Run complete backend test suite via `node:test` against in-memory replica set |
| `npm run test:all` | Run both frontend/shared tests and backend tests |
| `npm run seed` | Seed Atlas database with deterministic sample data (idempotent) |
| `npm run seed:reset -- --yes` | Clean all collection records and re-seed from scratch |
| `npm run db:indexes` | Synchronize and build all collection indexes on Atlas |
| `npm run gen:secrets` | Generate fresh cryptographic keys |

---

## 6. Running Backend and Frontend Together

### Option A: Direct Backend SPA Serving (Recommended for Phase B)
The Express backend is configured to serve both the static landing page and the SPA application:
1. Start the backend:
   ```bash
   npm run dev:backend
   ```
2. Open `http://localhost:4000/` for landing page, or `http://localhost:4000/app` for the WorkCred app.
3. `/api/v1/health` verifies API status.

### Option B: Dedicated Frontend Dev Server
Run the existing mock frontend server alongside the backend:
```bash
# Terminal 1: Frontend mock server (Port 3000)
npm run dev

# Terminal 2: Backend server (Port 4000)
npm run dev:backend
```

---

## 7. Troubleshooting Atlas Connection Failures

If the backend fails to connect to MongoDB Atlas, it will display a connection checklist:

1. **Atlas Network Access (IP Whitelist)**:
   - Check if your external IP address changed. Go to Atlas **Network Access** and update IP.
2. **Authentication & URL Encoding**:
   - Verify username and password. Special characters (e.g. `@`, `#`, `$`, `/`) in passwords must be URL-encoded (e.g., `Pass#123` -> `Pass%23123`).
3. **Cluster Status**:
   - Free tier clusters pause after prolonged inactivity. Log into MongoDB Atlas and check if the cluster is in **Paused** state. Click **Resume** if needed.
4. **DNS / Firewall Blocking SRV Records**:
   - Some corporate or mobile hotspots block SRV DNS lookups (`mongodb+srv://`).
   - Fix: In Atlas, click **Connect > Drivers > Standard Connection String** to obtain the non-SRV `mongodb://node1,node2,node3/...` format and update `MONGODB_URI`.
5. **Missing Database Name**:
   - If your URI looks like `mongodb+srv://user:pass@cluster0.abcde.mongodb.net/?retryWrites=true`, add `/workcred` before the query parameters.
