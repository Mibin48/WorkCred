/**
 * WorkCred Express Application
 * Middleware pipeline, security headers, rate limiting, static SPA serving,
 * and /api/v1 health endpoints.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';

import { config } from './config/env.js';
import { isDbReady, isDbConnected } from './config/db.js';
import { httpLogger } from './utils/logger.js';
import { ok } from './utils/response.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const frontendDir = path.resolve(rootDir, 'frontend');

export const app = express();

// Trust Proxy Configuration
if (config.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Request ID & Structured HTTP Logging
app.use(httpLogger);

// Security Headers (Helmet + CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", ...config.APP_ORIGINS, 'https://res.cloudinary.com', 'https://api.cloudinary.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
      },
    },
    hsts: config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  })
);

// Compression & Body Parsers
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(mongoSanitize());

// CORS Configuration
app.use(
  cors({
    origin: config.APP_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Chaos'],
  })
);

// Global Rate Limiting (100 req/min per client IP)
app.use(
  createRateLimiter({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP. Please try again in 60 seconds.',
  })
);

// Security Guard: Forbid direct access to sensitive directories / files
app.use((req, res, next) => {
  const normalized = decodeURIComponent(req.path).toLowerCase();
  if (
    normalized.includes('/.') ||
    normalized.startsWith('/backend') ||
    normalized.startsWith('/docs') ||
    normalized.startsWith('/tests') ||
    normalized.startsWith('/scripts') ||
    normalized.includes('package.json') ||
    normalized.includes('.env') ||
    normalized.includes('node_modules')
  ) {
    return notFound(req, res, next);
  }
  next();
});

// --- Static Asset Serving with Precise Caching ---
app.use(
  express.static(frontendDir, {
    dotfiles: 'ignore',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (
        filePath.includes('/fonts/') ||
        filePath.includes('/images/') ||
        filePath.includes('/icons/') ||
        filePath.endsWith('.woff2') ||
        filePath.endsWith('.webp')
      ) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

// --- API v1 Routes ---
const apiRouter = express.Router();

// Liveness Probe
apiRouter.get('/health', (_req, res) => {
  return ok(
    res,
    {
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
    },
    'WorkCred API service is running.'
  );
});

// Readiness Probe
apiRouter.get('/health/ready', async (_req, res) => {
  const ready = await isDbReady();
  if (!ready) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection is not ready.',
      },
    });
  }
  return ok(
    res,
    {
      status: 'ready',
      database: 'connected',
    },
    'WorkCred API and database are ready.'
  );
});

// Database connectivity guard for all data endpoints
apiRouter.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/health/ready') {
    return next();
  }
  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The database is not reachable. Check your internet connection and the Atlas IP access list, then try again.',
      },
    });
  }
  next();
});

// Feature Routes
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { workerRouter } from './modules/workers/worker.routes.js';
import { jobRouter } from './modules/jobs/job.routes.js';
import { bookingRouter } from './modules/bookings/booking.routes.js';
import { postRouter } from './modules/posts/post.routes.js';
import { followRouter } from './modules/follows/follow.routes.js';
import { endorsementRouter } from './modules/endorsements/endorsement.routes.js';
import { uploadRouter } from './modules/uploads/upload.routes.js';
import { pushRouter } from './modules/push/push.routes.js';
import { feedRouter } from './modules/feed/feed.routes.js';
import { reportRouter } from './modules/reports/report.routes.js';
import { compassRouter } from './modules/compass/compass.routes.js';
import { availabilityRouter } from './modules/availability/availability.routes.js';
import { passportRouter } from './modules/passport/passport.routes.js';

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/workers', workerRouter);
apiRouter.use('/jobs', jobRouter);
apiRouter.use('/bookings', bookingRouter);
apiRouter.use('/posts', postRouter);
apiRouter.use('/follows', followRouter);
apiRouter.use('/endorsements', endorsementRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/push', pushRouter);
apiRouter.use('/feed', feedRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/compass', compassRouter);
apiRouter.use('/availability', availabilityRouter);
apiRouter.use('/passport', passportRouter);

app.use('/api/v1', apiRouter);

// --- Frontend SPA Routing Fallbacks ---
// /p/:slug (Passport public view) - Note: Step 12 will inject dynamic meta tags here
app.get('/p/:slug', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendDir, 'app/index.html'));
});

// /app and /app/* (PWA application shell)
app.get(['/app', '/app/*'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendDir, 'app/index.html'));
});

// Landing Page Root Fallback
app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// 404 & Global Error Handling
app.use(notFound);
app.use(errorHandler);
