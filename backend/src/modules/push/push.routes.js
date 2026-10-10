/**
 * WorkCred Push Subscription Routes
 */

import express from 'express';
import { handleSubscribePush, handleUnsubscribePush } from './push.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const pushRouter = express.Router();

pushRouter.post('/subscribe', authenticate, asyncHandler(handleSubscribePush));
pushRouter.delete('/subscribe', authenticate, asyncHandler(handleUnsubscribePush));
