/**
 * WorkCred User Model (Workers & Customers)
 */

import mongoose from 'mongoose';
import { SKILLS, ROLES } from '../../../shared/constants.js';

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator(coords) {
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 && // lng
            coords[1] >= -90 &&
            coords[1] <= 90 // lat
          );
        },
        message: 'Coordinates must be [lng, lat] within valid geographic ranges.',
      },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `user-${new mongoose.Types.ObjectId().toString()}` },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(v) {
          const digits = String(v).replace(/\D/g, '').slice(-10);
          return /^[6-9]\d{9}$/.test(digits);
        },
        message: 'Phone must be a valid 10-digit Indian mobile number.',
      },
    },
    name: { type: String, trim: true, default: '' },
    role: { type: String, enum: [ROLES.WORKER, ROLES.CUSTOMER], default: null },
    skills: {
      type: [String],
      enum: SKILLS,
      default: [],
    },
    mainSkill: { type: String, enum: SKILLS, default: null },
    rate: { type: Number, default: null, min: 0 },
    rateUnit: { type: String, enum: ['day', 'hour'], default: 'day' },
    hourlyRate: { type: Number, default: null, min: 0 },
    dailyRate: { type: Number, default: null, min: 0 },
    bio: { type: String, trim: true, default: '' },
    area: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: 'Pune' },
    localityKey: { type: String, default: null },
    location: { type: pointSchema, default: null },
    radiusKm: { type: Number, default: 3, min: 1, max: 25 },
    calendar: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        monday: 'full',
        tuesday: 'full',
        wednesday: 'full',
        thursday: 'full',
        friday: 'full',
        saturday: 'full',
        sunday: 'off',
      }),
    },
    blockedDates: { type: [String], default: [] },
    rating: { type: Number, default: 5.0 },
    jobsCompleted: { type: Number, default: 0 },
    totalHoursWorked: { type: Number, default: 0 },
    passportSlug: { type: String, sparse: true, trim: true },
    passportStats: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        totalHoursWorked: 0,
        jobsCompleted: 0,
        avgRating: 5.0,
        reviewsCount: 0,
      }),
    },
    skillLevels: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    defaultMaskEmployerNames: { type: Boolean, default: true },
    profileComplete: { type: Boolean, default: false },
    isPublicPassportEnabled: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isSample: { type: Boolean, default: false },
    bookingVersion: { type: Number, default: 0 },
    cancellationPenaltyCount: { type: Number, default: 0 },
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
userSchema.index({ phone: 1 }, { unique: true, name: 'users_phone_unique' });
userSchema.index({ passportSlug: 1 }, { unique: true, sparse: true, name: 'users_passport_slug_unique' });
userSchema.index({ location: '2dsphere' }, { name: 'users_location_2dsphere' });
userSchema.index({ role: 1, isActive: 1, skills: 1 }, { name: 'users_role_active_skills' });
userSchema.index({ role: 1, 'passportStats.avgRating': -1 }, { name: 'users_role_rating_sort' });

/**
 * Public Projection Helper (Never reveals worker phone or exact GPS coordinates)
 */
userSchema.statics.publicProjection = function (doc) {
  if (!doc) return null;
  const user = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  delete user.phone;
  if (user.location) {
    // Keep area and city, remove exact coordinates from public view
    delete user.location;
  }
  return user;
};

export const User = mongoose.model('User', userSchema);
