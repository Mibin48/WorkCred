/**
 * WorkCred Incident & Problem Report Model
 */

import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `rep-${new mongoose.Types.ObjectId().toString()}` },
    targetType: {
      type: String,
      enum: ['passport', 'worker', 'booking', 'post'],
      required: true,
    },
    targetId: { type: String, required: true },
    reason: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: '' },
    reporterId: { type: String, ref: 'User', default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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
reportSchema.index({ targetType: 1, targetId: 1 }, { name: 'reports_target' });
reportSchema.index({ createdAt: -1 }, { name: 'reports_created_desc' });

export const Report = mongoose.model('Report', reportSchema);
