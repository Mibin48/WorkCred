/**
 * WorkCred Job Broadcast & Acceptance Service
 * Atomic slot claiming, 20-job/day rate limit, overlap checks, and cancel cascade.
 */

import { Job } from '../../models/Job.js';
import { Booking } from '../../models/Booking.js';
import { User } from '../../models/User.js';
import { withTransaction } from '../../config/db.js';
import { getInternalCompassStats } from '../compass/compass.internal.js';
import { localityKey, roundedDistanceLabel, areaCellsAround } from '../../../../shared/geo.js';
import { realtimeEmitter } from '../../realtime/events.js';
import { EVENT_NAMES } from '../../../../shared/constants.js';
import { AppError } from '../../../../shared/errors.js';
import { clock } from '../../utils/clock.js';
import { randomDigits } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

/**
 * Customer creates a broadcast job.
 */
export async function createJob(customerId, body) {
  const customer = await User.findById(customerId);
  if (!customer) {
    throw new AppError('UNAUTHENTICATED', 'Customer account not found.', 401);
  }

  // Daily limit: max 20 jobs posted per customer per day
  const oneDayAgo = new Date(clock.now() - 24 * 60 * 60 * 1000);
  const dailyJobCount = await Job.countDocuments({
    customerId,
    createdAt: { $gte: oneDayAgo },
  });
  if (dailyJobCount >= 20) {
    throw new AppError('RATE_LIMITED', 'Daily job posting limit (20 jobs) reached. Please try again tomorrow.', 429);
  }

  const {
    title,
    skill,
    description = '',
    area: rawArea,
    city: rawCity,
    lat: rawLat,
    lng: rawLng,
    rate: rawRate,
    offeredRate: rawOfferedRate,
    rateUnit = 'day',
    slotsNeeded: rawSlotsNeeded,
    workersNeeded: rawWorkersNeeded,
    hours: rawHours,
    hoursPerWorker: rawHoursPerWorker,
    scheduledAt: rawScheduledAt,
    startAt: rawStartAt,
  } = body;

  const area = rawArea || customer.area || 'Local';
  const city = rawCity || customer.city || 'Pune';

  let lat = rawLat !== undefined ? Number(rawLat) : null;
  let lng = rawLng !== undefined ? Number(rawLng) : null;
  if ((lat === null || lng === null) && customer.location?.coordinates?.length === 2) {
    lng = customer.location.coordinates[0];
    lat = customer.location.coordinates[1];
  }
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    lat = 18.5204;
    lng = 73.8567;
  }

  const locKey = localityKey(lat, lng);
  const offeredRate = Number(rawOfferedRate ?? rawRate);
  const slotsNeeded = Number(rawWorkersNeeded ?? rawSlotsNeeded ?? 1);
  const hoursPerWorker = Number(rawHours ?? rawHoursPerWorker ?? 8);
  const scheduledAt = rawStartAt ? new Date(rawStartAt) : (rawScheduledAt ? new Date(rawScheduledAt) : null);

  const job = await Job.create({
    customerId,
    title: (title || `${skill.charAt(0).toUpperCase() + skill.slice(1)} Required`).trim(),
    description: String(description || '').trim(),
    skill,
    area,
    city,
    location: { type: 'Point', coordinates: [lng, lat] },
    rate: offeredRate,
    rateUnit,
    slotsNeeded,
    slotsFilled: 0,
    hoursPerWorker,
    scheduledAt,
    status: 'open',
    acceptedWorkerIds: [],
    createdAt: clock.toDate(),
  });

  // Calculate compass fair wage stats
  const compass = await getInternalCompassStats({
    skill,
    area,
    city,
    localityKey: locKey,
    rate: offeredRate,
    rateUnit,
  });

  // Emit job:new event to surrounding 0.05-degree locality cell keys
  const areaKeys = areaCellsAround(lat, lng, 5);
  realtimeEmitter.emit(
    EVENT_NAMES.JOB_NEW,
    {
      job: {
        id: job.id,
        title: job.title,
        skill: job.skill,
        area: job.area,
        city: job.city,
        rate: job.rate,
        rateUnit: job.rateUnit,
        slotsNeeded: job.slotsNeeded,
        scheduledAt: job.scheduledAt,
      },
    },
    { areaKeys }
  );

  logger.info({
    event: 'job_posted',
    jobId: job.id,
    customerId,
    skill,
  });

  return { job: job.toJSON(), compass };
}

