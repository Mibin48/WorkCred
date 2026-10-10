/**
 * WorkCred Endorsement Model
 */

import mongoose from 'mongoose';
import { SKILLS } from '../../../shared/constants.js';

const endorsementSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `endorse-${new mongoose.Types.ObjectId().toString()}` },
    customerId: { type: String, required: true, ref: 'User' },
    workerId: { type: String, required: true, ref: 'User' },
    skill: { type: String, required: true, enum: SKILLS },
    comment: { type: String, trim: true, default: '' },
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
  }
);

// Indexes
endorsementSchema.index(
  { customerId: 1, workerId: 1, skill: 1 },
  { unique: true, name: 'endorsements_customer_worker_skill_unique' }
);

export const Endorsement = mongoose.model('Endorsement', endorsementSchema);
