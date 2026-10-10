/**
 * WorkCred Activity Feed Aggregation Engine
 * Multi-source geographic radius stream merging jobs, posts, and free-now availability
 * with global stable cursor pagination and strict privacy projections.
 */

import { Post } from '../../models/Post.js';
import { Job } from '../../models/Job.js';
import { Availability } from '../../models/Availability.js';
import { Follow } from '../../models/Follow.js';
import { User } from '../../models/User.js';
import { haversineKm, roundedDistanceLabel } from '../../../../shared/geo.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';

/**
 * Decode opaque base64url cursor.
 */
function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if ('t' in parsed && 'id' in parsed) return parsed;
  } catch {
    return null;
  }
  return null;
}

/**
 * Encode opaque base64url cursor.
 */
function encodeCursor(timestampMs, id, type) {
  return Buffer.from(JSON.stringify({ t: timestampMs, id, type })).toString('base64url');
}

/**
 * Build comparison filter for cursor pagination.
 */
function buildCursorFilter(decoded, timeField = 'createdAt') {
  if (!decoded) return {};
  const cursorDate = new Date(decoded.t);
  return {
    $or: [
      { [timeField]: { $lt: cursorDate } },
      { [timeField]: cursorDate, _id: { $lt: decoded.id } },
    ],
  };
}

/**
 * Query unified real-time feed for user.
 */
