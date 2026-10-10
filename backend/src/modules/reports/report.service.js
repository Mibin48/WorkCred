/**
 * WorkCred Incident & Safety Reporting Service
 * Accepts reports for workers, passports, bookings, and work posts.
 * Includes HMAC-SHA256 IP hashing, user/IP rate limits, and 24h duplicate suppression.
 */

import crypto from 'node:crypto';
import { Report } from '../../models/Report.js';
import { User } from '../../models/User.js';
import { Post } from '../../models/Post.js';
import { Booking } from '../../models/Booking.js';
import { validateReport } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { config } from '../../config/env.js';
import { clock } from '../../utils/clock.js';
import { logger } from '../../utils/logger.js';

function hashIp(ip) {
  const secret = config.JWT_SECRET || 'workcred-report-secret-key';
  return crypto.createHmac('sha256', secret).update(String(ip || '0.0.0.0')).digest('hex');
}

export async function submitReport(caller, body = {}, ip = '127.0.0.1') {
  const validationErrors = validateReport(body);
  if (validationErrors.length > 0) {
    throw new AppError('VALIDATION_ERROR', validationErrors[0].message, 400, validationErrors);
  }

  const { targetType, reason, note = '' } = body;
  const rawTarget = body.target || body.targetId;
  const reporterId = caller?.id || null;
  const ipHash = hashIp(ip);
  const now = clock.toDate();

  // 1. Rate limits
  if (reporterId) {
    const oneDayAgo = new Date(clock.now() - 24 * 3600000);
    const userReports24h = await Report.countDocuments({ reporterId, createdAt: { $gte: oneDayAgo } });
    if (userReports24h >= 10) {
      throw new AppError('RATE_LIMITED', 'You have reached the daily report limit (10 reports/day).', 429);
    }
  }

  const oneHourAgo = new Date(clock.now() - 3600000);
  const ipReports1h = await Report.countDocuments({ ipHash, createdAt: { $gte: oneHourAgo } });
  if (ipReports1h >= 5) {
    throw new AppError('RATE_LIMITED', 'Too many reports from this IP. Please try again in an hour.', 429);
  }

  // 2. Validate target exists
  let targetId = rawTarget;
  if (targetType === 'passport') {
    const worker = await User.findOne({ passportSlug: rawTarget, role: 'worker' });
    if (!worker) {
      throw new AppError('NOT_FOUND', 'Work passport not found.', 404);
    }
    targetId = worker.id;
  } else if (targetType === 'worker') {
    const worker = await User.findOne({ _id: rawTarget, role: 'worker' });
    if (!worker) {
      throw new AppError('NOT_FOUND', 'Worker not found.', 404);
    }
    targetId = worker.id;
  } else if (targetType === 'booking') {
    const booking = await Booking.findById(rawTarget);
    if (!booking) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }
    targetId = booking.id;
  } else if (targetType === 'post') {
    const post = await Post.findById(rawTarget);
    if (!post) {
      throw new AppError('NOT_FOUND', 'Work post not found.', 404);
    }
    if (reporterId && post.workerId === reporterId) {
      throw new AppError('SELF_ACTION_FORBIDDEN', 'You cannot report your own post.', 400);
    }
    targetId = post.id;
  }

  // 3. 24-hour Duplicate Suppression
  const twentyFourHoursAgo = new Date(clock.now() - 24 * 3600000);
  const duplicateQuery = {
    targetType,
    targetId,
    createdAt: { $gte: twentyFourHoursAgo },
    $or: [{ ipHash }],
  };
  if (reporterId) {
    duplicateQuery.$or.push({ reporterId });
  }

  const existingReport = await Report.findOne(duplicateQuery);
  if (existingReport) {
    // Silent suppression: return normal thank-you without storing second row
    return { message: 'Thank you for your report. Our trust & safety team will review it.' };
  }

  const report = new Report({
    targetType,
    targetId,
    reason: String(reason).trim(),
    note: String(note).trim(),
    reporterId,
    ipHash,
    createdAt: now,
  });

  await report.save();

  logger.info({
    event: 'report_submitted',
    reportId: report.id,
    targetType,
    targetId,
    reporterId,
  });

  return { message: 'Thank you for your report. Our trust & safety team will review it.' };
}
