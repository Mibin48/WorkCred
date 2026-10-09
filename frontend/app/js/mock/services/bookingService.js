/**
 * WorkCred Booking Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { transition } from '../../../../shared/stateMachine.js';
import {
  validateBookingCreate,
  validateStartBooking,
  validateFinishBooking,
} from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { haversineKm } from '../../../../shared/geo.js';
import { addPassportEntry } from './passportService.js';
import { eventBus } from '../events.js';
import { EVENT_NAMES } from '../../../../shared/constants.js';

export function createBooking(customerId, body) {
  const errors = validateBookingCreate(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const customer = db.users.find((u) => u.id === customerId && u.role === 'customer');
  if (!customer) throw new AppError('WRONG_ROLE', 'Only customers can initiate bookings.', 403);

  const { workerId, source = 'direct', jobId = null, skill = 'helper', rate = 500, rateUnit = 'day' } = body;
  const worker = db.users.find((u) => u.id === workerId && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Worker not found.', 404);

  const startCode = String(Math.floor(1000 + Math.random() * 9000));
  const finishCode = String(Math.floor(1000 + Math.random() * 9000));
  const status = source === 'job' ? 'confirmed' : 'pending';

  const booking = {
    id: `booking-${Date.now()}`,
    source,
    jobId,
    workerId,
    customerId,
    skill,
    status,
    rate: Number(rate) || worker.rate || 500,
    rateUnit: rateUnit || worker.rateUnit || 'day',
    startCode,
    finishCode,
    startCodeAttempts: 0,
    finishCodeAttempts: 0,
    createdAt: new Date().toISOString(),
    isSample: false,
  };

  db.bookings.unshift(booking);
  writeDb(db);

  eventBus.emit(EVENT_NAMES.BOOKING_REQUEST, { booking });
  return { booking: sanitizeBookingForUser(booking, customerId, 'customer') };
}

export function confirmBooking(workerId, bookingId) {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  if (booking.workerId !== workerId) throw new AppError('FORBIDDEN', 'You do not own this booking.', 403);

  const nextStatus = transition(booking, 'confirm', 'worker');
  booking.status = nextStatus;
  writeDb(db);

  eventBus.emit(EVENT_NAMES.BOOKING_CREATED, { booking });
  return { booking: sanitizeBookingForUser(booking, workerId, 'worker') };
}

export function getBookings(userId, role, statusFilter) {
  const db = readDb();
  let list = db.bookings.filter((b) => (role === 'worker' ? b.workerId === userId : b.customerId === userId));
  if (statusFilter) {
    list = list.filter((b) => b.status === statusFilter);
  }
  const sanitized = list.map((b) => sanitizeBookingForUser(b, userId, role));
  return { bookings: sanitized };
}

export function getBookingById(bookingId, userId, role) {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  if (booking.workerId !== userId && booking.customerId !== userId) {
    throw new AppError('FORBIDDEN', 'Access denied to this booking.', 403);
  }
  return { booking: sanitizeBookingForUser(booking, userId, role) };
}

export function startBooking(workerId, bookingId, body) {
  const errors = validateStartBooking(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  if (booking.workerId !== workerId) throw new AppError('FORBIDDEN', 'You are not the assigned worker for this booking.', 403);

  const attempts = Number(booking.startCodeAttempts ?? 0);
  if (attempts >= 5) {
    throw new AppError('RATE_LIMITED', 'Too many invalid start code attempts. Handshake locked.', 429);
  }

  const inputCode = String(body.startCode).trim();
  if (inputCode !== String(booking.startCode)) {
    booking.startCodeAttempts = attempts + 1;
    writeDb(db);
    const left = Math.max(0, 5 - (attempts + 1));
    if (left === 0) {
      throw new AppError('RATE_LIMITED', 'Too many invalid start code attempts. Handshake locked.', 429);
    }
    throw new AppError('INVALID_START_CODE', `Incorrect start code. ${left} attempts remaining.`, 400, { attemptsLeft: left });
  }

  const nextStatus = transition(booking, 'start', 'worker');
  booking.status = nextStatus;
  booking.startedAt = new Date().toISOString();
  booking.startedGeo = { type: 'Point', coordinates: [Number(body.lng), Number(body.lat)] };

  // Check distance warning if job has location
  let distanceWarning = false;
  if (booking.jobId) {
    const job = db.jobs.find((j) => j.id === booking.jobId);
    if (job?.location?.coordinates) {
      const jLat = job.location.coordinates[1];
      const jLng = job.location.coordinates[0];
      const dist = haversineKm(body.lat, body.lng, jLat, jLng);
      if (dist > 0.5) distanceWarning = true;
    }
  }
  booking.distanceWarning = distanceWarning;

  writeDb(db);

  eventBus.emit(EVENT_NAMES.BOOKING_STARTED, { booking });
  return { booking: sanitizeBookingForUser(booking, workerId, 'worker'), distanceWarning };
}

export async function finishBooking(customerId, bookingId, body) {
  const errors = validateFinishBooking(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  if (booking.customerId !== customerId) throw new AppError('FORBIDDEN', 'You are not the customer for this booking.', 403);

  const attempts = Number(booking.finishCodeAttempts ?? 0);
  if (attempts >= 5) {
    throw new AppError('RATE_LIMITED', 'Too many invalid finish code attempts. Handshake locked.', 429);
  }

  const inputCode = String(body.finishCode).trim();
  if (inputCode !== String(booking.finishCode)) {
    booking.finishCodeAttempts = attempts + 1;
    writeDb(db);
    const left = Math.max(0, 5 - (attempts + 1));
    throw new AppError('INVALID_FINISH_CODE', `Incorrect finish code. ${left} attempts remaining.`, 400, { attemptsLeft: left });
  }

  const nextStatus = transition(booking, 'finish', 'customer');
  const finishedAt = new Date().toISOString();
  const startedAt = booking.startedAt ? new Date(booking.startedAt) : new Date(Date.now() - 4 * 3600000);
  const hoursWorked = Math.max(1, Math.round((new Date(finishedAt).getTime() - startedAt.getTime()) / 3600000));
  const amountPaid = Math.round((booking.rate / (booking.rateUnit === 'hour' ? 1 : 8)) * hoursWorked);

  booking.status = nextStatus;
  booking.finishedAt = finishedAt;
  booking.hoursWorked = hoursWorked;
  booking.amountPaid = amountPaid;
  booking.paidCash = true;
  booking.rating = Number(body.rating);
  booking.comment = body.comment ? String(body.comment).trim() : '';

  writeDb(db);

  // Add SHA-256 Hash Chained Passport Entry
  const passportResult = await addPassportEntry({
    bookingId: booking.id,
    workerId: booking.workerId,
    customerId: booking.customerId,
    skill: booking.skill,
    hoursWorked,
    amountPaid,
    startedAt: booking.startedAt || startedAt.toISOString(),
    finishedAt,
    rating: booking.rating,
  });

  eventBus.emit(EVENT_NAMES.BOOKING_COMPLETED, { booking, passportEntry: passportResult.entry });

  return { booking: sanitizeBookingForUser(booking, customerId, 'customer'), passportEntry: passportResult.entry };
}

export function cancelBooking(userId, role, bookingId) {
  const db = readDb();
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
  if (booking.workerId !== userId && booking.customerId !== userId) {
    throw new AppError('FORBIDDEN', 'Access denied to this booking.', 403);
  }

  const nextStatus = transition(booking, 'cancel', role);
  booking.status = nextStatus;

  // Penalty counter for worker cancellation
  if (role === 'worker') {
    const worker = db.users.find((u) => u.id === userId);
    if (worker) {
      worker.cancellationPenaltyCount = (worker.cancellationPenaltyCount || 0) + 1;
    }
  }

  writeDb(db);
  eventBus.emit(EVENT_NAMES.BOOKING_CANCELLED, { booking });
  return { booking: sanitizeBookingForUser(booking, userId, role) };
}

export function sanitizeBookingForUser(booking, userId, role) {
  const copy = structuredClone(booking);
  // WORKER NEVER RECEIVES HANDSHAKE CODES
  if (role === 'worker' || userId === booking.workerId) {
    delete copy.startCode;
    delete copy.finishCode;
  }
  return copy;
}