export async function getFeed(userId, query = {}) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
  }
  if (!user.profileComplete) {
    throw new AppError('VALIDATION_ERROR', 'Please complete your profile before viewing the feed.', 400);
  }

  // Resolve coordinates: query params or user's saved location
  let lat = query.lat !== undefined ? Number(query.lat) : user.location?.coordinates?.[1] ?? null;
  let lng = query.lng !== undefined ? Number(query.lng) : user.location?.coordinates?.[0] ?? null;

  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError('VALIDATION_ERROR', 'Location coordinates are required to query nearby feed.', 400);
  }

  const radiusKm = Math.min(10, Math.max(1, Number(query.radiusKm) || 5));
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const filterMode = String(query.filter || 'all').toLowerCase();
  const radiusRadians = radiusKm / 6378.1;
  const decoded = decodeCursor(query.cursor);
  const now = clock.toDate();

  // 1. Fetch caller's followed and saved worker sets
  const follows = await Follow.find({ fromUserId: userId }).select('toUserId type');
  const followedWorkerIds = follows.filter((f) => f.type === 'follow').map((f) => f.toUserId);
  const savedWorkerSet = new Set(follows.filter((f) => f.type === 'save').map((f) => f.toUserId));
  const followingWorkerSet = new Set(followedWorkerIds);

  const fetchLimit = limit + 1;
  const rawItems = [];

  // 2. Fetch Posts
  if (filterMode === 'all' || filterMode === 'posts') {
    const postCursorFilter = buildCursorFilter(decoded, 'createdAt');

    // Radius query
    const nearbyPostsQuery = {
      ...postCursorFilter,
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    };

    // Followed workers query (regardless of distance, capped at 200)
    const followedPostsQuery = followedWorkerIds.length > 0 ? {
      ...postCursorFilter,
      workerId: { $in: followedWorkerIds.slice(0, 200) },
    } : null;

    const [nearbyPosts, followedPosts] = await Promise.all([
      Post.find(nearbyPostsQuery).sort({ createdAt: -1, _id: -1 }).limit(fetchLimit),
      followedPostsQuery ? Post.find(followedPostsQuery).sort({ createdAt: -1, _id: -1 }).limit(fetchLimit) : [],
    ]);

    const postMap = new Map();
    [...nearbyPosts, ...followedPosts].forEach((p) => {
      postMap.set(p.id, p);
    });

    postMap.forEach((p) => {
      rawItems.push({
        type: 'post',
        id: p.id,
        timestamp: p.createdAt.getTime(),
        createdAt: p.createdAt,
        raw: p,
      });
    });
  }

  // 3. Fetch Jobs (Workers only)
  if (user.role === 'worker' && (filterMode === 'all' || filterMode === 'jobs')) {
    const jobCursorFilter = buildCursorFilter(decoded, 'createdAt');
    const jobsQuery = {
      ...jobCursorFilter,
      status: 'open',
      $expr: { $gt: [{ $subtract: ['$slotsNeeded', '$slotsFilled'] }, 0] },
      $or: [{ scheduledAt: { $gt: now } }, { scheduledAt: null }],
      ...(user.skills?.length > 0 ? { skill: { $in: user.skills } } : {}),
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    };

    const jobs = await Job.find(jobsQuery).sort({ createdAt: -1, _id: -1 }).limit(fetchLimit);
    jobs.forEach((j) => {
      rawItems.push({
        type: 'open_job',
        id: j.id,
        timestamp: j.createdAt.getTime(),
        createdAt: j.createdAt,
        raw: j,
      });
    });
  }

  // 4. Fetch Free-Now Availability (Customers only)
  if (user.role === 'customer' && (filterMode === 'all' || filterMode === 'freenow' || filterMode === 'free')) {
    const availCursorFilter = buildCursorFilter(decoded, 'startsAt');
    const availQuery = {
      ...availCursorFilter,
      active: true,
      expiresAt: { $gt: now },
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    };

    const avails = await Availability.find(availQuery).sort({ startsAt: -1, _id: -1 }).limit(fetchLimit);
    avails.forEach((a) => {
      rawItems.push({
        type: 'free_now',
        id: a.id,
        timestamp: (a.startsAt || a.createdAt).getTime(),
        createdAt: a.startsAt || a.createdAt,
        raw: a,
      });
    });
  }

  // 5. Merge & Sort items descending by (timestamp, id)
  rawItems.sort((a, b) => {
    if (b.timestamp !== a.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return b.id.localeCompare(a.id);
  });

  // Apply cursor filtering if needed
  let filteredItems = rawItems;
  if (decoded) {
    filteredItems = rawItems.filter((item) => {
      if (item.timestamp < decoded.t) return true;
      if (item.timestamp === decoded.t && item.id < decoded.id) return true;
      return false;
    });
  }

  const hasNext = filteredItems.length > limit;
  const pagedItems = hasNext ? filteredItems.slice(0, limit) : filteredItems;

  let nextCursor = null;
  if (hasNext) {
    const lastItem = pagedItems[pagedItems.length - 1];
    nextCursor = encodeCursor(lastItem.timestamp, lastItem.id, lastItem.type);
  }

  // 6. Batched enrichment for poster details and public cards
  const userIdsToFetch = new Set();
  pagedItems.forEach((it) => {
    if (it.type === 'post') {
      userIdsToFetch.add(it.raw.workerId);
    } else if (it.type === 'open_job') {
      userIdsToFetch.add(it.raw.customerId);
    } else if (it.type === 'free_now') {
      userIdsToFetch.add(it.raw.workerId);
    }
  });

  const usersList = await User.find({ _id: { $in: Array.from(userIdsToFetch) } });
  const userMap = new Map(usersList.map((u) => [u.id, u]));

  // Build finalized response items
  const feed = pagedItems.map((it) => {
    if (it.type === 'post') {
      const p = it.raw;
      const worker = userMap.get(p.workerId);
      return {
        type: 'post',
        id: p.id,
        item: {
          id: p.id,
          workerId: p.workerId,
          workerName: worker?.name || p.workerName || 'Worker',
          workerArea: worker?.area || p.workerArea || 'Pune',
          workerPhotoUrl: worker?.photoUrl || null,
          passportSlug: worker?.passportSlug || null,
          skill: p.skill,
          caption: p.caption,
          afterUrl: p.afterUrl || p.afterPhotoUrl,
          beforeUrl: p.beforeUrl || p.beforePhotoUrl || null,
          afterPhotoUrl: p.afterUrl || p.afterPhotoUrl,
          beforePhotoUrl: p.beforeUrl || p.beforePhotoUrl || null,
          verifiedJob: Boolean(p.verifiedJob),
          likesCount: p.likesCount || 0,
          isSaved: savedWorkerSet.has(p.workerId),
          isFollowing: followingWorkerSet.has(p.workerId),
          createdAt: p.createdAt.toISOString(),
          isSample: Boolean(p.isSample),
        },
        createdAt: p.createdAt.toISOString(),
      };
    }

    if (it.type === 'open_job') {
      const j = it.raw;
      const customer = userMap.get(j.customerId);
      let customerFirstName = 'Customer';
      if (customer?.name) {
        customerFirstName = customer.name.trim().split(/\s+/)[0];
      }

      let dist = null;
      let distLabel = null;
      if (j.location?.coordinates?.length === 2) {
        dist = haversineKm(lat, lng, j.location.coordinates[1], j.location.coordinates[0]);
        distLabel = roundedDistanceLabel(dist);
      }

      return {
        type: 'open_job',
        id: j.id,
        item: {
          id: j.id,
          title: j.title,
          skill: j.skill,
          description: j.description || '',
          offeredRate: j.offeredRate || j.rate,
          rate: j.offeredRate || j.rate,
          rateUnit: j.rateUnit || 'day',
          workersNeeded: j.workersNeeded || j.slotsNeeded || 1,
          slotsLeft: Math.max(0, (j.slotsNeeded ?? 1) - (j.slotsFilled ?? 0)),
          hours: j.hours || j.hoursPerWorker || 8,
          scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
          area: j.area || 'Pune',
          city: j.city || 'Pune',
          customerName: customerFirstName,
          distanceKm: dist,
          distanceLabel: distLabel,
          createdAt: j.createdAt.toISOString(),
          isSample: Boolean(j.isSample),
        },
        createdAt: j.createdAt.toISOString(),
      };
    }

    if (it.type === 'free_now') {
      const a = it.raw;
      const worker = userMap.get(a.workerId);

      let dist = null;
      let distLabel = null;
      if (a.location?.coordinates?.length === 2) {
        dist = haversineKm(lat, lng, a.location.coordinates[1], a.location.coordinates[0]);
        distLabel = roundedDistanceLabel(dist);
      }

      const rating = Number(worker?.passportStats?.avgRating || 5.0);
      const jobsCompleted = Number(worker?.passportStats?.jobsCompleted || 0);

      return {
        type: 'free_now',
        id: a.id,
        item: {
          id: a.id,
          workerId: a.workerId,
          workerName: worker?.name || 'Worker',
          workerPhotoUrl: worker?.photoUrl || null,
          skill: a.skill,
          rate: a.rate,
          rateUnit: a.rateUnit,
          hours: a.hours,
          expiresAt: a.expiresAt.toISOString(),
          rating,
          jobsCompleted,
          passportSlug: worker?.passportSlug || null,
          isSaved: savedWorkerSet.has(a.workerId),
          distanceKm: dist,
          distanceLabel: distLabel,
          createdAt: (a.startsAt || a.createdAt).toISOString(),
          isSample: Boolean(a.isSample),
        },
        createdAt: (a.startsAt || a.createdAt).toISOString(),
      };
    }

    return null;
  }).filter(Boolean);

  return {
    feed,
    nextCursor,
    total: feed.length,
  };
}
