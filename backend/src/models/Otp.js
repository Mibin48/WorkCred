/**
 * WorkCred OTP Model
 * Multi-instance rate counter windows and keyed hash storage for passwordless auth.
 */

import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `otp-${new mongoose.Types.ObjectId().toString()}` },
    phone: { type: String, required: true, trim: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    sendCount: { type: Number, default: 1, min: 1 },
    windowExpiresAt: { type: Date, required: true },
    dailyCount: { type: Number, default: 1, min: 1 },
    dailyExpiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.codeHash;
        return ret;
      },
    },
  }
);

// Explicit Indexes
otpSchema.index({ phone: 1 }, { unique: true, name: 'otps_phone_unique' });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'otps_expires_at_ttl' });

export const Otp = mongoose.model('Otp', otpSchema);
