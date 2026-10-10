/**
 * WorkCred Job Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { validateJobCreate } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { haversineKm, roundedDistanceLabel } from '../../../../shared/geo.js';
import { getCompassStats } from './compassService.js';
import { eventBus } from '../events.js';
import { EVENT_NAMES } from '../../../../shared/constants.js';

export function createJob(customerId, body) {
  const errors = validateJobCreate(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const customer = db.users.find((u) => u.id === customerId);
  if (!customer || customer.role !== 'customer') {
    throw new AppError('WRONG_ROLE', 'Only customer accounts can post jobs.', 403);
  }

  const { title, description = '', skill, area, city, lat, lng, rate, rateUnit = 'day', slotsNeeded = 1, hoursPerWorker = 1, scheduledAt = null } = body;

  const jobId = `job-${Date.now()}`;
  const newJob = {
    id: jobId,
    customerId,
    title: title.trim(),
    description: description.trim(),
    skill,
    area,
    city,
    location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
    rate: Number(rate),
    rateUnit,
    hoursPerWorker: Number(hoursPerWorker) || 1,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    slotsNeeded: Number(slotsNeeded),
    slotsFilled: 0,
    status: 'open',
    acceptedWorkerIds: [],
    createdAt: new Date().toISOString(),
    isSample: false,
  };

  db.jobs.unshift(newJob);
  writeDb(db);

  // Compute compass verdict for response attachment
  const compassInfo = getCompassStats({ skill, area, city, rate: newJob.rate, rateUnit: newJob.rateUnit });

  eventBus.emit(EVENT_NAMES.JOB_NEW, { job: newJob });

  return { job: structuredClone(newJob), compass: compassInfo };
}

export function getOpenJobs(workerId, query = {}) {
  const db = readDb();
  const worker = db.users.find((u) => u.id === workerId);
  if (!worker || worker.role !== 'worker') {
    throw new AppError('WRONG_ROLE', 'Only worker accounts can view job feed.', 403);
  }

  const { lat = 18.5204, lng = 73.8567, radiusKm = 5 } = query;
  const workerSkills = worker.skills || [];

  const openJobs = db.jobs.filter((j) => {
    if (j.status !== 'open') return false;
    if (j.acceptedWorkerIds && j.acceptedWorkerIds.includes(workerId)) return false;
    if (workerSkills.length > 0 && !workerSkills.includes(j.skill)) return false;

    const jLat = j.location?.coordinates?.[1] ?? 18.5204;
    const jLng = j.location?.coordinates?.[0] ?? 73.8567;
    const dist = haversineKm(lat, lng, jLat, jLng);
    return dist <= Number(radiusKm);
  }).map((j) => {
    const jLat = j.location?.coordinates?.[1] ?? 18.5204;
    const jLng = j.location?.coordinates?.[0] ?? 73.8567;
    const dist = haversineKm(lat, lng, jLat, jLng);
    return {
      ...structuredClone(j),
      distanceKm: dist,
      distanceLabel: roundedDistanceLabel(dist),
    };
  });

  openJobs.sort((a, b) => a.distanceKm - b.distanceKm);
  return { jobs: openJobs };
}

export function getCustomerJobs(customerId) {
  const db = readDb();
  const jobs = db.jobs.filter((j) => j.customerId === customerId);
  return { jobs: structuredClone(jobs) };
}

export function acceptJob(workerId, jobId) {
  const db = readDb();
  const worker = db.users.find((u) => u.id === workerId && u.role === 'worker');
  if (!worker) throw new AppError('WRONG_ROLE', 'Only workers can accept jobs.', 403);

  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404);
  if (job.status !== 'open') throw new AppError('JOB_FILLED', 'This job is no longer open.', 409);
  if (job.acceptedWorkerIds?.includes(workerId)) throw new AppError('ALREADY_BOOKED', 'You have already accepted this job.', 409);

  // Check overlapping active booking
  const activeBooking = db.bookings.find(
    (b) => !b.isSample && b.workerId === workerId && (b.status === 'confirmed' || b.status === 'in_progress')
  );
  if (activeBooking) {
    throw new AppError('OVERLAPPING_BOOKING', 'You already have an active job or booking in progress.', 409);
  }

  job.slotsFilled += 1;
  if (!job.acceptedWorkerIds) job.acceptedWorkerIds = [];
  job.acceptedWorkerIds.push(workerId);
  if (job.slotsFilled >= job.slotsNeeded) {
    job.status = 'filled';
  }

  // Create confirmed booking
  const startCode = String(Math.floor(1000 + Math.random() * 9000));
  const finishCode = String(Math.floor(1000 + Math.random() * 9000));
  const newBooking = {
    id: `booking-${Date.now()}`,
    source: 'job',
    jobId: job.id,
    workerId,
    customerId: job.customerId,
    skill: job.skill,
    status: 'confirmed',
    rate: job.rate,
    rateUnit: job.rateUnit,
    scheduledAt: job.scheduledAt || null,
    hours: Number(job.hoursPerWorker) || 1,
    startCode,
    finishCode,
    createdAt: new Date().toISOString(),
    isSample: false,
  };

  db.bookings.unshift(newBooking);
  writeDb(db);

  if (job.status === 'filled') {
    eventBus.emit(EVENT_NAMES.JOB_FILLED, { job });
  }
  eventBus.emit(EVENT_NAMES.BOOKING_CREATED, { booking: newBooking });

  return { booking: structuredClone(newBooking), job: structuredClone(job) };
}

export function cancelJob(customerId, jobId) {
  const db = readDb();
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404);
  if (job.customerId !== customerId) throw new AppError('FORBIDDEN', 'You do not own this job.', 403);

  job.status = 'cancelled';
  writeDb(db);
  return { job: structuredClone(job) };
}
