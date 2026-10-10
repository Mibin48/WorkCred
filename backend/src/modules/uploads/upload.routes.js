/**
 * WorkCred Upload Signing Routes
 */

import express from 'express';
import { handleSignUpload } from './upload.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const uploadRouter = express.Router();

const uploadSignLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Upload signature rate limit reached (20 per hour). Please try again later.',
  keyGenerator: (req) => req.user?.id || req.ip,
});

uploadRouter.post(
  '/sign',
  authenticate,
  uploadSignLimiter,
  asyncHandler(handleSignUpload)
);
