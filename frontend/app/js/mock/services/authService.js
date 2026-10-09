/**
 * WorkCred Auth Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { LIMITS } from '../../../../shared/constants.js';
import { validateOtpRequest, validateOtpVerify } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';

export function requestOtp(body) {
  const errors = validateOtpRequest(body);
  if (errors.length > 0) throw new AppError('INVALID_PHONE', errors[0].message, 400, errors);

  const db = readDb();
  const phone = String(body.phone).replace(/\D/g, '').slice(-10);
  const now = Date.now();

  const recent = (db.otpRequests[phone] ?? []).filter((stamp) => stamp > now - 600000);
  if (recent.length >= LIMITS.MAX_OTP_REQUESTS_10MIN) {
    throw new AppError('RATE_LIMITED', 'Too many OTP requests. Please wait 10 minutes before trying again.', 429);
  }

  recent.push(now);
  db.otpRequests[phone] = recent;
  writeDb(db);

  return { phone, expiresIn: 300, resendIn: LIMITS.OTP_RESEND_SECONDS, message: 'Demo code: 123456' };
}

export function verifyOtp(body) {
  const errors = validateOtpVerify(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const phone = String(body.phone).replace(/\D/g, '').slice(-10);
  const code = String(body.code ?? body.otp ?? '').trim();
  const now = Date.now();

  const attempts = Number(db.otpAttempts[phone] ?? 0);
  if (attempts >= LIMITS.MAX_OTP_ATTEMPTS) {
    throw new AppError('RATE_LIMITED', 'Too many failed verification attempts. Account locked temporarily.', 429);
  }

  if (code !== '123456') {
    db.otpAttempts[phone] = attempts + 1;
    writeDb(db);
    const left = Math.max(0, LIMITS.MAX_OTP_ATTEMPTS - (attempts + 1));
    throw new AppError('INVALID_CODE', `Invalid OTP code. ${left} attempts remaining.`, 400, { attemptsLeft: left });
  }

  db.otpAttempts[phone] = 0;
  let user = db.users.find((u) => u.phone === phone);
  if (!user) {
    user = {
      id: `user-${now}`,
      phone,
      name: '',
      role: null,
      skills: [],
      rate: null,
      rateUnit: 'day',
      area: '',
      city: '',
      profileComplete: false,
      isSample: false,
    };
    db.users.push(user);
  }

  const refreshToken = `mock-refresh-${user.id}-${now}`;
  const accessToken = `mock-access-${user.id}-${now}`;
  db.session = { userId: user.id, refreshToken, accessToken };
  writeDb(db);

  return { user: structuredClone(user), accessToken, refreshToken };
}

export function refreshSession(body, currentSessionUserId) {
  const db = readDb();
  const userId = currentSessionUserId || db.session?.userId;
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Session expired. Please log in again.', 401);
  }

  const accessToken = `mock-access-${user.id}-${Date.now()}`;
  db.session = { userId: user.id, refreshToken: db.session?.refreshToken || 'mock-refresh', accessToken };
  writeDb(db);

  return { user: structuredClone(user), accessToken, refreshToken: db.session.refreshToken };
}

export function logout() {
  const db = readDb();
  db.session = null;
  writeDb(db);
  return { message: 'Logged out successfully.' };
}
