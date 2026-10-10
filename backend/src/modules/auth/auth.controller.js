/**
 * WorkCred Auth Module Controller
 * Manages HTTP transport, cookie setting/clearing, CSRF origin verification,
 * and responses.
 */

import { requestOtp, verifyOtp, refreshSession, logoutSession } from './auth.service.js';
import { AUTH_CONSTANTS } from './auth.constants.js';
import { ok } from '../../utils/response.js';
import { config } from '../../config/env.js';
import { AppError } from '../../../../shared/errors.js';

export function setRefreshCookie(res, refreshToken) {
  res.cookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_LIFETIME_MS,
    secure: config.NODE_ENV === 'production',
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(AUTH_CONSTANTS.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/v1/auth',
    secure: config.NODE_ENV === 'production',
  });
}

/**
 * Enforce CSRF header and allowed origins on refresh and logout.
 */
export function verifyCsrf(req, _res, next) {
  const customHeader = req.headers['x-requested-with'];
  if (!customHeader || customHeader.toLowerCase() !== 'workcred') {
    return next(new AppError('FORBIDDEN', 'Missing required security header.', 403));
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const appOrigin = config.APP_ORIGIN;

  if (origin && origin !== appOrigin) {
    return next(new AppError('FORBIDDEN', 'Cross-origin request rejected.', 403));
  }

  if (referer && !referer.startsWith(appOrigin)) {
    return next(new AppError('FORBIDDEN', 'Invalid referer header.', 403));
  }

  next();
}

export async function handleOtpRequest(req, res) {
  const result = await requestOtp({ phone: req.body.phone });
  return ok(res, result, 'Code sent');
}

export async function handleOtpVerify(req, res) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  const result = await verifyOtp({
    phone: req.body.phone,
    otp: req.body.otp || req.body.code,
    userAgent,
    ip,
  });

  setRefreshCookie(res, result.refreshToken);

  return ok(
    res,
    {
      accessToken: result.accessToken,
      user: result.user,
    },
    'Verified successfully'
  );
}

export async function handleRefresh(req, res) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const rawRefreshToken = req.cookies?.[AUTH_CONSTANTS.REFRESH_COOKIE_NAME];

  if (!rawRefreshToken) {
    clearRefreshCookie(res);
    throw new AppError('UNAUTHENTICATED', 'No refresh token provided. Please log in again.', 401);
  }

  try {
    const result = await refreshSession({
      rawRefreshToken,
      userAgent,
      ip,
    });

    setRefreshCookie(res, result.newRefreshToken);

    return ok(
      res,
      {
        accessToken: result.accessToken,
        user: result.user,
      },
      'Session refreshed'
    );
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

export async function handleLogout(req, res) {
  const rawRefreshToken = req.cookies?.[AUTH_CONSTANTS.REFRESH_COOKIE_NAME];
  clearRefreshCookie(res);

  if (rawRefreshToken) {
    await logoutSession({ rawRefreshToken });
  }

  return ok(res, { message: 'Logged out successfully.' }, 'Logged out successfully.');
}
