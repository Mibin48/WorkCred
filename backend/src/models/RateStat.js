/**
 * WorkCred Rate Statistics Model (Wage Compass)
 */

import mongoose from 'mongoose';
import { SKILLS } from '../../../shared/constants.js';

const rateStatSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `stat-${new mongoose.Types.ObjectId().toString()}` },
    skill: { type: String, required: true, enum: SKILLS },
    locality: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, default: 'Pune' },
    localityKey: { type: String, required: true },
    p25: { type: Number, required: true, min: 0 },
    median: { type: Number, required: true, min: 0 },
    p75: { type: Number, required: true, min: 0 },
    sampleSize: { type: Number, required: true, min: 0 },
    isSeed: { type: Boolean, default: false },
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
  }
);

// Indexes
rateStatSchema.index({ skill: 1, localityKey: 1 }, { unique: true, name: 'rate_stats_skill_locality_unique' });

export const RateStat = mongoose.model('RateStat', rateStatSchema);
