/**
 * WorkCred Idempotency Middleware
 * MongoDB-backed Idempotency-Key support for state-changing endpoints.
 * Header: Idempotency-Key (8 to 100 characters).
 * Replays stored 2xx responses on duplicated requests with Idempotent-Replay: true.
 * Returns 409 REQUEST_IN_PROGRESS if a concurrent duplicate is processing.
 * Returns 422 IDEMPOTENCY_KEY_REUSED if key is reused with a different body.
 * Removes key on 5xx or unhandled errors so the client can safely retry.
 */

import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { sha256HexSync } from '../utils/crypto.js';
import { AppError } from '../../../shared/errors.js';
import { clock } from '../utils/clock.js';
import { logger } from '../utils/logger.js';

export function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) {
    // Missing header is allowed: request simply runs non-idempotent
    return next();
  }

  const trimmedKey = String(key).trim();
  if (trimmedKey.length < 8 || trimmedKey.length > 100) {
    return next(new AppError('VALIDATION_ERROR', 'Idempotency-Key header must be between 8 and 100 characters.', 400));
  }

  const userId = req.user?.id || req.userId || 'anonymous';
  const route = `${req.method}:${req.baseUrl || ''}${req.path || ''}`;
  const bodyHash = sha256HexSync(JSON.stringify(req.body ?? {}));

  (async () => {
    let idempotencyDoc;
    try {
      // 1. Attempt to claim processing slot
      idempotencyDoc = await IdempotencyKey.create({
        userId,
        key: trimmedKey,
        route,
        bodyHash,
        status: 'processing',
        createdAt: clock.toDate(),
      });
    } catch (err) {
      // Duplicate key: record already exists for { userId, key, route }
      if (err.code === 11000) {
        const existing = await IdempotencyKey.findOne({ userId, key: trimmedKey, route });
        if (!existing) {
          return next(new AppError('INTERNAL_ERROR', 'Idempotency lookup failed.', 500));
        }

        if (existing.bodyHash && existing.bodyHash !== bodyHash) {
          return next(new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key has already been used with a different request payload.', 422));
        }

        if (existing.status === 'processing') {
          res.setHeader('Retry-After', '2');
          return next(new AppError('REQUEST_IN_PROGRESS', 'A request with this idempotency key is currently being processed. Please retry shortly.', 409));
        }

        if (existing.status === 'completed' && existing.response) {
          logger.info({
            event: 'idempotent_replay',
            userId,
            key: trimmedKey,
            route,
          });
          res.setHeader('Idempotent-Replay', 'true');
          res.setHeader('Idempotent-Replayed', 'true');
          return res.status(existing.response.status || 200).json(existing.response.body);
        }
      }
      return next(err);
    }

    // Intercept res.json to capture response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode || 200;
      if (statusCode >= 200 && statusCode < 300) {
        // Save completed 2xx response
        IdempotencyKey.updateOne(
          { _id: idempotencyDoc._id },
          {
            status: 'completed',
            response: {
              status: statusCode,
              body,
            },
          }
        ).catch((updateErr) => {
          logger.error({
            event: 'idempotency_save_error',
            error: updateErr.message,
          });
        });
      } else {
        // Non-2xx response (client error or server error): release key so client can fix & retry
        IdempotencyKey.deleteOne({ _id: idempotencyDoc._id }).catch(() => {});
      }

      return originalJson(body);
    };

    // Clean up if an unhandled error aborts request before completion
    res.on('finish', () => {
      if (res.statusCode >= 500) {
        IdempotencyKey.deleteOne({ _id: idempotencyDoc._id }).catch(() => {});
      }
    });

    next();
  })().catch(next);
}
