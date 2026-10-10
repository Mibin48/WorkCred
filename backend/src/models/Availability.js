/**
 * WorkCred Availability (Free Now Radar) Model
 */

import mongoose from 'mongoose';
import { SKILLS, LIMITS } from '../../../shared/constants.js';
import { clock } from '../utils/clock.js';

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

const availabilitySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `avail-${new mongoose.Types.ObjectId().toString()}` },
    workerId: { type: String, required: true, ref: 'User' },
    skill: { type: String, required: true, enum: SKILLS },
    hours: { type: Number, required: true, enum: LIMITS.FREE_NOW_HOURS },
    rate: { type: Number, required: true, min: 0 },
    rateUnit: { type: String, enum: ['day', 'hour'], default: 'day' },
    location: { type: pointSchema, required: true },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
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
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
availabilitySchema.index({ location: '2dsphere' }, { name: 'availability_location_2dsphere' });
availabilitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'availability_expires_at_ttl' });
availabilitySchema.index(
  { workerId: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
    name: 'availability_worker_active_unique',
  }
);

/**
 * Spatial search helper for active Free-Now workers within radius.
 * Guarantees expired windows are filtered immediately without waiting for MongoDB TTL background thread.
 */
availabilitySchema.statics.activeNear = function ({ lat, lng, radiusKm = 5, skill = null }) {
  const currentClockTime = clock.toDate();
  const maxDistanceMeters = (Number(radiusKm) || 5) * 1000;

  const query = {
    active: true,
    expiresAt: { $gt: currentClockTime },
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [Number(lng), Number(lat)],
        },
        $maxDistance: maxDistanceMeters,
      },
    },
  };

  if (skill) {
    query.skill = skill;
  }

  return this.find(query);
};

export const Availability = mongoose.model('Availability', availabilitySchema);
