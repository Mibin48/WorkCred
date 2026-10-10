/**
 * WorkCred Rate Limiter Factory
 * Uses express-rate-limit configured with standard AppError JSON format
 * and Retry-After headers.
 */

import rateLimit from 'express-rate-limit';

export function createRateLimiter({
  windowMs = 60 * 1000,
  max = 100,
  message = 'Too many requests, please try again later.',
  keyGenerator = null,
  skip = null,
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skip || (() => process.env.NODE_ENV === 'test'),
    keyGenerator: keyGenerator || ((req) => req.ip || req.headers['x-forwarded-for'] || 'global-ip'),
    handler: (req, res, _next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: typeof message === 'string' ? message : 'Rate limit exceeded.',
          details: { retryAfter },
        },
      });
    },
  });
}
