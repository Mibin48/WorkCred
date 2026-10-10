/**
 * WorkCred Booking Lifecycle & Double Handshake Service
 * Direct & Radar bookings, state transitions via /shared/stateMachine,
 * atomic 5-attempt handshake lockouts, SHA-256 ledger chaining, and privacy projection.
 */

import { Booking } from '../../models/Booking.js';
import { User } from '../../models/User.js';
import { Job } from '../../models/Job.js';
import { Availability } from '../../models/Availability.js';
import { PassportEntry } from '../../models/PassportEntry.js';
import { withTransaction } from '../../config/db.js';
import { transition } from '../../../../shared/stateMachine.js';
import { GENESIS_HASH, computeEntryHash } from '../../../../shared/hash.js';
import { haversineKm, roundedDistanceLabel } from '../../../../shared/geo.js';
import { recomputeRateStatsAfterBooking } from '../compass/compass.internal.js';
import { realtimeEmitter } from '../../realtime/events.js';
import { EVENT_NAMES } from '../../../../shared/constants.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';
import { randomDigits, constantTimeCompare } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

/**
 * Customer initiates a direct or Free-Now booking.
 */
export async function createBooking(customerId, body) {
  const { workerId, scheduledAt: rawScheduledAt, hours: rawHours = 4, note = '', source = 'direct' } = body;

  if (workerId === customerId) {
    throw new AppError('VALIDATION_ERROR', 'You cannot book yourself.', 400);
  }

  // Rate limit: 20 bookings per customer per hour
  const oneHourAgo = new Date(clock.now() - 60 * 60 * 1000);
  const hourlyBookingCount = await Booking.countDocuments({
    customerId,
    createdAt: { $gte: oneHourAgo },
  });
  if (hourlyBookingCount >= 20) {
    throw new AppError('RATE_LIMITED', 'Booking rate limit (20 bookings/hour) reached. Please wait before booking again.', 429);
  }

  const hours = Math.min(12, Math.max(1, Number(rawHours) || 4));
  const scheduledAt = rawScheduledAt ? new Date(rawScheduledAt) : null;
  const now = clock.toDate();

  return withTransaction(async (session) => {
    // 1. Take worker lock to serialize concurrent bookings on this worker
    const worker = await User.findOneAndUpdate(
      { _id: workerId },
      { $inc: { bookingVersion: 1 } },
      { session, new: true }
    );

    if (!worker || worker.role !== 'worker' || !worker.isActive) {
      throw new AppError('NOT_FOUND', 'Worker not found or inactive.', 404);
    }
    if (!worker.profileComplete) {
      throw new AppError('VALIDATION_ERROR', 'Cannot book a worker whose profile is incomplete.', 400);
    }

    const customer = await User.findById(customerId).session(session);
    if (!customer) {
      throw new AppError('UNAUTHENTICATED', 'Customer not found.', 401);
    }

    // 2. Validate Free-Now availability if source === 'freenow'
    if (source === 'freenow') {
      const activeAvail = await Availability.findOne({
        workerId,
        active: true,
        expiresAt: { $gt: now },
      }).session(session);

      if (!activeAvail) {
        throw new AppError('NOT_AVAILABLE', 'Worker is no longer active on Free-Now radar.', 409);
      }
    }

    // 3. Calendar & weekly pattern checks
    if (scheduledAt) {
      const dateStr = scheduledAt.toISOString().slice(0, 10);
      if (worker.blockedDates?.includes(dateStr)) {
        throw new AppError('ALREADY_BOOKED', 'This worker has marked this date as blocked in their calendar.', 409);
      }
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[scheduledAt.getDay()];
      if (worker.calendar && worker.calendar[dayOfWeek] === 'off') {
        throw new AppError('ALREADY_BOOKED', `This worker is off on ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}s.`, 409);
      }

      // 4. Overlap rule: pending, confirmed, and in_progress bookings all block the slot
      const scheduledEnd = new Date(scheduledAt.getTime() + hours * 3600000);
      const conflict = await Booking.findOne({
        workerId,
        status: { $in: ['pending', 'confirmed', 'in_progress'] },
        scheduledAt: { $ne: null },
        $expr: {
          $and: [
            { $lt: ['$scheduledAt', scheduledEnd] },
            { $gt: [{ $add: ['$scheduledAt', { $multiply: ['$hours', 3600000] }] }, scheduledAt] },
          ],
        },
      }).session(session);

      if (conflict) {
        throw new AppError('ALREADY_BOOKED', 'This worker is already busy at that time. Please pick another time.', 409);
      }
    }

    // 5. Compute rate: hourly or daily/8
    const agreedRate = worker.rateUnit === 'hour'
      ? (worker.rate || 100)
      : Math.round((worker.rate || 800) / 8);

    // Copy customer location as booking location
    const bookingLocation = customer.location || {
      type: 'Point',
      coordinates: [73.8567, 18.5204],
    };

    // 6. Generate 4-digit codes & insert booking
    const startCode = randomDigits(4);
    const finishCode = randomDigits(4);

    const booking = new Booking({
      customerId,
      workerId,
      source,
      skill: worker.mainSkill || worker.skills?.[0] || 'helper',
      status: 'pending',
      rate: worker.rate || 500,
      rateUnit: worker.rateUnit || 'day',
      agreedRate,
      scheduledAt: scheduledAt || now,
      hours,
      location: bookingLocation,
      note: String(note || '').trim(),
      createdAt: clock.toDate(),
    });
    booking.setCodes(startCode, finishCode);

    await booking.save({ session });

    session.afterCommit = () => {
      realtimeEmitter.emit(
        EVENT_NAMES.BOOKING_REQUEST,
        {
          booking: {
            id: booking.id,
            customerId,
            workerId,
            skill: booking.skill,
            status: 'pending',
            scheduledAt: booking.scheduledAt,
          },
        },
        { userIds: [workerId] }
      );

      logger.info({
        event: 'booking_created',
        bookingId: booking.id,
        customerId,
        workerId,
        source,
      });
    };

    return { booking: formatBookingForParty(booking, customerId, 'customer', worker, customer) };
  });
}

