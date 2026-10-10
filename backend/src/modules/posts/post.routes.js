/**
 * WorkCred Work Posts Routes
 */

import express from 'express';
import { handleCreatePost, handleGetMyPosts, handleDeletePost } from './post.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requireProfileComplete } from '../../middleware/requireProfileComplete.js';
import { idempotency } from '../../middleware/idempotency.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const postRouter = express.Router();

postRouter.post(
  '/',
  authenticate,
  requireRole('worker'),
  requireProfileComplete,
  idempotency,
  asyncHandler(handleCreatePost)
);

postRouter.get(
  '/mine',
  authenticate,
  requireRole('worker'),
  asyncHandler(handleGetMyPosts)
);

postRouter.delete(
  '/:id',
  authenticate,
  requireRole('worker'),
  asyncHandler(handleDeletePost)
);
