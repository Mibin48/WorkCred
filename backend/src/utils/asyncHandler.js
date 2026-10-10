/**
 * WorkCred Async Express Route Handler Wrapper
 * Automatically forwards uncaught async rejections to next(err).
 */

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