/**
 * Worker confirms an incoming pending booking.
 */
export async function confirmBooking(workerId, bookingId) {
  return withTransaction(async (session) => {
    // 1. Take worker lock
    await User.findOneAndUpdate(
      { _id: workerId },
      { $inc: { bookingVersion: 1 } },
      { session }
    );

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }
    if (booking.workerId !== workerId) {
      throw new AppError('FORBIDDEN', 'You do not own this booking.', 403);
    }

    // 2. Validate transition via /shared/stateMachine
    const nextStatus = transition(booking, 'confirm', 'worker');

    // 3. Re-check overlap at confirm time
    if (booking.scheduledAt) {
      const scheduledEnd = new Date(booking.scheduledAt.getTime() + (booking.hours || 1) * 3600000);
      const conflict = await Booking.findOne({
        _id: { $ne: booking._id },
        workerId,
        status: { $in: ['confirmed', 'in_progress'] },
        scheduledAt: { $ne: null },
        $expr: {
          $and: [
            { $lt: ['$scheduledAt', scheduledEnd] },
            { $gt: [{ $add: ['$scheduledAt', { $multiply: ['$hours', 3600000] }] }, booking.scheduledAt] },
          ],
        },
      }).session(session);

      if (conflict) {
        throw new AppError('ALREADY_BOOKED', 'You already have confirmed work at this time.', 409);
      }
    }

    // 4. Update booking atomically
    booking.status = nextStatus;
    booking.confirmedAt = clock.toDate();
    await booking.save({ session });

    // 5. Deactivate Free-Now availability if source === 'freenow' or active window
    if (booking.source === 'freenow') {
      await Availability.updateMany(
        { workerId, active: true },
        { active: false },
        { session }
      );
    }

    const customer = await User.findById(booking.customerId).session(session);
    const worker = await User.findById(workerId).session(session);

    session.afterCommit = () => {
      if (booking.source === 'freenow') {
        realtimeEmitter.emit(EVENT_NAMES.WORKER_BUSY, { workerId }, { userIds: [workerId] });
      }

      realtimeEmitter.emit(
        EVENT_NAMES.BOOKING_CREATED,
        {
          booking: {
            id: booking.id,
            customerId: booking.customerId,
            workerId,
            status: 'confirmed',
          },
        },
        { userIds: [booking.customerId] }
      );

      logger.info({
        event: 'booking_confirmed',
        bookingId: booking.id,
        workerId,
      });
    };

    return { booking: formatBookingForParty(booking, workerId, 'worker', worker, customer) };
  });
}

