/**
 * WorkCred JWT Utilities (jose)
 * Signs and verifies HS256 access tokens with strict algorithm pinning,
 * issuer, audience, and expiration claims validation.
 */

import * as jose from 'jose';
import { AppError } from '../../../shared/errors.js';
import { clock } from './clock.js';
import { randomToken } from './crypto.js';

const ISSUER = 'workcred';
const AUDIENCE = 'workcred-app';
const ACCESS_TOKEN_EXPIRY = '15m';

function getSecretKey() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is required to sign/verify JWT tokens.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign an HS256 Access Token.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.familyId
 * @returns {Promise<string>}
 */
export async function signAccessToken({ userId, familyId }) {
  const secretKey = getSecretKey();
  const currentEpochSeconds = Math.floor(clock.now() / 1000);

  const jwt = await new jose.SignJWT({
    sid: familyId,
    jti: randomToken(8),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(currentEpochSeconds)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(secretKey);

  return jwt;
}

/**
 * Verify an Access Token and return its claims.
 * Rejects untrusted algorithms, invalid issuers, mismatched audience, or expired tokens.
 * @param {string} tokenString
 * @returns {Promise<{ userId: string, familyId: string, iat: number, exp: number }>}
 */
export async function verifyAccessToken(tokenString) {
  if (!tokenString || typeof tokenString !== 'string') {
    throw new AppError('UNAUTHENTICATED', 'Missing or invalid access token.', 401);
  }

  const secretKey = getSecretKey();

  try {
    const { payload } = await jose.jwtVerify(tokenString, secretKey, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      clockTolerance: 10, // 10 seconds tolerance for minor clock drift
      currentDate: clock.toDate(),
    });

    return {
      userId: payload.sub,
      familyId: payload.sid,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (err) {
    if (err.code === 'ERR_JWT_EXPIRED') {
      throw new AppError('TOKEN_EXPIRED', 'Access token has expired.', 401);
    }
    throw new AppError('UNAUTHENTICATED', 'Invalid access token.', 401);
  }
}
