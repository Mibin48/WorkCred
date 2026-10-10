/**
 * WorkCred Authentication Core Service
 * Multi-instance OTP counter windowing, keyed HMAC-SHA256 verification,
 * session family token rotation, and reuse breach mitigation.
 */

import crypto from 'node:crypto';
import { Otp } from '../../models/Otp.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { User } from '../../models/User.js';
import { AUTH_CONSTANTS } from './auth.constants.js';
import { clock } from '../../utils/clock.js';
import { randomDigits, randomToken, sha256HexSync, constantTimeCompare } from '../../utils/crypto.js';
import { signAccessToken } from '../../utils/jwt.js';
import { sendOtpSms } from '../../services/sms/index.js';
import { AppError } from '../../../../shared/errors.js';
import { logger, maskPhone } from '../../utils/logger.js';

/**
 * Normalizes phone numbers to standard 10-digit format.
 */
export function normalizePhone(raw) {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

/**
 * Computes keyed HMAC-SHA256 hash over phone + code.
 */
export function computeKeyedOtpHash(phone, code) {
  const secret = process.env.JWT_ACCESS_SECRET || 'fallback_secret_for_otp_hashing_32_bytes_min';
  return crypto
    .createHmac('sha256', secret)
    .update(`${phone}:${code}`, 'utf8')
    .digest('hex');
}

/**
 * Masks IP addresses for privacy in stored session metadata.
 */
export function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  return ip.slice(0, 8) + '...';
}

/**
 * Request a 6-digit OTP code with multi-instance database counter windows.
 */
export async function requestOtp({ phone: rawPhone }) {
  const phone = normalizePhone(rawPhone);
  const now = clock.now();
  const nowDate = clock.toDate();

  // Find or initialize OTP record
  let otpRecord = await Otp.findOne({ phone });

  if (otpRecord) {
    // 1. Cooldown check: 30 seconds between sends
    const lastSent = otpRecord.lastSentAt ? otpRecord.lastSentAt.getTime() : 0;
    const cooldownElapsed = now - lastSent;
    if (cooldownElapsed < AUTH_CONSTANTS.OTP_RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((AUTH_CONSTANTS.OTP_RESEND_COOLDOWN_MS - cooldownElapsed) / 1000);
      throw new AppError(
        'RATE_LIMITED',
        `Please wait ${retryAfter} seconds before requesting another code.`,
        429,
        { retryAfter }
      );
    }

    // 2. 10-minute window check: max 3 requests
    const windowExpired = !otpRecord.windowExpiresAt || otpRecord.windowExpiresAt.getTime() <= now;
    if (windowExpired) {
      otpRecord.sendCount = 1;
      otpRecord.windowExpiresAt = new Date(now + 10 * 60 * 1000);
    } else {
      if (otpRecord.sendCount >= AUTH_CONSTANTS.MAX_OTP_PER_10MIN) {
        const retryAfter = Math.ceil((otpRecord.windowExpiresAt.getTime() - now) / 1000);
        throw new AppError(
          'RATE_LIMITED',
          'Too many OTP requests. Please wait 10 minutes before trying again.',
          429,
          { retryAfter }
        );
      }
      otpRecord.sendCount += 1;
    }

    // 3. Daily window check: max 10 requests
    const dailyExpired = !otpRecord.dailyExpiresAt || otpRecord.dailyExpiresAt.getTime() <= now;
    if (dailyExpired) {
      otpRecord.dailyCount = 1;
      otpRecord.dailyExpiresAt = new Date(now + 24 * 60 * 60 * 1000);
    } else {
      if (otpRecord.dailyCount >= AUTH_CONSTANTS.MAX_OTP_PER_DAY) {
        const retryAfter = Math.ceil((otpRecord.dailyExpiresAt.getTime() - now) / 1000);
        throw new AppError(
          'RATE_LIMITED',
          'Daily OTP limit reached for this number. Please try again tomorrow.',
          429,
          { retryAfter }
        );
      }
      otpRecord.dailyCount += 1;
    }
  } else {
    otpRecord = new Otp({
      phone,
      sendCount: 1,
      windowExpiresAt: new Date(now + 10 * 60 * 1000),
      dailyCount: 1,
      dailyExpiresAt: new Date(now + 24 * 60 * 60 * 1000),
    });
  }

  // Generate 6-digit numeric OTP code
  const isDevMode = process.env.OTP_MODE === 'dev' && process.env.NODE_ENV !== 'production';
  const code = isDevMode ? (process.env.OTP_DEV_CODE || '123456') : randomDigits(6);

  // Store keyed HMAC-SHA256 hash only
  otpRecord.codeHash = computeKeyedOtpHash(phone, code);
  otpRecord.attempts = 0;
  otpRecord.lastSentAt = nowDate;
  otpRecord.expiresAt = new Date(now + AUTH_CONSTANTS.OTP_LIFETIME_MS);

  await otpRecord.save();

  // Dispatch SMS
  await sendOtpSms(phone, code);

  logger.info({
    event: 'otp_requested',
    phone: maskPhone(phone),
  });

  return {
    expiresInSeconds: 300,
    resendInSeconds: 30,
  };
}

