/**
 * WorkCred Idempotency Key Model
 */

import mongoose from 'mongoose';

const idempotencyKeySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `idemp-${new mongoose.Types.ObjectId().toString()}` },
    userId: { type: String, required: true },
    key: { type: String, required: true },
    route: { type: String, required: true },
    bodyHash: { type: String, default: null },
    status: { type: String, enum: ['processing', 'completed'], default: 'processing' },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
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
idempotencyKeySchema.index({ userId: 1, key: 1, route: 1 }, { unique: true, name: 'idempotency_user_key_route_unique' });
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400, name: 'idempotency_created_at_ttl' }); // 24 hours

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
