/**
 * WorkCred User Profile Routes
 */

import express from 'express';
import { handleGetMe, handleSetRole, handleUpdateMe } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const userRouter = express.Router();

// All /api/v1/users routes require authentication
userRouter.use(authenticate);

userRouter.get('/me', asyncHandler(handleGetMe));
userRouter.patch('/me/role', asyncHandler(handleSetRole));
userRouter.patch('/me', asyncHandler(handleUpdateMe));
