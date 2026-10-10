/**
 * WorkCred Follows and Saves Routes
 */

import express from 'express';
import { handleToggleFollow, handleRemoveFollow, handleGetFollows } from './follow.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { idempotency } from '../../middleware/idempotency.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const followRouter = express.Router();

followRouter.post('/', authenticate, idempotency, asyncHandler(handleToggleFollow));
followRouter.get('/', authenticate, asyncHandler(handleGetFollows));
followRouter.delete('/:toId', authenticate, asyncHandler(handleRemoveFollow));
