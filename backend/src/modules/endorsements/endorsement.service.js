/**
 * WorkCred Endorsements Service
 * Customer skill endorsements guarded by completed bookings and unique index.
 */

import { Endorsement } from '../../models/Endorsement.js';
import { Booking } from '../../models/Booking.js';
import { User } from '../../models/User.js';
import { validateEndorsement } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';
import { logger } from '../../utils/logger.js';

/**
 * Customer endorses a worker for a specific skill.
 */
export async function addEndorsement(customerId, body = {}) {
  const validationErrors = validateEndorsement(body);
  if (validationErrors.length > 0) {
    throw new AppError('VALIDATION_ERROR', validationErrors[0].message, 400, validationErrors);
  }

  const { workerId, skill, comment = '' } = body;

  if (customerId === workerId) {
    throw new AppError('SELF_ACTION_FORBIDDEN', 'You cannot endorse yourself.', 400);
  }

  const customer = await User.findById(customerId);
  if (!customer || customer.role !== 'customer') {
    throw new AppError('WRONG_ROLE', 'Only customers can endorse workers.', 403);
  }

  const worker = await User.findOne({ _id: workerId, role: 'worker', isActive: true });
  if (!worker) {
    throw new AppError('NOT_FOUND', 'Worker not found or inactive.', 404);
  }

  // Prerequisite: customer must have at least one completed booking with this worker for this skill
  const completedBooking = await Booking.findOne({
    customerId,
    workerId,
    skill,
    status: 'completed',
  });

  if (!completedBooking) {
    throw new AppError(
      'DUPLICATE_ENDORSEMENT',
      'You can only endorse a worker after a completed booking for that skill.',
      409
    );
  }

  // Check unique endorsement
  const existing = await Endorsement.findOne({ customerId, workerId, skill });
  if (existing) {
    throw new AppError(
      'DUPLICATE_ENDORSEMENT',
      'You have already endorsed this worker for this skill.',
      409
    );
  }

  const endorsement = new Endorsement({
    customerId,
    workerId,
    skill,
    comment: String(comment || '').trim(),
    createdAt: clock.toDate(),
  });

  try {
    await endorsement.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(
        'DUPLICATE_ENDORSEMENT',
        'You have already endorsed this worker for this skill.',
        409
      );
    }
    throw err;
  }

  const skillCount = await Endorsement.countDocuments({ workerId, skill });

  logger.info({
    event: 'endorsement_added',
    customerId,
    workerId,
    skill,
    skillCount,
  });

  return {
    endorsement: {
      id: endorsement.id,
      customerId: endorsement.customerId,
      workerId: endorsement.workerId,
      skill: endorsement.skill,
      comment: endorsement.comment,
      createdAt: endorsement.createdAt.toISOString(),
      isSample: Boolean(endorsement.isSample),
    },
    skillCount,
  };
}
