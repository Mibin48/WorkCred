/**
 * WorkCred Follow & Save Model
 */

import mongoose from 'mongoose';

const followSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `follow-${new mongoose.Types.ObjectId().toString()}` },
    fromUserId: { type: String, required: true, ref: 'User' },
    toUserId: { type: String, required: true, ref: 'User' },
    type: { type: String, enum: ['save', 'follow'], required: true, default: 'save' },
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
followSchema.index({ fromUserId: 1, toUserId: 1, type: 1 }, { unique: true, name: 'follows_from_to_type_unique' });
followSchema.index({ fromUserId: 1, type: 1, createdAt: -1 }, { name: 'follows_from_type_created' });
followSchema.index({ toUserId: 1, type: 1 }, { name: 'follows_to_type' });

export const Follow = mongoose.model('Follow', followSchema);
