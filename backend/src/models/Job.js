/**
 * WorkCred Job Broadcast Model
 */

import mongoose from 'mongoose';
import { SKILLS, JOB_STATUS } from '../../../shared/constants.js';

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

const jobSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `job-${new mongoose.Types.ObjectId().toString()}` },
    customerId: { type: String, required: true, ref: 'User' },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    skill: { type: String, required: true, enum: SKILLS },
    area: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, default: 'Pune' },
    location: { type: pointSchema, required: true },
    rate: { type: Number, required: true, min: 0 },
    rateUnit: { type: String, enum: ['day', 'hour'], default: 'day' },
    slotsNeeded: { type: Number, default: 1, min: 1 },
    slotsFilled: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [JOB_STATUS.OPEN, JOB_STATUS.FILLED, JOB_STATUS.CANCELLED],
      default: JOB_STATUS.OPEN,
    },
    acceptedWorkerIds: { type: [String], default: [] },
    hoursPerWorker: { type: Number, default: 8, min: 1 },
    scheduledAt: { type: Date, default: null },
    isSample: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        ret.workersNeeded = ret.slotsNeeded;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        ret.id = ret._id;
        ret.workersNeeded = ret.slotsNeeded;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
jobSchema.index({ location: '2dsphere' }, { name: 'jobs_location_2dsphere' });
jobSchema.index({ status: 1, skill: 1, scheduledAt: 1 }, { name: 'jobs_status_skill_scheduled' });
jobSchema.index({ customerId: 1, status: 1 }, { name: 'jobs_customer_status' });

export const Job = mongoose.model('Job', jobSchema);