/**
 * Verify 6-digit OTP code, find/create user, and generate session.
 */
export async function verifyOtp({ phone: rawPhone, otp: rawCode, userAgent = 'unknown', ip = 'unknown' }) {
  const phone = normalizePhone(rawPhone);
  const code = String(rawCode ?? '').trim();
  const now = clock.now();

  const isDevBypass =
    process.env.OTP_MODE === 'dev' &&
    process.env.NODE_ENV !== 'production' &&
    code === (process.env.OTP_DEV_CODE || '123456');

  const otpRecord = await Otp.findOne({ phone });

  if (!otpRecord || otpRecord.expiresAt.getTime() < now) {
    if (!isDevBypass) {
      throw new AppError('INVALID_CODE', 'Code expired. Please request a new code.', 400);
    }
  }

  // Check attempt lockout (5 max attempts)
  if (otpRecord && otpRecord.attempts >= AUTH_CONSTANTS.MAX_OTP_ATTEMPTS) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw new AppError(
      'RATE_LIMITED',
      'Too many failed verification attempts. Account locked temporarily.',
      429
    );
  }

  // Compare submitted code hash with stored keyed hash
  const expectedHash = otpRecord ? otpRecord.codeHash : null;
  const submittedHash = computeKeyedOtpHash(phone, code);

  const isMatch = (expectedHash && constantTimeCompare(expectedHash, submittedHash)) || isDevBypass;

  if (!isMatch) {
    if (otpRecord) {
      otpRecord.attempts += 1;
      await otpRecord.save();
    }

    const attemptsCount = otpRecord ? otpRecord.attempts : 1;
    const attemptsLeft = Math.max(0, AUTH_CONSTANTS.MAX_OTP_ATTEMPTS - attemptsCount);

    logger.warn({
      event: 'otp_failed',
      phone: maskPhone(phone),
      attemptsLeft,
    });

    if (attemptsLeft === 0) {
      if (otpRecord) await Otp.deleteOne({ _id: otpRecord._id });
      throw new AppError(
        'RATE_LIMITED',
        'Too many failed verification attempts. Account locked temporarily.',
        429
      );
    }

    throw new AppError(
      'INVALID_CODE',
      `Invalid verification code. ${attemptsLeft} attempts remaining.`,
      400,
      { attemptsLeft }
    );
  }

  // Successful verification -> delete consumed OTP document if exists
  if (otpRecord) {
    await Otp.deleteOne({ _id: otpRecord._id });
  }

  // Race-safe Find or Create User
  let isNew = false;
  let user = await User.findOne({ phone });

  if (!user) {
    try {
      user = await User.create({
        phone,
        name: '',
        role: null,
        skills: [],
        rate: null,
        rateUnit: 'day',
        area: '',
        city: 'Pune',
        profileComplete: false,
        isActive: true,
        isSample: false,
      });
      isNew = true;
    } catch (err) {
      // Handle race condition where user document was created concurrently
      if (err.code === 11000) {
        user = await User.findOne({ phone });
      } else {
        throw err;
      }
    }
  }

  if (user.isActive === false) {
    throw new AppError('ACCOUNT_DISABLED', 'Your account has been deactivated. Please contact support.', 403);
  }

  // Create Session Family & Refresh Token
  const familyId = `fam-${randomToken(16)}`;
  const rawRefreshToken = randomToken(32);
  const tokenHash = sha256HexSync(rawRefreshToken);

  await RefreshToken.create({
    tokenHash,
    userId: user.id,
    familyId,
    familyExpiresAt: new Date(now + AUTH_CONSTANTS.FAMILY_MAX_LIFETIME_MS),
    expiresAt: new Date(now + AUTH_CONSTANTS.REFRESH_TOKEN_LIFETIME_MS),
    userAgent: String(userAgent).slice(0, 120),
    ip: maskIp(ip),
  });

  const accessToken = await signAccessToken({ userId: user.id, familyId });

  logger.info({
    event: 'otp_verified',
    userId: user.id,
    phone: maskPhone(phone),
    isNew,
  });

  logger.info({
    event: 'session_created',
    userId: user.id,
    familyId,
  });

  return {
    user: {
      id: user.id,
      role: user.role,
      isNew,
      profileComplete: user.profileComplete,
      name: user.name || '',
      phone: user.phone,
    },
    accessToken,
    refreshToken: rawRefreshToken,
  };
}

