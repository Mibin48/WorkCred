/**
 * WorkCred Community Work Post Model
 */

import mongoose from 'mongoose';
import { SKILLS } from '../../../shared/constants.js';

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(coords) {
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
          );
        },
        message: 'Coordinates must be [lng, lat] within valid geographic ranges.',
      },
    },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `post-${new mongoose.Types.ObjectId().toString()}` },
    workerId: { type: String, required: true, ref: 'User' },
    workerName: { type: String, required: true, trim: true },
    workerArea: { type: String, required: true, trim: true },
    skill: { type: String, required: true, enum: SKILLS },
    caption: { type: String, required: true, trim: true, maxlength: 140 },
    afterUrl: { type: String, required: true },
    beforeUrl: { type: String, default: null },
    afterPhotoUrl: { type: String, default: null }, // backwards-compat alias
    beforePhotoUrl: { type: String, default: null }, // backwards-compat alias
    publicIds: { type: [String], default: [] },
    bookingId: { type: String, ref: 'Booking' },
    linkedBookingId: { type: String, ref: 'Booking' },
    verifiedJob: { type: Boolean, default: false },
    likesCount: { type: Number, default: 0, min: 0 },
    location: { type: pointSchema, default: null },
    localityKey: { type: String, default: null },
    isSample: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        ret.afterUrl = ret.afterUrl || ret.afterPhotoUrl;
        ret.beforeUrl = ret.beforeUrl || ret.beforePhotoUrl;
        ret.bookingId = ret.bookingId || ret.linkedBookingId;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        ret.id = ret._id;
        ret.afterUrl = ret.afterUrl || ret.afterPhotoUrl;
        ret.beforeUrl = ret.beforeUrl || ret.beforePhotoUrl;
        ret.bookingId = ret.bookingId || ret.linkedBookingId;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
postSchema.index({ location: '2dsphere' }, { name: 'posts_location_2dsphere' });
postSchema.index({ createdAt: -1, _id: -1 }, { name: 'posts_created_at_desc' });
postSchema.index({ workerId: 1, createdAt: -1, _id: -1 }, { name: 'posts_worker_created_desc' });
postSchema.index({ bookingId: 1 }, { unique: true, sparse: true, name: 'posts_booking_id_unique' });

export const Post = mongoose.model('Post', postSchema);
