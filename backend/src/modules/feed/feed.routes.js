/**
 * WorkCred Activity Feed Routes
 */

import express from 'express';
import { handleGetFeed } from './feed.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const feedRouter = express.Router();

feedRouter.get('/', authenticate, asyncHandler(handleGetFeed));
