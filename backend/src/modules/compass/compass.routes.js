/**
 * WorkCred Compass Public Rate Statistics Route
 */

import express from 'express';
import { getInternalCompassStats } from './compass.internal.js';
import { ok } from '../../utils/response.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const compassRouter = express.Router();

compassRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { skill, area, city, localityKey, rate, rateUnit } = req.query;
    const stats = await getInternalCompassStats({
      skill,
      area,
      city,
      localityKey,
      rate: rate !== undefined ? Number(rate) : null,
      rateUnit: rateUnit || 'day',
    });
    return ok(res, stats);
  })
);