/**
 * Worker starts booking by submitting customer's 4-digit start code and GPS location.
 */
export async function startBooking(workerId, bookingId, body = {}) {
  const { startCode, lat, lng } = body;
  const now = clock.toDate();
  const nowMs = clock.now();

  const booking = await Booking.findById(bookingId).select('+startCodeEnc');
  if (!booking) {
    throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  }
  if (booking.workerId !== workerId) {
    throw new AppError('FORBIDDEN', 'You are not the assigned worker for this booking.', 403);
  }

  // Check state machine transition
  transition(booking, 'start', 'worker');

  // Check time window: allow starting from 2 hours before scheduledAt
  if (booking.scheduledAt) {
    const earliestStartMs = booking.scheduledAt.getTime() - 2 * 3600000;
    if (nowMs < earliestStartMs) {
      throw new AppError('INVALID_STATE', 'Bookings cannot be started more than 2 hours before scheduled time.', 400);
    }
  }

  // Check lockout
  if (booking.startCodeLockedUntil && booking.startCodeLockedUntil.getTime() > nowMs) {
    const retryAfter = Math.ceil((booking.startCodeLockedUntil.getTime() - nowMs) / 1000);
    throw new AppError('RATE_LIMITED', 'Too many invalid start code attempts. Handshake locked.', 429, { retryAfterSeconds: retryAfter });
  }

  // Atomically increment attempts
  const updatedDoc = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'confirmed' },
    { $inc: { startCodeAttempts: 1 } },
    { new: true }
  ).select('+startCodeEnc');

  if (!updatedDoc) {
    throw new AppError('INVALID_STATE', 'Booking is no longer in confirmed state.', 409);
  }

  const attempts = updatedDoc.startCodeAttempts;
  const decryptedCode = updatedDoc.getDecryptedStartCode();
  const inputCode = String(startCode ?? '').trim();

  const isMatch = constantTimeCompare(inputCode, decryptedCode);

  if (!isMatch) {
    if (attempts >= 5) {
      const lockedUntil = new Date(nowMs + 10 * 60 * 1000);
      await Booking.updateOne({ _id: bookingId }, { startCodeLockedUntil: lockedUntil });
      logger.warn({ event: 'code_lockout', bookingId, type: 'start' });
      throw new AppError('RATE_LIMITED', 'Too many invalid start code attempts. Handshake locked for 10 minutes.', 429, { retryAfterSeconds: 600 });
    }

    const attemptsLeft = Math.max(0, 5 - attempts);
    throw new AppError('INVALID_START_CODE', `Incorrect start code. ${attemptsLeft} attempts remaining.`, 400, { attemptsLeft });
  }

  // Check distance to booking location (> 500m sets soft warning farFromJob flag)
  let farFromJob = false;
  let startedGeo = null;
  if (lat !== undefined && lng !== undefined && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    startedGeo = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    if (booking.location?.coordinates?.length === 2) {
      const bLng = booking.location.coordinates[0];
      const bLat = booking.location.coordinates[1];
      const dist = haversineKm(Number(lat), Number(lng), bLat, bLng);
      if (dist > 0.5) {
        farFromJob = true;
      }
    }
  }

  // Compare-and-set: confirmed -> in_progress
  const confirmedBooking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'confirmed' },
    {
      status: 'in_progress',
      startedAt: now,
      startCodeAttempts: 0,
      startCodeLockedUntil: null,
      startedGeo,
      ...(farFromJob ? { $addToSet: { flags: 'far_from_job' } } : {}),
    },
    { new: true }
  );

  if (!confirmedBooking) {
    throw new AppError('INVALID_STATE', 'Booking status was modified concurrently.', 409);
  }

  // Deactivate any active Free-Now window of this worker
  await Availability.updateMany({ workerId, active: true }, { active: false });
  realtimeEmitter.emit(EVENT_NAMES.WORKER_BUSY, { workerId }, { userIds: [workerId] });

  realtimeEmitter.emit(
    EVENT_NAMES.BOOKING_STARTED,
    {
      booking: {
        id: booking.id,
        customerId: booking.customerId,
        workerId,
        status: 'in_progress',
        startedAt: now,
      },
    },
    { userIds: [booking.customerId] }
  );

  logger.info({
    event: 'booking_started',
    bookingId: booking.id,
    workerId,
    farFromJob,
  });

  const worker = await User.findById(workerId);
  const customer = await User.findById(booking.customerId);

  return {
    booking: formatBookingForParty(confirmedBooking, workerId, 'worker', worker, customer),
    farFromJob,
    distanceWarning: farFromJob,
  };
}

