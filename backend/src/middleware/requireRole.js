/**
 * WorkCred Role Authorization Middleware
 * Enforces role restrictions with standardized error codes.
 */

import { AppError } from '../../../shared/errors.js';

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('UNAUTHENTICATED', 'Authentication required.', 401));
    }

    if (!req.user.role) {
      return next(new AppError('ROLE_REQUIRED', 'Please select a role (worker or customer) to continue.', 403));
    }

    if (!allowedRoles.includes(req.user.role)) {
      const target = allowedRoles.length === 1 && allowedRoles[0] === 'worker' ? 'workers' : 'customers';
      return next(new AppError('WRONG_ROLE', `Only ${target} can perform this action.`, 403));
    }

    next();
  };
}