/**
 * Worker searches / views open job feed.
 */
export async function getOpenJobs(workerId, query = {}) {
  const worker = await User.findById(workerId);
  if (!worker) {
    throw new AppError('UNAUTHENTICATED', 'Worker not found.', 401);
  }

  let lat = query.lat !== undefined ? Number(query.lat) : null;
  let lng = query.lng !== undefined ? Number(query.lng) : null;
  if ((lat === null || lng === null) && worker.location?.coordinates?.length === 2) {
    lng = worker.location.coordinates[0];
    lat = worker.location.coordinates[1];
  }
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    lat = 18.5204;
    lng = 73.8567;
  }

  const radiusKm = Math.min(10, Math.max(1, Number(query.radiusKm) || worker.radiusKm || 5));
  const maxDistanceMeters = radiusKm * 1000;
  const now = clock.toDate();

  // Find jobs already accepted or declined by this worker
  const activeBookings = await Booking.find({
    workerId,
    jobId: { $ne: null },
    status: { $in: ['pending', 'confirmed', 'in_progress', 'completed'] },
  }).select('jobId');
  const excludedJobIds = new Set(activeBookings.map((b) => b.jobId));

  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: maxDistanceMeters,
        spherical: true,
        query: {
          status: 'open',
          $or: [{ scheduledAt: { $gt: now } }, { scheduledAt: null }],
          ...(excludedJobIds.size > 0 ? { _id: { $nin: Array.from(excludedJobIds) } } : {}),
        },
      },
    },
  ];

  // Match worker skill
  if (query.skill) {
    pipeline.push({ $match: { skill: query.skill } });
  } else if (worker.skills?.length > 0) {
    pipeline.push({ $match: { skill: { $in: worker.skills } } });
  }

  const jobs = await Job.aggregate(pipeline);

  // Fetch customers to show only first name
  const customerIds = jobs.map((j) => j.customerId);
  const customers = await User.find({ _id: { $in: customerIds } }).select('_id name');
  const customerMap = new Map();
  customers.forEach((c) => {
    const firstName = c.name ? c.name.trim().split(/\s+/)[0] : 'Customer';
    customerMap.set(c.id, firstName);
  });

  const formattedJobs = await Promise.all(
    jobs.map(async (j) => {
      const distanceKm = j.distanceMeters / 1000;
      const spotsLeft = Math.max(0, j.slotsNeeded - j.slotsFilled);

      const compass = await getInternalCompassStats({
        skill: j.skill,
        area: j.area,
        city: j.city,
        rate: j.rate,
        rateUnit: j.rateUnit,
      });

      return {
        id: j._id,
        title: j.title,
        skill: j.skill,
        area: j.area,
        city: j.city,
        rate: j.rate,
        rateUnit: j.rateUnit,
        hours: j.hoursPerWorker || 8,
        scheduledAt: j.scheduledAt,
        spotsLeft,
        slotsNeeded: j.slotsNeeded,
        slotsFilled: j.slotsFilled,
        distanceKm,
        distanceLabel: roundedDistanceLabel(distanceKm),
        verdict: compass.verdict || 'fair',
        customerFirstName: customerMap.get(j.customerId) || 'Customer',
        createdAt: j.createdAt,
      };
    })
  );

  const sort = (query.sort || 'nearest').toLowerCase();
  if (sort === 'pay') {
    formattedJobs.sort((a, b) => b.rate - a.rate);
  } else if (sort === 'soonest') {
    formattedJobs.sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0));
  } else {
    formattedJobs.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  return { jobs: formattedJobs };
}

/**
 * Customer gets own posted jobs.
 */