/**
 * Customer finishes booking by submitting customer's 4-digit finish code and rating.
 * Inside ONE transaction: in_progress -> completed, ledger block append, worker passportStats update.
 */
export async function finishBooking(customerId, bookingId, body = {}) {
  const { finishCode, paidCash, rating, comment } = body;
  const nowMs = clock.now();
  const finishedAt = clock.toDate();

  const booking = await Booking.findById(bookingId).select('+finishCodeEnc');
  if (!booking) {
    throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  }
  if (booking.customerId !== customerId) {
    throw new AppError('FORBIDDEN', 'You are not the customer for this booking.', 403);
  }

  // Check state machine transition
  transition(booking, 'finish', 'customer');

  if (paidCash !== true) {
    throw new AppError('PAYMENT_REQUIRED', 'Customer must confirm cash payment was made.', 400);
  }

  // Check lockout
  if (booking.finishCodeLockedUntil && booking.finishCodeLockedUntil.getTime() > nowMs) {
    const retryAfter = Math.ceil((booking.finishCodeLockedUntil.getTime() - nowMs) / 1000);
    throw new AppError('RATE_LIMITED', 'Too many invalid finish code attempts. Handshake locked.', 429, { retryAfterSeconds: retryAfter });
  }

  // Increment attempts atomically
  const updatedDoc = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'in_progress' },
    { $inc: { finishCodeAttempts: 1 } },
    { new: true }
  ).select('+finishCodeEnc');

  if (!updatedDoc) {
    throw new AppError('INVALID_STATE', 'Booking is not in progress.', 409);
  }

  const attempts = updatedDoc.finishCodeAttempts;
  const decryptedCode = updatedDoc.getDecryptedFinishCode();
  const inputCode = String(finishCode ?? '').trim();

  const isMatch = constantTimeCompare(inputCode, decryptedCode);

  if (!isMatch) {
    if (attempts >= 5) {
      const lockedUntil = new Date(nowMs + 10 * 60 * 1000);
      await Booking.updateOne({ _id: bookingId }, { finishCodeLockedUntil: lockedUntil });
      logger.warn({ event: 'code_lockout', bookingId, type: 'finish' });
      throw new AppError('RATE_LIMITED', 'Too many invalid finish code attempts. Handshake locked for 10 minutes.', 429, { retryAfterSeconds: 600 });
    }

    const attemptsLeft = Math.max(0, 5 - attempts);
    throw new AppError('INVALID_FINISH_CODE', `Incorrect finish code. ${attemptsLeft} attempts remaining.`, 400, { attemptsLeft });
  }

  // Calculate hoursWorked with mock's rounding rule (min 1 hour)
  const startedAt = booking.startedAt || new Date(nowMs - 4 * 3600000);
  const hoursWorked = Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 3600000));
  const rateHourly = booking.rateUnit === 'hour' ? (booking.rate || 100) : Math.round((booking.rate || 800) / 8);
  const amountPaid = Math.round(rateHourly * hoursWorked);

  // Execute CAS status update, passport entry chaining, and stats update in transaction with retry
  let retries = 0;
  while (retries < 5) {
    try {
      return await withTransaction(async (session) => {
        // Compare-and-set: in_progress -> completed
        const completedBooking = await Booking.findOneAndUpdate(
          { _id: bookingId, status: 'in_progress' },
          {
            status: 'completed',
            finishedAt,
            hoursWorked,
            amountPaid,
            paidCash: true,
            rating: Number(rating),
            comment: String(comment || '').trim(),
            finishCodeAttempts: 0,
            finishCodeLockedUntil: null,
          },
          { session, new: true }
        );

        if (!completedBooking) {
          throw new AppError('INVALID_STATE', 'Booking has already been completed.', 409);
        }

        // Fetch last passport entry of this worker to chain hashes
        const lastEntry = await PassportEntry.findOne({ workerId: booking.workerId })
          .sort({ seq: -1 })
          .session(session);

        const seq = (lastEntry?.seq || 0) + 1;
        const prevHash = lastEntry?.hash || GENESIS_HASH;

        const fields = {
          bookingId: booking.id,
          workerId: booking.workerId,
          customerId: booking.customerId,
          skill: booking.skill,
          hoursWorked,
          amountPaid,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          rating: Number(rating),
        };

        const hash = await computeEntryHash(prevHash, fields);

        const worker = await User.findById(booking.workerId).session(session);

        const passportEntry = new PassportEntry({
          bookingId: booking.id,
          workerId: booking.workerId,
          seq,
          prevHash,
          hash,
          fields,
          visibility: 'public',
          isMasked: worker?.defaultMaskEmployerNames !== false,
          createdAt: finishedAt,
        });

        await passportEntry.save({ session });

        // Update worker's aggregate passportStats
        const currentStats = worker.passportStats || {};
        const oldJobs = Number(currentStats.jobsCompleted || 0);
        const oldRating = Number(currentStats.avgRating || 5.0);
        const oldHours = Number(currentStats.totalHoursWorked || 0);

        const newJobs = oldJobs + 1;
        const newHours = oldHours + hoursWorked;
        const newRating = Math.round(((oldRating * oldJobs + Number(rating)) / newJobs) * 10) / 10;

        await User.updateOne(
          { _id: booking.workerId },
          {
            $set: {
              'passportStats.jobsCompleted': newJobs,
              'passportStats.totalHoursWorked': newHours,
              'passportStats.avgRating': newRating,
              'passportStats.reviewsCount': newJobs,
            },
          },
          { session }
        );

        const customer = await User.findById(customerId).session(session);

        session.afterCommit = () => {
          // Asynchronous compass rate stats recompute (side effect)
          recomputeRateStatsAfterBooking({
            skill: booking.skill,
            localityKey: customer?.localityKey,
            locality: customer?.area,
            city: customer?.city,
          });

          realtimeEmitter.emit(
            EVENT_NAMES.BOOKING_COMPLETED,
            {
              booking: {
                id: booking.id,
                workerId: booking.workerId,
                status: 'completed',
                rating: Number(rating),
              },
              passportEntry: {
                seq,
                hash,
                recordId: passportEntry.id,
              },
            },
            { userIds: [booking.workerId] }
          );

          logger.info({
            event: 'booking_finished',
            bookingId: booking.id,
            workerId: booking.workerId,
            seq,
            rating,
          });
        };

        return {
          booking: formatBookingForParty(completedBooking, customerId, 'customer', worker, customer),
          passportEntry: {
            seq,
            hash,
            recordId: passportEntry.id,
          },
        };
      });
    } catch (err) {
      if (err.code === 11000 && err.message?.includes('passport_entries_worker_seq_unique')) {
        retries++;
        continue;
      }
      throw err;
    }
  }

  throw new AppError('INTERNAL_ERROR', 'Failed to append passport block due to sequence conflict.', 500);
}

