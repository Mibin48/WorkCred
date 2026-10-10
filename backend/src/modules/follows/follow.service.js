/**
 * WorkCred Follows and Saves Service
 * Manages following and saving workers with unique caps,
 * toggle & explicit removal semantics, and public worker card listings.
 */

import { Follow } from '../../models/Follow.js';
import { User } from '../../models/User.js';
import { Availability } from '../../models/Availability.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';
import { logger } from '../../utils/logger.js';

/**
 * Toggle or create a follow/save relation.
 */
export async function toggleFollow(fromUserId, body = {}) {
  const toUserId = body.toUserId || body.toId;
  const type = body.type || 'save';

  if (!toUserId || typeof toUserId !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Target worker ID is required.', 400);
  }
  if (!['save', 'follow'].includes(type)) {
    throw new AppError('VALIDATION_ERROR', "Type must be 'save' or 'follow'.", 400);
  }
  if (fromUserId === toUserId) {
    throw new AppError('SELF_ACTION_FORBIDDEN', 'You cannot follow or save yourself.', 400);
  }

  // Target must be an active worker
  const target = await User.findOne({ _id: toUserId, role: 'worker', isActive: true });
  if (!target) {
    throw new AppError('NOT_FOUND', 'Target worker not found or inactive.', 404);
  }

  // Check if relation already exists
  const existing = await Follow.findOne({ fromUserId, toUserId, type });
  if (existing) {
    // Toggle off
    await Follow.deleteOne({ _id: existing._id });
    logger.info({ event: 'follow_removed', fromUserId, toUserId, type });
    return { active: false, type, toUserId };
  }

  // Enforce cap of 500 per type per user
  const count = await Follow.countDocuments({ fromUserId, type });
  if (count >= 500) {
    throw new AppError('RATE_LIMITED', `You have reached the maximum limit of 500 ${type}s.`, 409);
  }

  const newFollow = new Follow({
    fromUserId,
    toUserId,
    type,
    createdAt: clock.toDate(),
  });

  try {
    await newFollow.save();
    logger.info({ event: 'follow_added', fromUserId, toUserId, type });
    return { active: true, type, toUserId };
  } catch (err) {
    if (err.code === 11000) {
      return { active: true, type, toUserId };
    }
    throw err;
  }
}

/**
 * Explicit idempotent deletion of a follow/save relation.
 */
export async function removeFollow(fromUserId, toUserId, type = null) {
  if (!toUserId) {
    throw new AppError('VALIDATION_ERROR', 'Target worker ID is required.', 400);
  }

  const query = { fromUserId, toUserId };
  if (type && ['save', 'follow'].includes(type)) {
    query.type = type;
  }

  await Follow.deleteMany(query);
  logger.info({ event: 'follow_removed_explicit', fromUserId, toUserId, type });
  return { success: true, message: 'Follow or save removed successfully.' };
}

/**
 * Query followed or saved workers list.
 */
export async function getFollows(fromUserId, query = {}) {
  const type = query.type || 'save';
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const { cursor } = query;

  if (!['save', 'follow'].includes(type)) {
    throw new AppError('VALIDATION_ERROR', "Type must be 'save' or 'follow'.", 400);
  }

  const filter = { fromUserId, type };
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      filter.$or = [
        { createdAt: { $lt: new Date(decoded.t) } },
        { createdAt: new Date(decoded.t), _id: { $lt: decoded.id } },
      ];
    } catch {
      // ignore
    }
  }

  const followDocs = await Follow.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);

  const hasNext = followDocs.length > limit;
  const pagedFollows = hasNext ? followDocs.slice(0, limit) : followDocs;

  let nextCursor = null;
  if (hasNext) {
    const lastItem = pagedFollows[pagedFollows.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ t: lastItem.createdAt.getTime(), id: lastItem.id })
    ).toString('base64url');
  }

  const workerIds = pagedFollows.map((f) => f.toUserId);
  const workers = await User.find({ _id: { $in: workerIds }, role: 'worker', isActive: true });
  const workerMap = new Map(workers.map((w) => [w.id, w]));

  const now = clock.toDate();
  const activeAvailDocs = await Availability.find({
    workerId: { $in: workerIds },
    active: true,
    expiresAt: { $gt: now },
  }).select('workerId');
  const freeWorkerSet = new Set(activeAvailDocs.map((a) => a.workerId));

  const resultWorkers = pagedFollows
    .map((f) => {
      const w = workerMap.get(f.toUserId);
      if (!w) return null;
      return {
        id: w.id,
        name: w.name,
        photoUrl: w.photoUrl || null,
        skills: w.skills || [],
        mainSkill: w.mainSkill || w.skills?.[0] || 'helper',
        rate: w.rate,
        rateUnit: w.rateUnit || 'day',
        hourlyRate: w.hourlyRate || (w.rateUnit === 'hour' ? w.rate : Math.round((w.rate || 0) / 8)),
        dailyRate: w.dailyRate || (w.rateUnit === 'day' ? w.rate : (w.rate || 0) * 8),
        area: w.area || 'Local',
        city: w.city || 'Pune',
        rating: Number(w.passportStats?.avgRating || 5.0),
        jobsCompleted: Number(w.passportStats?.jobsCompleted || 0),
        passportSlug: w.passportSlug || null,
        isFreeNow: freeWorkerSet.has(w.id),
        isSample: Boolean(w.isSample),
      };
    })
    .filter(Boolean);

  const total = await Follow.countDocuments({ fromUserId, type });

  return {
    workers: resultWorkers,
    nextCursor,
    total,
  };
}
