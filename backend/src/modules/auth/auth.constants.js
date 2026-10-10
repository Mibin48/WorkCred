/**
 * WorkCred Auth Module Timing Constants & Rules
 */

export const AUTH_CONSTANTS = {
  ACCESS_TOKEN_LIFETIME_MS: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN_LIFETIME_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  FAMILY_MAX_LIFETIME_MS: 90 * 24 * 60 * 60 * 1000, // 90 days absolute session cap
  REUSE_GRACE_WINDOW_MS: 10 * 1000, // 10 seconds concurrent refresh race window
  OTP_LIFETIME_MS: 5 * 60 * 1000, // 5 minutes
  OTP_RESEND_COOLDOWN_MS: 30 * 1000, // 30 seconds
  MAX_OTP_PER_10MIN: 3,
  MAX_OTP_PER_DAY: 10,
  MAX_OTP_ATTEMPTS: 5,
  REFRESH_COOKIE_NAME: 'wc_rt',
};
