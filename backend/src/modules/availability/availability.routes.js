/**
 * WorkCred Availability (Free-Now Radar) Routes
 */

import express from 'express';
import { Availability } from '../../models/Availability.js';
import { User } from '../../models/User.js';
import { searchWorkers } from '../workers/worker.service.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ok } from '../../utils/response.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { clock } from '../../utils/clock.js';
import { localityKey } from '../../../../shared/geo.js';
import { realtimeEmitter } from '../../realtime/events.js';
import { EVENT_NAMES } from '../../../../shared/constants.js';
import { AppError } from '../../../../shared/errors.js';

export const availabilityRouter = express.Router();

// 1. Worker sets/extends Free Now availability
availabilityRouter.post(
  '/',
  authenticate,
  requireRole('worker'),
  asyncHandler(async (req, res) => {
    const worker = await User.findById(req.user.id);
    if (!worker) {
      throw new AppError('UNAUTHENTICATED', 'Worker account not found.', 401);
    }

    const { hours = 2, lat: rawLat, lng: rawLng } = req.body;
    const durationHours = Math.min(8, Math.max(1, Number(hours) || 2));

    let lat = rawLat !== undefined ? Number(rawLat) : worker.location?.coordinates?.[1] ?? 18.5204;
    let lng = rawLng !== undefined ? Number(rawLng) : worker.location?.coordinates?.[0] ?? 73.8567;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      lat = 18.5204;
      lng = 73.8567;
    }

    const locKey = localityKey(lat, lng);
    const startsAt = clock.toDate();
    const expiresAt = new Date(startsAt.getTime() + durationHours * 3600000);

    // Deactivate previous active windows
    await Availability.updateMany({ workerId: worker.id, active: true }, { active: false });

    const doc = new Availability({
      workerId: worker.id,
      hours: durationHours,
      active: true,
      startsAt,
      expiresAt,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      localityKey: locKey,
      skill: worker.mainSkill || worker.skills?.[0] || 'helper',
      rate: worker.rate || 0,
      rateUnit: worker.rateUnit || 'day',
    });
    await doc.save();

    realtimeEmitter.emit(
      EVENT_NAMES.WORKER_FREE,
      {
        workerId: worker.id,
        availability: doc.toJSON(),
      },
      { areaKeys: [locKey] }
    );

    return ok(res, { availability: doc.toJSON() }, 'Free-Now availability activated');
  })
);

// 2. Worker stops Free Now availability
availabilityRouter.delete(
  '/',
  authenticate,
  requireRole('worker'),
  asyncHandler(async (req, res) => {
    const worker = await User.findById(req.user.id);
    await Availability.updateMany({ workerId: req.user.id, active: true }, { active: false });

    const locKey = worker?.localityKey || 'cell_18.50_73.85';
    realtimeEmitter.emit(
      EVENT_NAMES.WORKER_BUSY,
      { workerId: req.user.id },
      { areaKeys: [locKey] }
    );

    return ok(res, { success: true }, 'Free-Now availability stopped');
  })
);

// 3. Worker checks own Free Now status
availabilityRouter.get(
  '/status',
  authenticate,
  requireRole('worker'),
  asyncHandler(async (req, res) => {
    const now = clock.toDate();
    const active = await Availability.findOne({
      workerId: req.user.id,
      active: true,
      expiresAt: { $gt: now },
    });

    return ok(res, { availability: active ? active.toJSON() : null });
  })
);

// 4. Customer finds nearby Free-Now workers
availabilityRouter.get(
  '/nearby',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const result = await searchWorkers(
      {
        ...req.query,
        freeNow: 'true',
      },
      req.user?.id
    );

    return ok(res, {
      workers: result.workers || [],
      total: result.total || (result.workers || []).length,
    });
  })
);
