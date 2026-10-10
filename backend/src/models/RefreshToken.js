/**
 * WorkCred Refresh Token Model
 * Tracks token rotation, reuse detection, and session family lifecycle.
 */

import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `token-${new mongoose.Types.ObjectId().toString()}` },
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true, ref: 'User' },
    familyId: { type: String, required: true },
    isRevoked: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    familyExpiresAt: { type: Date, required: true }, // Absolute 90 days from family creation
    expiresAt: { type: Date, required: true }, // 30 days rolling
    userAgent: { type: String, default: 'unknown' },
    ip: { type: String, default: 'unknown' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.tokenHash;
        delete ret.replacedByHash;
        return ret;
      },
    },
  }
);

// Explicit Indexes
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'refresh_tokens_token_hash_unique' });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'refresh_tokens_expires_at_ttl' });
refreshTokenSchema.index({ userId: 1, familyId: 1 }, { name: 'refresh_tokens_user_family' });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
