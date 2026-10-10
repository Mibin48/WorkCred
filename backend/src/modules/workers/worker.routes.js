/**
 * WorkCred Worker Module Routes
 */

import express from 'express';
import { handleSearchWorkers, handleGetWorkerDetail } from './worker.controller.js';
import { optionalAuthenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const workerRouter = express.Router();

workerRouter.get('/', optionalAuthenticate, asyncHandler(handleSearchWorkers));
workerRouter.get('/:id', optionalAuthenticate, asyncHandler(handleGetWorkerDetail));
