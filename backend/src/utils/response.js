/**
 * WorkCred Standard API Response Utilities
 * Formats API envelopes matching docs/API_CONTRACT.md and /shared/errors.js.
 */

export function ok(res, data = {}, message = '', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message: message || '',
  });
}

export function created(res, data = {}, message = '') {
  return ok(res, data, message, 201);
}