/**
 * Cancel a booking (allowed only before start: pending or confirmed).
 */
export async function cancelBooking(userId, role, bookingId, body = {}) {
  const { reason = '' } = body;

  return withTransaction(async (session) => {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    }
    if (booking.workerId !== userId && booking.customerId !== userId) {
      throw new AppError('FORBIDDEN', 'Access denied to this booking.', 403);
    }

    const nextStatus = transition(booking, 'cancel', role);

    booking.status = nextStatus;
    booking.cancelledAt = clock.toDate();
    booking.cancelledBy = role;
    booking.cancellationReason = String(reason || '').trim();
    await booking.save({ session });

    // Worker cancellation penalty counter
    let penaltyMessage = null;
    if (role === 'worker') {
      const worker = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { cancellationPenaltyCount: 1 } },
        { session, new: true }
      );
      if (worker) {
        penaltyMessage = `You have cancelled ${worker.cancellationPenaltyCount} booking(s). Cancelling often can lower your visibility.`;
      }
    }

    // If booking was from a broadcast job, release slot atomically
    if (booking.jobId) {
      const job = await Job.findOneAndUpdate(
        { _id: booking.jobId, slotsFilled: { $gt: 0 } },
        {
          $inc: { slotsFilled: -1 },
          $pull: { acceptedWorkerIds: booking.workerId },
        },
        { session, new: true }
      );

      if (job && job.status === 'filled') {
        const now = clock.toDate();
        if (!job.scheduledAt || job.scheduledAt > now) {
          job.status = 'open';
          await job.save({ session });

          session.afterCommit = () => {
            if (job.location?.coordinates) {
              const { areaCellsAround } = import('../../../../shared/geo.js');
              const areaKeys = areaCellsAround(job.location.coordinates[1], job.location.coordinates[0], 5);
              realtimeEmitter.emit(EVENT_NAMES.JOB_NEW, { job: { id: job.id } }, { areaKeys });
            }
          };
        }
      }
    }

    const counterpartId = role === 'worker' ? booking.customerId : booking.workerId;
    const worker = await User.findById(booking.workerId).session(session);
    const customer = await User.findById(booking.customerId).session(session);

    session.afterCommit = () => {
      realtimeEmitter.emit(
        EVENT_NAMES.BOOKING_CANCELLED,
        {
          booking: {
            id: booking.id,
            status: 'cancelled',
            cancelledBy: role,
          },
        },
        { userIds: [counterpartId] }
      );

      logger.info({
        event: 'booking_cancelled',
        bookingId: booking.id,
        cancelledBy: role,
      });
    };

    return {
      booking: formatBookingForParty(booking, userId, role, worker, customer),
      penaltyMessage,
    };
  });
}

