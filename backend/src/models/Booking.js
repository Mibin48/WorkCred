/**
 * WorkCred Booking Model
 * Encrypted handshake codes at rest via AES-256-GCM.
 * Partial unique indexes and overlap checking helpers.
 */

import mongoose from 'mongoose';
import { SKILLS, BOOKING_STATUS } from '../../../shared/constants.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(coords) {
          return Array.isArray(coords) && coords.length === 2 && coords[0] >= -180 && coords[0] <= 180 && coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Coordinates must be [lng, lat] within valid geographic ranges.',
      },
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `booking-${new mongoose.Types.ObjectId().toString()}` },
    customerId: { type: String, required: true, ref: 'User' },
    workerId: { type: String, required: true, ref: 'User' },
    jobId: { type: String, ref: 'Job', default: null },
    source: {
      type: String,
      enum: ['direct', 'freenow', 'job'],
      default: 'direct',
    },
    skill: { type: String, required: true, enum: SKILLS },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
    },
    rate: { type: Number, required: true, min: 0 },
    rateUnit: { type: String, enum: ['day', 'hour'], default: 'day' },
    agreedRate: { type: Number, default: null },
    scheduledAt: { type: Date, default: null },
    hours: { type: Number, default: 4, min: 1, max: 24 },
    hoursWorked: { type: Number, default: null, min: 0 },
    amountPaid: { type: Number, default: null, min: 0 },
    paidCash: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    // Encrypted handshake codes (Excluded by default from queries and toJSON)
    startCodeEnc: { type: String, select: false },
    finishCodeEnc: { type: String, select: false },
    startCodeAttempts: { type: Number, default: 0, min: 0 },
    finishCodeAttempts: { type: Number, default: 0, min: 0 },
    startCodeLockedUntil: { type: Date, default: null },
    finishCodeLockedUntil: { type: Date, default: null },
    location: { type: pointSchema, default: null },
    startedAt: { type: Date, default: null },
    startedGeo: { type: pointSchema, default: null },
    finishedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: ['customer', 'worker', 'system', null], default: null },
    cancellationReason: { type: String, trim: true, default: '' },
    flags: { type: [String], default: [] },
    penalty: { type: mongoose.Schema.Types.Mixed, default: null },
    isSample: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.startCodeEnc;
        delete ret.finishCodeEnc;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.startCodeEnc;
        delete ret.finishCodeEnc;
        return ret;
      },
    },
  }
);

// Indexes
bookingSchema.index({ workerId: 1, status: 1, scheduledAt: 1 }, { name: 'bookings_worker_status_scheduled' });
bookingSchema.index({ customerId: 1, status: 1, scheduledAt: 1 }, { name: 'bookings_customer_status_scheduled' });
bookingSchema.index({ jobId: 1 }, { name: 'bookings_job_id' });

// Partial unique index: one active booking per worker for a specific broadcast job
bookingSchema.index(
  { workerId: 1, jobId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      jobId: { $type: 'string' },
      status: { $in: ['pending', 'confirmed', 'in_progress'] },
    },
    name: 'bookings_worker_job_active_unique',
  }
);

/**
 * Helper to encrypt and set handshake codes.
 */
bookingSchema.methods.setCodes = function (startCode, finishCode) {
  if (startCode) {
    this.startCodeEnc = encrypt(String(startCode));
  }
  if (finishCode) {
    this.finishCodeEnc = encrypt(String(finishCode));
  }
};

/**
 * Helper to get decrypted handshake codes.
 */
bookingSchema.methods.getDecryptedStartCode = function () {
  if (!this.startCodeEnc) return null;
  return decrypt(this.startCodeEnc);
};

bookingSchema.methods.getDecryptedFinishCode = function () {
  if (!this.finishCodeEnc) return null;
  return decrypt(this.finishCodeEnc);
};

/**
 * Static overlap check helper for scheduled bookings.
 */
bookingSchema.statics.overlapsFor = async function (workerId, startTime, endTime, excludeBookingId = null) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const query = {
    workerId,
    status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS] },
    scheduledAt: { $ne: null },
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const existingBookings = await this.find(query).select('scheduledAt hours status');

  return existingBookings.some((b) => {
    const bStart = new Date(b.scheduledAt).getTime();
    const bEnd = bStart + (b.hours || 1) * 3600000;
    return start.getTime() < bEnd && end.getTime() > bStart;
  });
};

export const Booking = mongoose.model('Booking', bookingSchema);
