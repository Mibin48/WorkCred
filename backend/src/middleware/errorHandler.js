/**
 * WorkCred Centralized Error Handling Middleware
 * Maps errors to standard JSON envelope: { success: false, error: { code, message, details? } }
 * Redacts internal details in 500 responses and logs full error with request ID.
 */

import { AppError } from '../../../shared/errors.js';
import { logger } from '../utils/logger.js';

const DUPLICATE_INDEX_MAP = {
  users_phone_unique: 'PHONE_TAKEN',
  phone_1: 'PHONE_TAKEN',
  users_passport_slug_unique: 'SLUG_TAKEN',
  passportSlug_1: 'SLUG_TAKEN',
  bookings_worker_job_active_unique: 'ALREADY_BOOKED',
  bookings_worker_status_scheduled: 'ALREADY_BOOKED',
  passport_entries_booking_id_unique: 'BOOKING_ALREADY_CHAINED',
  bookingId_1: 'BOOKING_ALREADY_CHAINED',
  passport_entries_worker_seq_unique: 'CONCURRENT_CHAIN_MUTATION',
  availability_worker_active_unique: 'AVAILABILITY_ALREADY_ACTIVE',
  rate_stats_skill_locality_unique: 'DUPLICATE_STAT',
  follows_from_to_type_unique: 'ALREADY_FOLLOWING',
  endorsements_customer_worker_skill_unique: 'DUPLICATE_ENDORSEMENT',
  push_subs_endpoint_unique: 'DUPLICATE_SUBSCRIPTION',
  idempotency_user_key_route_unique: 'IDEMPOTENCY_CONFLICT',
};

export function errorHandler(err, req, res, _next) {
  const reqId = req.id || req.headers['x-request-id'] || 'req-unknown';

  // 1. AppError (Domain/Business Errors)
  if (err instanceof AppError) {
    return res.status(err.status || 400).json({
      success: false,
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // 2. Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    const details = Object.entries(err.errors || {}).map(([field, item]) => ({
      field,
      message: item.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: details[0]?.message || 'Validation failed on input document.',
        details,
      },
    });
  }

  // 3. Mongoose CastError / Invalid ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid format for field '${err.path}'.`,
        details: [{ field: err.path, message: `Invalid format for '${err.path}'.` }],
      },
    });
  }

  // 4. MongoDB Duplicate Key Error (E11000)
  if (err.code === 11000 || err.name === 'MongoServerError' && err.code === 11000) {
    let matchedCode = 'CONFLICT';
    for (const [indexName, errorCode] of Object.entries(DUPLICATE_INDEX_MAP)) {
      if (err.message && err.message.includes(indexName)) {
        matchedCode = errorCode;
        break;
      }
    }
    return res.status(409).json({
      success: false,
      error: {
        code: matchedCode,
        message: 'A record with duplicate unique fields already exists.',
      },
    });
  }

  // 5. Body-Parser Syntax Error (Invalid JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload received in request body.',
      },
    });
  }

  // 6. Payload Too Large (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size (100kb).',
      },
    });
  }

  // 7. Internal Server Error (500) - Never leak stack traces
  logger.error({
    msg: 'Unhandled internal server error',
    reqId,
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal server error occurred. Please try again later.',
    },
  });
}
