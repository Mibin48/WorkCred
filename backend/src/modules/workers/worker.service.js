/**
 * WorkCred Worker Search & Profile Service
 * $geoNear 2dsphere aggregation with stable 3-mode cursor pagination (distance, rating, price).
 * Strictly omits worker phone number, exact coordinates, and localityKey.
 * Evaluates Free-Now status against clock.toDate(), not just MongoDB TTL.
 */

import { User } from '../../models/User.js';
import { Availability } from '../../models/Availability.js';
import { Follow } from '../../models/Follow.js';
import { Endorsement } from '../../models/Endorsement.js';
import { PassportEntry } from '../../models/PassportEntry.js';
import { Booking } from '../../models/Booking.js';
import { roundedDistanceLabel } from '../../../../shared/geo.js';
import { getInternalCompassStats } from '../compass/compass.internal.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';

/**
 * Encode an opaque base64url cursor.
 */
function encodeCursor(sortValue, id) {
  return Buffer.from(JSON.stringify({ s: sortValue, id })).toString('base64url');
}

/**
 * Decode an opaque base64url cursor.
 */
function decodeCursor(cursorString) {
  if (!cursorString || typeof cursorString !== 'string') return null;
  try {
    const raw = Buffer.from(cursorString, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if ('s' in parsed && 'id' in parsed) return parsed;
  } catch {
    return null;
  }
  return null;
}

/**
 * Search workers with $geoNear and stable cursor pagination.
 */
export async function searchWorkers(query = {}, currentUserId = null) {
  const {
    skill,
    skills,
    q = '',
    minRating = 0,
    minRate = 0,
    maxRate = 99999,
    unit = null,
    sort = 'distance',
    sortBy = null,
    freeNow = 'false',
    cursor = null,
    limit = 20,
  } = query;

  // Resolve coordinates: query params or caller's saved location
  let lat = query.lat !== undefined ? Number(query.lat) : null;
  let lng = query.lng !== undefined ? Number(query.lng) : null;

  const hasExplicitCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  if (!hasExplicitCoords) {
    if (currentUserId) {
      const caller = await User.findById(currentUserId).select('location');
      if (caller?.location?.coordinates?.length === 2) {
        lng = caller.location.coordinates[0];
        lat = caller.location.coordinates[1];
      }
    }
  }

  const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  const searchLat = hasCoords ? lat : 18.5204;
  const searchLng = hasCoords ? lng : 73.8567;

  const radiusKm = Math.min(50, Math.max(1, Number(query.radiusKm) || 10));
  const maxDistanceMeters = hasCoords ? radiusKm * 1000 : 50000000; // Large fallback if no coordinates specified
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
  const sortMode = (sort || sortBy || 'distance').toLowerCase();

  // Parse skill filter
  const selectedSkills = [];
  if (skills) {
    selectedSkills.push(...String(skills).split(',').map((s) => s.trim()).filter(Boolean));
  } else if (skill) {
    selectedSkills.push(String(skill).trim());
  }

  // 1. $geoNear Aggregation Stage
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [searchLng, searchLat] },
        distanceField: 'distanceMeters',
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: {
          role: 'worker',
          isActive: true,
          profileComplete: true,
          ...(currentUserId ? { _id: { $ne: currentUserId } } : {}),
        },
      },
    },
  ];

  // 2. Skill match
  if (selectedSkills.length > 0) {
    pipeline.push({
      $match: {
        skills: { $in: selectedSkills },
      },
    });
  }

  // 3. Text query 'q'
  if (q && String(q).trim().length > 0) {
    const term = String(q).trim();
    const regex = new RegExp(term, 'i');
    pipeline.push({
      $match: {
        $or: [
          { name: regex },
          { skills: { $in: [regex] } },
          { area: regex },
        ],
      },
    });
  }

  // 4. Rate filter (normalized to hourly or specified unit)
  const minR = Number(minRate) || 0;
  const maxR = Number(maxRate) || 99999;
  if (minR > 0 || maxR < 99999) {
    pipeline.push({
      $addFields: {
        computedHourlyRate: {
          $cond: [
            { $eq: ['$rateUnit', 'hour'] },
            { $ifNull: ['$rate', 0] },
            { $divide: [{ $ifNull: ['$rate', 0] }, 8] },
          ],
        },
      },
    });
    pipeline.push({
      $match: {
        computedHourlyRate: { $gte: minR, $lte: maxR },
      },
    });
  }

  // 5. Min rating filter
  const rMin = Number(minRating) || 0;
  if (rMin > 0) {
    pipeline.push({
      $match: {
        'passportStats.avgRating': { $gte: rMin },
      },
    });
  }

  // Run pipeline to fetch raw matched candidates
  const candidates = await User.aggregate(pipeline);

  // Read-time active availability check (active: true and expiresAt > clock.now())
  const candidateIds = candidates.map((c) => c._id);
  const now = clock.toDate();
  const activeAvailDocs = await Availability.find({
    workerId: { $in: candidateIds },
    active: true,
    expiresAt: { $gt: now },
  }).select('workerId expiresAt hours');

  const availMap = new Map();
  for (const a of activeAvailDocs) {
    const remainingMs = a.expiresAt.getTime() - clock.now();
    const remainingHrs = Math.max(1, Math.ceil(remainingMs / 3600000));
    availMap.set(a.workerId, {
      expiresAt: a.expiresAt.toISOString(),
      timeLeft: `Free ${remainingHrs} hrs`,
    });
  }

  // Customer follow/save status
  const savedSet = new Set();
  if (currentUserId) {
    const follows = await Follow.find({
      fromUserId: currentUserId,
      toUserId: { $in: candidateIds },
      type: 'save',
    }).select('toUserId');
    follows.forEach((f) => savedSet.add(f.toUserId));
  }

  // Enrich candidates with display labels and compute sort values
  let formattedWorkers = await Promise.all(
    candidates.map(async (w) => {
      const distanceKm = w.distanceMeters / 1000;
      const isFreeNow = availMap.has(w._id);
      const freeInfo = availMap.get(w._id) || null;

      const hourlyRate = w.rateUnit === 'hour' ? (w.rate || 0) : Math.round((w.rate || 0) / 8);
      const dailyRate = w.rateUnit === 'day' ? (w.rate || 0) : Math.round((w.rate || 0) * 8);

      // Compass verdict chip
      const compass = await getInternalCompassStats({
        skill: w.mainSkill || w.skills?.[0] || 'helper',
        area: w.area,
        city: w.city,
        rate: w.rate,
        rateUnit: w.rateUnit || 'day',
      });

      let sortValue = 0;
      if (sortMode === 'rating') {
        sortValue = Number(w.passportStats?.avgRating || 0);
      } else if (sortMode === 'price') {
        sortValue = hourlyRate;
      } else {
        sortValue = distanceKm;
      }

      return {
        id: w._id,
        name: w.name,
        photoUrl: w.photoUrl || null,
        skills: w.skills || [],
        mainSkill: w.mainSkill || w.skills?.[0] || 'helper',
        rate: w.rate,
        rateUnit: w.rateUnit || 'day',
        hourlyRate,
        dailyRate,
        area: w.area || 'Local',
        city: w.city || 'Pune',
        distanceKm,
        distanceLabel: roundedDistanceLabel(distanceKm),
        rating: Number(w.passportStats?.avgRating || 5.0),
        jobsCompleted: Number(w.passportStats?.jobsCompleted || 0),
        totalHoursWorked: Number(w.passportStats?.totalHoursWorked || 0),
        passportSlug: w.passportSlug || null,
        isFreeNow,
        freeNow: isFreeNow,
        freeNowTimeLeft: freeInfo?.timeLeft || null,
        isSaved: savedSet.has(w._id),
        isSample: Boolean(w.isSample),
        verdict: compass.verdict || 'fair',
        sortValue,
      };
    })
  );

  // Filter by freeNow if requested
  if (String(freeNow) === 'true') {
    formattedWorkers = formattedWorkers.filter((w) => w.isFreeNow);
  }

  // Sort candidates
  if (sortMode === 'rating') {
    formattedWorkers.sort((a, b) => b.sortValue - a.sortValue || a.id.localeCompare(b.id));
  } else if (sortMode === 'price') {
    formattedWorkers.sort((a, b) => a.sortValue - b.sortValue || a.id.localeCompare(b.id));
  } else {
    formattedWorkers.sort((a, b) => a.sortValue - b.sortValue || a.id.localeCompare(b.id));
  }

  // Apply Cursor Pagination
  let startIndex = 0;
  const decoded = decodeCursor(cursor);
  if (decoded) {
    const matchIdx = formattedWorkers.findIndex((w) => {
      if (sortMode === 'rating') {
        if (w.sortValue < decoded.s) return true;
        if (w.sortValue === decoded.s && w.id.localeCompare(decoded.id) > 0) return true;
      } else {
        if (w.sortValue > decoded.s) return true;
        if (w.sortValue === decoded.s && w.id.localeCompare(decoded.id) > 0) return true;
      }
      return false;
    });
    if (matchIdx !== -1) {
      startIndex = matchIdx;
    }
  }

  const pagedItems = formattedWorkers.slice(startIndex, startIndex + pageSize);
  let nextCursor = null;
  if (startIndex + pageSize < formattedWorkers.length) {
    const lastItem = pagedItems[pagedItems.length - 1];
    nextCursor = encodeCursor(lastItem.sortValue, lastItem.id);
  }

  // Strip internal sortValue from response
  const cleanedItems = pagedItems.map(({ sortValue, ...rest }) => rest);

  return {
    workers: cleanedItems,
    nextCursor,
    total: formattedWorkers.length,
  };
}

