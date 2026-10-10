/**
 * WorkCred Endorsements Routes
 */

import express from 'express';
import { handleAddEndorsement } from './endorsement.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { idempotency } from '../../middleware/idempotency.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const endorsementRouter = express.Router();

endorsementRouter.post(
  '/',
  authenticate,
  requireRole('customer'),
  idempotency,
  asyncHandler(handleAddEndorsement)
);