export async function getCustomerJobs(customerId) {
  const jobs = await Job.find({ customerId }).sort({ createdAt: -1 });
  const jobIds = jobs.map((j) => j.id);

  // Summarize accepted bookings per job
  const bookings = await Booking.find({
    jobId: { $in: jobIds },
    status: { $in: ['confirmed', 'in_progress', 'completed'] },
  }).select('jobId workerId status');

  const workerIds = bookings.map((b) => b.workerId);
  const workers = await User.find({ _id: { $in: workerIds } }).select('_id name');
  const workerNameMap = new Map();
  workers.forEach((w) => workerNameMap.set(w.id, w.name ? w.name.trim().split(/\s+/)[0] : 'Worker'));

  const jobBookingMap = new Map();
  bookings.forEach((b) => {
    if (!jobBookingMap.has(b.jobId)) jobBookingMap.set(b.jobId, []);
    jobBookingMap.get(b.jobId).push({
      bookingId: b.id,
      workerId: b.workerId,
      workerName: workerNameMap.get(b.workerId) || 'Worker',
      status: b.status,
    });
  });

  const formatted = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    skill: j.skill,
    area: j.area,
    city: j.city,
    rate: j.rate,
    rateUnit: j.rateUnit,
    status: j.status,
    slotsNeeded: j.slotsNeeded,
    slotsFilled: j.slotsFilled,
    scheduledAt: j.scheduledAt,
    createdAt: j.createdAt,
    acceptedBookings: jobBookingMap.get(j.id) || [],
  }));

  return { jobs: formatted };
}

/**
 * Worker accepts an open job slot (atomic with compare-and-set).
 */
export async function acceptJob(workerId, jobId) {
  const now = clock.toDate();

  return withTransaction(async (session) => {
    // 1. Take worker lock on User document to block parallel operations on this worker
    const worker = await User.findOneAndUpdate(
      { _id: workerId },
      { $inc: { bookingVersion: 1 } },
      { session, new: true }
    );
    if (!worker) {
      throw new AppError('UNAUTHENTICATED', 'Worker account not found.', 401);
    }

    // 2. Load job and inspect status
    const initialJob = await Job.findById(jobId).session(session);
    if (!initialJob) {
      throw new AppError('NOT_FOUND', 'Job not found.', 404);
    }
    if (initialJob.status !== 'open' || (initialJob.scheduledAt && initialJob.scheduledAt <= now)) {
      throw new AppError('JOB_FILLED', 'This job is no longer open.', 409);
    }
    if (initialJob.acceptedWorkerIds?.includes(workerId)) {
      throw new AppError('ALREADY_BOOKED', 'You have already accepted this job.', 409);
    }

    // 3. Worker calendar availability and overlap check
    const scheduledAt = initialJob.scheduledAt;
    const hours = initialJob.hoursPerWorker || 8;
    if (scheduledAt) {
      const dateStr = scheduledAt.toISOString().slice(0, 10);
      if (worker.blockedDates?.includes(dateStr)) {
        throw new AppError('ALREADY_BOOKED', 'This date is marked as blocked in your calendar.', 409);
      }
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[scheduledAt.getDay()];
      if (worker.calendar && worker.calendar[dayOfWeek] === 'off') {
        throw new AppError('ALREADY_BOOKED', `You are marked off on ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}s in your calendar.`, 409);
      }

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
        throw new AppError('ALREADY_BOOKED', 'You already have work at this time.', 409);
      }
    }

    // 4. Atomically claim a slot with compare-and-set
    const updatedJob = await Job.findOneAndUpdate(
      {
        _id: jobId,
        status: 'open',
        slotsFilled: { $lt: initialJob.slotsNeeded },
        $or: [{ scheduledAt: { $gt: now } }, { scheduledAt: null }],
      },
      {
        $inc: { slotsFilled: 1 },
        $push: { acceptedWorkerIds: workerId },
      },
      { session, new: true }
    );

    if (!updatedJob) {
      throw new AppError('JOB_FILLED', 'This job is no longer open.', 409);
    }

    // If job reached capacity, transition status to 'filled'
    let justFilled = false;
    if (updatedJob.slotsFilled >= updatedJob.slotsNeeded) {
      updatedJob.status = 'filled';
      await updatedJob.save({ session });
      justFilled = true;
    }

    // 5. Generate 4-digit codes & insert confirmed booking
    const startCode = randomDigits(4);
    const finishCode = randomDigits(4);

    const booking = new Booking({
      customerId: initialJob.customerId,
      workerId,
      jobId: initialJob.id,
      source: 'job',
      skill: initialJob.skill,
      status: 'confirmed',
      rate: initialJob.rate,
      rateUnit: initialJob.rateUnit,
      agreedRate: initialJob.rate,
      scheduledAt: initialJob.scheduledAt,
      hours,
      location: initialJob.location,
      confirmedAt: clock.toDate(),
      createdAt: clock.toDate(),
    });
    booking.setCodes(startCode, finishCode);

    try {
      await booking.save({ session });
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        throw new AppError('ALREADY_BOOKED', 'You have already accepted this job.', 409);
      }
      throw saveErr;
    }

    // Post-commit side effects: Emit realtime events & logging
    session.afterCommit = () => {
      realtimeEmitter.emit(
        EVENT_NAMES.BOOKING_CREATED,
        {
          booking: {
            id: booking.id,
            jobId: initialJob.id,
            customerId: initialJob.customerId,
            workerId,
            status: 'confirmed',
            scheduledAt: booking.scheduledAt,
          },
        },
        { userIds: [initialJob.customerId] }
      );

      if (justFilled && initialJob.location?.coordinates) {
        const areaKeys = areaCellsAround(initialJob.location.coordinates[1], initialJob.location.coordinates[0], 5);
        realtimeEmitter.emit(EVENT_NAMES.JOB_FILLED, { job: { id: initialJob.id } }, { areaKeys });
      }

      logger.info({
        event: 'job_accepted',
        jobId: initialJob.id,
        bookingId: booking.id,
        workerId,
      });
    };

    return { booking: booking.toJSON() };
  });
}

