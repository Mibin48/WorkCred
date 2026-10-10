/**
 * WorkCred Authentication Middleware
 * Validates Bearer JWT access token and loads minimal user identity.
 * Enforces immediate account deactivation and role synchronization.
 */

import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { AppError } from '../../../shared/errors.js';

export async function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHENTICATED', 'Authentication required. Please provide a valid Bearer token.', 401));
  }

  const token = authHeader.slice(7).trim();

  try {
    const claims = await verifyAccessToken(token);

    // Database read for up-to-date role and account status
    const user = await User.findById(claims.userId).select('role isActive name profileComplete phone');

    if (!user) {
      return next(new AppError('UNAUTHENTICATED', 'User session not found. Please log in again.', 401));
    }

    if (user.isActive === false) {
      return next(new AppError('ACCOUNT_DISABLED', 'Your account has been deactivated. Please contact support.', 403));
    }

    req.user = {
      id: user.id,
      role: user.role,
      sessionId: claims.familyId,
      profileComplete: user.profileComplete,
      name: user.name,
      phone: user.phone,
      rawUser: user,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuthenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7).trim();

  try {
    const claims = await verifyAccessToken(token);
    const user = await User.findById(claims.userId).select('role isActive name profileComplete phone');

    if (user && user.isActive !== false) {
      req.user = {
        id: user.id,
        role: user.role,
        sessionId: claims.familyId,
        profileComplete: user.profileComplete,
        name: user.name,
        phone: user.phone,
        rawUser: user,
      };
    }
  } catch {
    // Silently continue for optional auth
  }

  next();
}
