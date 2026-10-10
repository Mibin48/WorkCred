/**
 * WorkCred Incident & Safety Reporting Routes
 */

import express from 'express';
import { handleCreateReport } from './report.controller.js';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const reportRouter = express.Router();

reportRouter.post('/', optionalAuthenticate, asyncHandler(handleCreateReport));