/**
 * Get detailed worker profile for customer view.
 */
export async function getWorkerDetail(workerId, currentUserId = null) {
  const worker = await User.findOne({ _id: workerId, role: 'worker', isActive: true });
  if (!worker) {
    throw new AppError('NOT_FOUND', 'Worker not found or inactive.', 404);
  }

  // Caller distance calculation
  let distanceKm = 1.0;
  let distanceLabel = '1.0 km away';
  if (currentUserId) {
    const caller = await User.findById(currentUserId).select('location');
    if (caller?.location?.coordinates?.length === 2 && worker.location?.coordinates?.length === 2) {
      const cLng = caller.location.coordinates[0];
      const cLat = caller.location.coordinates[1];
      const wLng = worker.location.coordinates[0];
      const wLat = worker.location.coordinates[1];
      const { haversineKm } = await import('../../../../shared/geo.js');
      distanceKm = haversineKm(cLat, cLng, wLat, wLng);
      distanceLabel = roundedDistanceLabel(distanceKm);
    }
  }

  // Endorsements per skill
  const endorsements = await Endorsement.find({ workerId }).select('skill');
  const endorsementCounts = {};
  for (const skill of worker.skills || []) {
    endorsementCounts[skill] = endorsements.filter((e) => e.skill === skill).length;
  }

  // Follow / Save status
  let savedByMe = false;
  let followedByMe = false;
  if (currentUserId) {
    const follows = await Follow.find({ fromUserId: currentUserId, toUserId: workerId });
    savedByMe = follows.some((f) => f.type === 'save');
    followedByMe = follows.some((f) => f.type === 'follow');
  }

  // Can endorse check: caller is a customer who has a completed booking with this worker
  let canEndorse = false;
  if (currentUserId) {
    const completedCount = await Booking.countDocuments({
      customerId: currentUserId,
      workerId,
      status: 'completed',
    });
    canEndorse = completedCount > 0;
  }

  // Latest 3 visible passport entries with masked employer names
  const entries = await PassportEntry.find({
    workerId,
    visibility: 'public',
  })
    .sort({ seq: -1 })
    .limit(3);

  const customerIds = entries.map((e) => e.fields?.customerId).filter(Boolean);
  const customers = await User.find({ _id: { $in: customerIds } }).select('_id name');
  const customerNameMap = new Map();
  customers.forEach((c) => {
    if (c.name) {
      const parts = c.name.trim().split(/\s+/);
      const masked = parts.length > 1
        ? `${parts[0][0]}*** ${parts[parts.length - 1][0]}.`
        : `${parts[0][0]}***`;
      customerNameMap.set(c.id, masked);
    }
  });

  const passportEntries = entries.map((e) => ({
    id: e._id,
    skill: e.fields?.skill,
    hoursWorked: e.fields?.hoursWorked,
    rating: e.fields?.rating,
    finishedAt: e.fields?.finishedAt,
    customerNameMasked: e.customerNameMasked || e.fields?.customerNameMasked || customerNameMap.get(e.fields?.customerId) || 'Local Customer',
  }));

  // Active Free-Now availability
  const now = clock.toDate();
  const availability = await Availability.findOne({
    workerId,
    active: true,
    expiresAt: { $gt: now },
  });

  // Scheduled busy windows for next 7 days
  const sevenDaysLater = new Date(clock.now() + 7 * 86400000);
  const activeBookings = await Booking.find({
    workerId,
    status: { $in: ['pending', 'confirmed', 'in_progress'] },
    scheduledAt: { $gte: now, $lte: sevenDaysLater },
  }).select('scheduledAt hours');

  const busyWindows = activeBookings.map((b) => ({
    scheduledAt: b.scheduledAt,
    hours: b.hours || 1,
  }));

  return {
    worker: {
      id: worker.id,
      name: worker.name,
      photoUrl: worker.photoUrl || null,
      bio: worker.bio || '',
      skills: worker.skills || [],
      mainSkill: worker.mainSkill || worker.skills?.[0] || 'helper',
      rate: worker.rate,
      rateUnit: worker.rateUnit || 'day',
      hourlyRate: worker.hourlyRate || Math.round((worker.rate || 0) / 8),
      dailyRate: worker.dailyRate || worker.rate || 0,
      area: worker.area || 'Local',
      city: worker.city || 'Pune',
      distanceKm,
      distanceLabel,
      rating: Number(worker.rating || worker.passportStats?.avgRating || 5.0),
      jobsCompleted: Number(worker.jobsCompleted || worker.passportStats?.jobsCompleted || 0),
      totalHoursWorked: Number(worker.totalHoursWorked || worker.passportStats?.totalHoursWorked || 0),
      passportSlug: worker.passportSlug || null,
      isFreeNow: Boolean(availability),
      freeNowTimeLeft: availability ? `Free ${availability.hours} hrs` : null,
      calendar: worker.calendar,
      blockedDates: worker.blockedDates || [],
      busyWindows,
      endorsements: endorsementCounts,
      endorsementsCount: endorsements.length,
      savedByMe,
      followedByMe,
      canEndorse,
      passportEntries,
      isSample: Boolean(worker.isSample),
    },
  };
}