/**
 * Customer cancels an open job (cascades to un-started bookings).
 */
export async function cancelJob(customerId, jobId) {
  return withTransaction(async (session) => {
    const job = await Job.findById(jobId).session(session);
    if (!job) {
      throw new AppError('NOT_FOUND', 'Job not found.', 404);
    }
    if (job.customerId !== customerId) {
      throw new AppError('FORBIDDEN', 'Only the customer who posted this job can cancel it.', 403);
    }

    // Check if any associated booking is already started or completed
    const activeBooking = await Booking.findOne({
      jobId,
      status: { $in: ['in_progress', 'completed'] },
    }).session(session);
    if (activeBooking) {
      throw new AppError('INVALID_STATE', 'Cannot cancel job because work is already in progress or completed.', 409);
    }

    // Set job to cancelled
    job.status = 'cancelled';
    await job.save({ session });

    // Cancel every non-started booking of this job
    const affectedBookings = await Booking.find({
      jobId,
      status: { $in: ['pending', 'confirmed'] },
    }).session(session);

    await Booking.updateMany(
      { jobId, status: { $in: ['pending', 'confirmed'] } },
      {
        status: 'cancelled',
        cancelledAt: clock.toDate(),
        cancelledBy: 'customer',
        cancellationReason: 'Job cancelled by customer.',
      },
      { session }
    );

    session.afterCommit = () => {
      // Notify affected workers
      const workerIds = affectedBookings.map((b) => b.workerId);
      realtimeEmitter.emit(
        EVENT_NAMES.BOOKING_CANCELLED,
        { jobId: job.id, message: 'Job was cancelled by customer.' },
        { userIds: workerIds }
      );

      if (job.location?.coordinates) {
        const areaKeys = areaCellsAround(job.location.coordinates[1], job.location.coordinates[0], 5);
        realtimeEmitter.emit(EVENT_NAMES.JOB_FILLED, { job: { id: job.id } }, { areaKeys });
      }

      logger.info({
        event: 'job_cancelled',
        jobId: job.id,
        customerId,
      });
    };

    return { message: 'Job cancelled successfully.' };
  });
}
