/**
 * WorkCred Feed & Social Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { validatePostCreate, validateEndorsement } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';

export function getFeed(userId, role, query = {}) {
  const db = readDb();
  const { cursor = 0, limit = 15 } = query;

  const followedWorkerIds = db.follows.filter((f) => f.fromUserId === userId).map((f) => f.toUserId);

  let feedItems = [];

  // Posts by followed workers or recent posts
  const posts = db.posts.map((p) => ({
    type: 'post',
    id: p.id,
    item: structuredClone(p),
    createdAt: p.createdAt,
    isFollowed: followedWorkerIds.includes(p.workerId),
  }));
  feedItems.push(...posts);

  if (role === 'worker') {
    const openJobs = db.jobs.filter((j) => j.status === 'open').map((j) => ({
      type: 'open_job',
      id: j.id,
      item: structuredClone(j),
      createdAt: j.createdAt,
    }));
    feedItems.push(...openJobs);
  }

  if (role === 'customer') {
    const now = new Date().toISOString();
    const freeWorkers = db.availability.filter((a) => a.expiresAt > now).map((a) => {
      const worker = db.users.find((u) => u.id === a.workerId);
      return {
        type: 'free_now',
        id: a.id,
        item: { ...structuredClone(a), workerName: worker?.name || 'Worker' },
        createdAt: a.createdAt,
      };
    });
    feedItems.push(...freeWorkers);
  }

  feedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const start = Number(cursor) || 0;
  const pageSize = Math.min(50, Number(limit) || 15);
  const items = feedItems.slice(start, start + pageSize);
  const nextCursor = start + pageSize < feedItems.length ? start + pageSize : null;

  return { feed: items, nextCursor, total: feedItems.length };
}

export function createPost(workerId, body) {
  const errors = validatePostCreate(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const worker = db.users.find((u) => u.id === workerId && u.role === 'worker');
  if (!worker) throw new AppError('WRONG_ROLE', 'Only workers can publish work posts.', 403);

  const { skill, caption, beforePhotoUrl, afterPhotoUrl } = body;

  const newPost = {
    id: `post-${Date.now()}`,
    workerId,
    workerName: worker.name,
    workerArea: worker.area,
    skill,
    caption: caption.trim(),
    beforePhotoUrl: beforePhotoUrl || null,
    afterPhotoUrl: afterPhotoUrl || null,
    likesCount: 0,
    createdAt: new Date().toISOString(),
    isSample: false,
  };

  db.posts.unshift(newPost);
  writeDb(db);

  return { post: structuredClone(newPost) };
}

export function toggleFollow(fromUserId, body) {
  const { toUserId, type = 'follow' } = body;
  if (!toUserId) throw new AppError('VALIDATION_ERROR', 'Target user ID is required.', 400);

  const db = readDb();
  const existingIndex = db.follows.findIndex(
    (f) => f.fromUserId === fromUserId && f.toUserId === toUserId && f.type === type
  );

  let active = false;
  if (existingIndex >= 0) {
    db.follows.splice(existingIndex, 1);
    active = false;
  } else {
    db.follows.push({
      id: `follow-${Date.now()}`,
      fromUserId,
      toUserId,
      type,
      createdAt: new Date().toISOString(),
      isSample: false,
    });
    active = true;
  }

  writeDb(db);
  return { active, type, toUserId };
}

export function addEndorsement(customerId, body) {
  const errors = validateEndorsement(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const { workerId, skill, comment = '' } = body;

  // Verify completed booking exists between customer and worker
  const completedBooking = db.bookings.find(
    (b) => b.customerId === customerId && b.workerId === workerId && b.status === 'completed'
  );

  if (!completedBooking) {
    throw new AppError('DUPLICATE_ENDORSEMENT', 'You can only endorse a worker after a completed booking.', 409);
  }

  const existing = db.endorsements.find(
    (e) => e.customerId === customerId && e.workerId === workerId && e.skill === skill
  );
  if (existing) {
    throw new AppError('DUPLICATE_ENDORSEMENT', 'You have already endorsed this worker for this skill.', 409);
  }

  const endorsement = {
    id: `endorse-${Date.now()}`,
    customerId,
    workerId,
    skill,
    comment: comment.trim(),
    createdAt: new Date().toISOString(),
    isSample: false,
  };

  db.endorsements.unshift(endorsement);
  writeDb(db);

  return { endorsement: structuredClone(endorsement) };
}
