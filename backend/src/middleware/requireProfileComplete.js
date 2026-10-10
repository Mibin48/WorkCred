/**
 * WorkCred Profile Completion Guard Middleware
 */

import { AppError } from '../../../shared/errors.js';

export function requireProfileComplete(req, _res, next) {
  if (!req.user) {
    return next(new AppError('UNAUTHENTICATED', 'Authentication required.', 401));
  }

  if (!req.user.profileComplete) {
    return next(
      new AppError(
        'FORBIDDEN',
        'Please complete your profile details (name, locality, skills/rate) before proceeding.',
        403
      )
    );
  }

  next();
}
