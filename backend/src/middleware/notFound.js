/**
 * WorkCred 404 Route Not Found Middleware
 * Returns standard JSON response for /api/* routes and 404 text/html for unknown static paths.
 */

import { AppError } from '../../../shared/errors.js';

export function notFound(req, res, next) {
  if (req.originalUrl.startsWith('/api/')) {
    return next(new AppError('NOT_FOUND', `API endpoint ${req.method} ${req.originalUrl} not found.`, 404));
  }

  res.status(404).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>404 Not Found - WorkCred</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;">
  <h1>404 - Page Not Found</h1>
  <p>The page you requested could not be found.</p>
  <a href="/">Go to Homepage</a>
</body>
</html>`);
}
