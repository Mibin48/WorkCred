/**
 * WorkCred Work Posts Service
 * Creation with strict Cloudinary ownership and booking linking,
 * cursor-paginated retrieval, and owner deletion with asset destruction.
 */

import { Post } from '../../models/Post.js';
import { User } from '../../models/User.js';
import { Booking } from '../../models/Booking.js';
import { validatePostCreate } from '../../../../shared/validators.js';
import { validateOwnImageUrl, extractPublicIdFromUrl, destroyCloudinaryAsset } from '../../utils/cloudinary.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';
import { logger } from '../../utils/logger.js';

/**
 * Worker publishes a new work post.
 */
export async function createPost(workerId, body = {}) {
  const validationErrors = validatePostCreate(body);
  if (validationErrors.length > 0) {
    throw new AppError('VALIDATION_ERROR', validationErrors[0].message, 400, validationErrors);
  }

  const worker = await User.findById(workerId);
  if (!worker || worker.role !== 'worker') {
    throw new AppError('WRONG_ROLE', 'Only workers can publish work posts.', 403);
  }
  if (!worker.profileComplete) {
    throw new AppError('VALIDATION_ERROR', 'Please complete your profile before creating a work post.', 400);
  }

  const { skill, caption, afterUrl, afterPhotoUrl, beforeUrl, beforePhotoUrl, bookingId, linkedBookingId } = body;
  const targetAfter = afterUrl || afterPhotoUrl;
  const targetBefore = beforeUrl || beforePhotoUrl || null;
  const targetBookingId = bookingId || linkedBookingId || null;

  // Verify skill is in worker's skills
  if (!worker.skills?.includes(skill)) {
    throw new AppError('VALIDATION_ERROR', `You can only publish posts for skills listed in your profile (${worker.skills?.join(', ')}).`, 400);
  }

  // Validate Cloudinary ownership of image URLs
  if (!validateOwnImageUrl(targetAfter, workerId)) {
    throw new AppError('IMAGE_NOT_ALLOWED', 'After-photo URL must be hosted in your own authorized Cloudinary folder.', 400);
  }
  if (targetBefore && !validateOwnImageUrl(targetBefore, workerId)) {
    throw new AppError('IMAGE_NOT_ALLOWED', 'Before-photo URL must be hosted in your own authorized Cloudinary folder.', 400);
  }

  // Check rate limits: 10 posts per day, max 100 posts total
  const oneDayAgo = new Date(clock.now() - 24 * 60 * 60 * 1000);
  const postsLast24h = await Post.countDocuments({ workerId, createdAt: { $gte: oneDayAgo } });
  if (postsLast24h >= 10) {
    throw new AppError('RATE_LIMITED', 'Daily post limit (10 posts/day) reached. Please try again tomorrow.', 429);
  }

  const totalPosts = await Post.countDocuments({ workerId });
  if (totalPosts >= 100) {
    throw new AppError('RATE_LIMITED', 'Maximum post limit (100 active posts) reached. Please delete old posts to create new ones.', 409);
  }

  // Validate linked booking if provided
  let verifiedJob = false;
  if (targetBookingId) {
    const booking = await Booking.findOne({
      _id: targetBookingId,
      workerId,
      status: 'completed',
    });
    if (!booking) {
      throw new AppError('VALIDATION_ERROR', 'Linked job must be a completed job of yours.', 400);
    }

    const existingLinked = await Post.findOne({ bookingId: targetBookingId });
    if (existingLinked) {
      throw new AppError('VALIDATION_ERROR', 'This completed booking is already linked to another post.', 409);
    }
    verifiedJob = true;
  }

  const publicIds = [
    extractPublicIdFromUrl(targetAfter),
    targetBefore ? extractPublicIdFromUrl(targetBefore) : null,
  ].filter(Boolean);

  const post = new Post({
    workerId,
    workerName: worker.name || 'Worker',
    workerArea: worker.area || 'Pune',
    skill,
    caption: caption.trim(),
    afterUrl: targetAfter,
    beforeUrl: targetBefore,
    afterPhotoUrl: targetAfter,
    beforePhotoUrl: targetBefore,
    publicIds,
    bookingId: targetBookingId || undefined,
    linkedBookingId: targetBookingId || undefined,
    verifiedJob,
    location: worker.location || null,
    localityKey: worker.localityKey || null,
    createdAt: clock.toDate(),
  });

  await post.save();

  logger.info({
    event: 'post_created',
    postId: post.id,
    workerId,
    skill,
    verifiedJob,
  });

  return {
    post: {
      id: post.id,
      workerId: post.workerId,
      workerName: post.workerName,
      workerArea: post.workerArea,
      workerPhotoUrl: worker.photoUrl || null,
      passportSlug: worker.passportSlug || null,
      skill: post.skill,
      caption: post.caption,
      afterUrl: post.afterUrl,
      beforeUrl: post.beforeUrl,
      afterPhotoUrl: post.afterUrl,
      beforePhotoUrl: post.beforeUrl,
      bookingId: post.bookingId,
      verifiedJob: post.verifiedJob,
      likesCount: post.likesCount || 0,
      createdAt: post.createdAt.toISOString(),
      isSample: Boolean(post.isSample),
    },
  };
}

/**
 * Worker queries their own published posts.
 */
export async function getMyPosts(workerId, query = {}) {
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const { cursor } = query;

  const filter = { workerId };
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      filter.$or = [
        { createdAt: { $lt: new Date(decoded.t) } },
        { createdAt: new Date(decoded.t), _id: { $lt: decoded.id } },
      ];
    } catch {
      // ignore invalid cursor
    }
  }

  const posts = await Post.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);

  const hasNext = posts.length > limit;
  const items = hasNext ? posts.slice(0, limit) : posts;

  let nextCursor = null;
  if (hasNext) {
    const lastItem = items[items.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ t: lastItem.createdAt.getTime(), id: lastItem.id })
    ).toString('base64url');
  }

  const total = await Post.countDocuments({ workerId });

  return {
    posts: items.map((p) => ({
      id: p.id,
      workerId: p.workerId,
      workerName: p.workerName,
      workerArea: p.workerArea,
      skill: p.skill,
      caption: p.caption,
      afterUrl: p.afterUrl,
      beforeUrl: p.beforeUrl,
      afterPhotoUrl: p.afterUrl,
      beforePhotoUrl: p.beforeUrl,
      bookingId: p.bookingId,
      verifiedJob: p.verifiedJob,
      likesCount: p.likesCount,
      createdAt: p.createdAt.toISOString(),
      isSample: Boolean(p.isSample),
    })),
    nextCursor,
    total,
  };
}

/**
 * Worker deletes their own post, followed by best-effort Cloudinary image destruction.
 */
export async function deletePost(workerId, postId, options = {}) {
  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError('NOT_FOUND', 'Work post not found.', 404);
  }

  if (post.workerId !== workerId) {
    throw new AppError('FORBIDDEN', 'You can only delete your own posts.', 403);
  }

  const publicIdsToDelete = [...(post.publicIds || [])];
  await Post.deleteOne({ _id: postId });

  logger.info({
    event: 'post_deleted',
    postId,
    workerId,
  });

  // Best-effort asset deletion in background
  if (publicIdsToDelete.length > 0) {
    Promise.allSettled(
      publicIdsToDelete.map((pid) => destroyCloudinaryAsset(pid, options))
    ).catch((err) => {
      logger.warn({ msg: 'Background asset deletion error', error: err.message, postId });
    });
  }

  return { message: 'Post deleted successfully.' };
}
