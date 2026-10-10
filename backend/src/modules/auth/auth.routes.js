/**
 * WorkCred Auth Module Routes
 */

import express from 'express';
import {
  handleOtpRequest,
  handleOtpVerify,
  handleRefresh,
  handleLogout,
  verifyCsrf,
} from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { validateOtpRequest, validateOtpVerify } from '../../../../shared/validators.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const authRouter = express.Router();

// Rate Limiters
const otpRequestIpLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many OTP requests from this network. Please try again later.',
});

const otpVerifyIpLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: 'Too many verification attempts from this network. Please try again later.',
});

// Routes
authRouter.post(
  '/otp/request',
  otpRequestIpLimiter,
  validate(validateOtpRequest),
  asyncHandler(handleOtpRequest)
);

authRouter.post(
  '/otp/verify',
  otpVerifyIpLimiter,
  validate(validateOtpVerify),
  asyncHandler(handleOtpVerify)
);

authRouter.post(
  '/refresh',
  verifyCsrf,
  asyncHandler(handleRefresh)
);

authRouter.post(
  '/logout',
  verifyCsrf,
  asyncHandler(handleLogout)
);