/**
 * Rotate Refresh Token and generate new Access Token.
 * Detects token reuse and enforces 10s grace period for multi-tab races.
 */
export async function refreshSession({ rawRefreshToken, userAgent = 'unknown', ip = 'unknown' }) {
  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    throw new AppError('UNAUTHENTICATED', 'Missing refresh token. Please log in again.', 401);
  }

  const tokenHash = sha256HexSync(rawRefreshToken);
  const tokenRecord = await RefreshToken.findOne({ tokenHash });
  const now = clock.now();

  if (!tokenRecord) {
    throw new AppError('UNAUTHENTICATED', 'Session expired or invalid. Please log in again.', 401);
  }

  // 1. Check absolute 90-day family lifetime
  if (tokenRecord.familyExpiresAt && tokenRecord.familyExpiresAt.getTime() <= now) {
    await RefreshToken.updateMany({ familyId: tokenRecord.familyId }, { isRevoked: true, revokedAt: clock.toDate() });
    throw new AppError('UNAUTHENTICATED', 'Session lifetime (90 days) expired. Please log in again.', 401);
  }

  // 2. Check 30-day token expiration
  if (tokenRecord.expiresAt.getTime() <= now) {
    throw new AppError('UNAUTHENTICATED', 'Session expired. Please log in again.', 401);
  }

  // 3. Reuse / Revocation Check
  if (tokenRecord.isRevoked || tokenRecord.usedAt !== null) {
    const usedAtMs = tokenRecord.usedAt ? tokenRecord.usedAt.getTime() : 0;
    const timeSinceUsed = now - usedAtMs;

    // Multi-tab race tolerance: reuse within 10 seconds returns 401 without revoking family
    if (timeSinceUsed < AUTH_CONSTANTS.REUSE_GRACE_WINDOW_MS && !tokenRecord.isRevoked) {
      throw new AppError('TOKEN_EXPIRED', 'Token refreshed concurrently. Please retry with latest token.', 401);
    }

    // Reuse breach beyond grace period -> Revoke entire token family
    await RefreshToken.updateMany(
      { familyId: tokenRecord.familyId },
      { isRevoked: true, revokedAt: clock.toDate() }
    );

    logger.warn({
      event: 'session_reuse_detected',
      userId: tokenRecord.userId,
      familyId: tokenRecord.familyId,
    });

    throw new AppError('TOKEN_REUSED', 'For your safety, please log in again.', 401);
  }

  // 4. Verify User status
  const user = await User.findById(tokenRecord.userId);
  if (!user || user.isActive === false) {
    await RefreshToken.updateMany(
      { familyId: tokenRecord.familyId },
      { isRevoked: true, revokedAt: clock.toDate() }
    );
    throw new AppError('ACCOUNT_DISABLED', 'Your account has been deactivated. Please contact support.', 403);
  }

  // 5. Rotate: Mark current token as used
  const newRawRefreshToken = randomToken(32);
  const newTokenHash = sha256HexSync(newRawRefreshToken);

  tokenRecord.usedAt = clock.toDate();
  tokenRecord.replacedByHash = newTokenHash;
  await tokenRecord.save();

  // 6. Create new refresh token record in the same family
  await RefreshToken.create({
    tokenHash: newTokenHash,
    userId: user.id,
    familyId: tokenRecord.familyId,
    familyExpiresAt: tokenRecord.familyExpiresAt,
    expiresAt: new Date(now + AUTH_CONSTANTS.REFRESH_TOKEN_LIFETIME_MS),
    userAgent: String(userAgent).slice(0, 120),
    ip: maskIp(ip),
  });

  // 7. Sign new Access Token
  const accessToken = await signAccessToken({ userId: user.id, familyId: tokenRecord.familyId });

  logger.info({
    event: 'session_refreshed',
    userId: user.id,
    familyId: tokenRecord.familyId,
  });

  return {
    user: {
      id: user.id,
      role: user.role,
      isNew: false,
      profileComplete: user.profileComplete,
      name: user.name || '',
      phone: user.phone,
    },
    accessToken,
    newRefreshToken: newRawRefreshToken,
  };
}

/**
 * Logout: Revokes the session family and invalidates tokens.
 */
export async function logoutSession({ rawRefreshToken }) {
  if (rawRefreshToken && typeof rawRefreshToken === 'string') {
    const tokenHash = sha256HexSync(rawRefreshToken);
    const tokenRecord = await RefreshToken.findOne({ tokenHash });
    if (tokenRecord) {
      await RefreshToken.updateMany(
        { familyId: tokenRecord.familyId },
        { isRevoked: true, revokedAt: clock.toDate() }
      );
      logger.info({
        event: 'logout',
        userId: tokenRecord.userId,
        familyId: tokenRecord.familyId,
      });
    }
  }

  return { message: 'Logged out successfully.' };
}
