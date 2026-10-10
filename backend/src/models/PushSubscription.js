/**
 * WorkCred Push Subscription Model
 */

import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `push-${new mongoose.Types.ObjectId().toString()}` },
    userId: { type: String, required: true, ref: 'User' },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
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
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true, name: 'push_subs_endpoint_unique' });
pushSubscriptionSchema.index({ userId: 1 }, { name: 'push_subs_user_id' });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
