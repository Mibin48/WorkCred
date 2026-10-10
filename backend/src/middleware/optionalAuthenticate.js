/**
 * WorkCred Optional Authentication Middleware
 * Populates req.user if a valid Bearer token is provided, without blocking unauthenticated guests.
 */

import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';

export async function optionalAuthenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
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
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }

  next();
}