/**
 * List bookings for authenticated user.
 */
export async function getBookings(userId, role, query = {}) {
  const { status, cursor, limit = 20 } = query;
  const filter = role === 'worker' ? { workerId: userId } : { customerId: userId };

  if (status) {
    if (status === 'upcoming') {
      filter.status = { $in: ['pending', 'confirmed'] };
    } else if (status === 'active') {
      filter.status = 'in_progress';
    } else if (status === 'done') {
      filter.status = { $in: ['completed', 'cancelled', 'no_show'] };
    } else {
      filter.status = status;
    }
  }

  const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
  const list = await Booking.find(filter)
    .sort({ createdAt: -1 })
    .limit(pageSize);

  const counterpartIds = list.map((b) => (role === 'worker' ? b.customerId : b.workerId));
  const counterparts = await User.find({ _id: { $in: counterpartIds } }).select('_id name');
  const counterpartNameMap = new Map();
  counterparts.forEach((c) => {
    counterpartNameMap.set(c.id, c.name ? c.name.trim().split(/\s+/)[0] : 'User');
  });

  const formatted = list.map((b) => {
    const counterpartId = role === 'worker' ? b.customerId : b.workerId;
    const counterpartName = counterpartNameMap.get(counterpartId) || (role === 'worker' ? 'Customer' : 'Worker');

    return {
      id: b.id,
      source: b.source,
      skill: b.skill,
      status: b.status,
      rate: b.rate,
      rateUnit: b.rateUnit,
      agreedRate: b.agreedRate,
      scheduledAt: b.scheduledAt,
      hours: b.hours,
      hoursWorked: b.hoursWorked,
      amountPaid: b.amountPaid,
      rating: b.rating,
      createdAt: b.createdAt,
      counterpartName,
      workerName: role === 'customer' ? counterpartName : undefined,
      customerName: role === 'worker' ? counterpartName : undefined,
    };
  });

  return { bookings: formatted };
}

