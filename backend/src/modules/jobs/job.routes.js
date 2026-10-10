/**
 * WorkCred Job Module Routes
 */

import express from 'express';
import {
  handleCreateJob,
  handleGetOpenJobs,
  handleGetCustomerJobs,
  handleAcceptJob,
  handleCancelJob,
} from './job.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requireProfileComplete } from '../../middleware/requireProfileComplete.js';
import { validate } from '../../middleware/validate.js';
import { validateJobCreate } from '../../../../shared/validators.js';
import { idempotency } from '../../middleware/idempotency.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const jobRouter = express.Router();

// Customer job management
jobRouter.post(
  '/',
  authenticate,
  requireRole('customer'),
  requireProfileComplete,
  idempotency,
  validate(validateJobCreate),
  asyncHandler(handleCreateJob)
);

jobRouter.get(
  '/mine',
  authenticate,
  requireRole('customer'),
  asyncHandler(handleGetCustomerJobs)
);

jobRouter.post(
  '/:id/cancel',
  authenticate,
  requireRole('customer'),
  asyncHandler(handleCancelJob)
);

// Worker job feed & acceptance
jobRouter.get(
  '/',
  authenticate,
  requireRole('worker'),
  requireProfileComplete,
  asyncHandler(handleGetOpenJobs)
);

jobRouter.post(
  '/:id/accept',
  authenticate,
  requireRole('worker'),
  requireProfileComplete,
  idempotency,
  asyncHandler(handleAcceptJob)
);