/**
 * Get detailed booking view for participants.
 */
export async function getBookingById(bookingId, userId, role) {
  // Load booking with encrypted codes (in case customer is viewing)
  const booking = await Booking.findById(bookingId).select('+startCodeEnc +finishCodeEnc');
  if (!booking) {
    throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  }

  // Participants only; 404 for non-participants to prevent existence leakage
  if (booking.customerId !== userId && booking.workerId !== userId) {
    throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  }

  const worker = await User.findById(booking.workerId);
  const customer = await User.findById(booking.customerId);

  return { booking: formatBookingForParty(booking, userId, role, worker, customer) };
}

/**
 * Format and sanitize booking payload according to caller role, status, and privacy rules.
 */
function formatBookingForParty(booking, userId, role, worker, customer) {
  const isCustomer = role === 'customer' || userId === booking.customerId;
  const isWorker = role === 'worker' || userId === booking.workerId;
  const isConfirmedOrActive = ['confirmed', 'in_progress'].includes(booking.status);

  const formatted = {
    id: booking.id,
    source: booking.source,
    jobId: booking.jobId || null,
    workerId: booking.workerId,
    customerId: booking.customerId,
    skill: booking.skill,
    status: booking.status,
    rate: booking.rate,
    rateUnit: booking.rateUnit,
    agreedRate: booking.agreedRate,
    scheduledAt: booking.scheduledAt,
    hours: booking.hours,
    hoursWorked: booking.hoursWorked,
    amountPaid: booking.amountPaid,
    rating: booking.rating,
    comment: booking.comment || '',
    note: booking.note || '',
    startedAt: booking.startedAt,
    finishedAt: booking.finishedAt,
    confirmedAt: booking.confirmedAt,
    cancelledAt: booking.cancelledAt,
    cancelledBy: booking.cancelledBy,
    cancellationReason: booking.cancellationReason || '',
    flags: booking.flags || [],
    createdAt: booking.createdAt,
  };

  // Names (first name only)
  formatted.workerName = worker?.name ? worker.name.trim().split(/\s+/)[0] : 'Worker';
  formatted.customerName = customer?.name ? customer.name.trim().split(/\s+/)[0] : 'Customer';

  // Privacy Rule 1: Handshake Codes
  // Customer sees codes ONLY when confirmed or in_progress. Worker NEVER sees codes in ANY state.
  if (isCustomer && isConfirmedOrActive) {
    formatted.startCode = booking.getDecryptedStartCode();
    formatted.finishCode = booking.getDecryptedFinishCode();
  }

  // Privacy Rule 2: Phone Numbers
  // Real phone revealed only when confirmed or in_progress
  if (isConfirmedOrActive) {
    if (isCustomer && worker?.phone) {
      formatted.workerPhone = worker.phone;
    }
    if (isWorker && customer?.phone) {
      formatted.customerPhone = customer.phone;
    }
  }

  // Privacy Rule 3: Job Site Location
  // Worker sees exact location coordinates only from confirmed onward. Before that, area only.
  if (booking.location) {
    if (isCustomer || (isWorker && isConfirmedOrActive)) {
      formatted.location = booking.location;
    } else {
      formatted.area = customer?.area || worker?.area || 'Local Area';
    }
  }

  // Compute allowed actions from state machine
  formatted.allowedActions = computeAllowedActions(booking.status, isWorker ? 'worker' : 'customer');

  return formatted;
}

/**
 * Compute allowed state actions for the viewing actor.
 */
function computeAllowedActions(status, actor) {
  const actions = [];
  if (actor === 'worker') {
    if (status === 'pending') actions.push('confirm', 'decline', 'cancel');
    if (status === 'confirmed') actions.push('start', 'cancel');
  } else if (actor === 'customer') {
    if (status === 'pending') actions.push('cancel');
    if (status === 'confirmed') actions.push('cancel');
    if (status === 'in_progress') actions.push('finish');
  }
  return actions;
}
