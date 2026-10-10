/**
 * WorkCred Work Passport Ledger Model
 * Cryptographically chained proof-of-work ledger entries.
 * Strict append-only guard protecting historical ledger blocks from mutation or deletion.
 */

import mongoose from 'mongoose';
import { SKILLS } from '../../../shared/constants.js';
import { AppError } from '../../../shared/errors.js';

const passportFieldsSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true },
    workerId: { type: String, required: true },
    customerId: { type: String, required: true },
    skill: { type: String, required: true, enum: SKILLS },
    hoursWorked: { type: Number, required: true, min: 1 },
    amountPaid: { type: Number, required: true, min: 0 },
    startedAt: { type: String, required: true },
    finishedAt: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const passportEntrySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `pass-${new mongoose.Types.ObjectId().toString()}` },
    bookingId: { type: String, required: true },
    workerId: { type: String, required: true, ref: 'User' },
    seq: { type: Number, required: true, min: 1 },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
    fields: { type: passportFieldsSchema, required: true },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    isMasked: { type: Boolean, default: true },
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

// Explicit Unique & Compound Indexes
passportEntrySchema.index({ bookingId: 1 }, { unique: true, name: 'passport_entries_booking_id_unique' });
passportEntrySchema.index({ workerId: 1, seq: 1 }, { unique: true, name: 'passport_entries_worker_seq_unique' });
passportEntrySchema.index({ workerId: 1, createdAt: -1 }, { name: 'passport_entries_worker_created' });

// --- STRICT APPEND-ONLY GUARDS ---

const ALLOWED_MUTABLE_FIELDS = new Set(['visibility', 'isMasked', 'updatedAt']);

/**
 * Validate that an update operation touches ONLY permitted privacy fields.
 */
function validateMutationAllowed(update) {
  if (!update) return;

  const extractKeys = (obj) => {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$setOnInsert') {
        continue; // $setOnInsert applies only upon document insertion
      }
      if (k.startsWith('$')) {
        if (typeof v === 'object' && v !== null) {
          keys.push(...Object.keys(v));
        }
      } else {
        keys.push(k);
      }
    }
    return keys;
  };

  const modifiedKeys = extractKeys(update);
  for (const key of modifiedKeys) {
    const cleanKey = key.split('.')[0];
    if (!ALLOWED_MUTABLE_FIELDS.has(cleanKey)) {
      throw new AppError(
        'FORBIDDEN',
        `Cryptographic ledger integrity violation: field '${key}' is immutable and cannot be updated.`,
        403
      );
    }
  }
}

// Guard save on existing documents
passportEntrySchema.pre('save', function (next) {
  if (!this.isNew) {
    const modified = this.modifiedPaths();
    for (const path of modified) {
      const topLevel = path.split('.')[0];
      if (!ALLOWED_MUTABLE_FIELDS.has(topLevel)) {
        return next(
          new AppError(
            'FORBIDDEN',
            `Cryptographic ledger integrity violation: field '${path}' is immutable.`,
            403
          )
        );
      }
    }
  }
  next();
});

// Guard update queries (updateOne, updateMany, findOneAndUpdate, replaceOne)
passportEntrySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function (next) {
  try {
    const update = this.getUpdate();
    validateMutationAllowed(update);
    next();
  } catch (err) {
    next(err);
  }
});

// Block delete queries (deleteOne, deleteMany, findOneAndDelete)
passportEntrySchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete', 'remove'], function (next) {
  // Allow programmatic test cleanup when explicitly bypassed via option _forceLedgerReset: true
  const options = this.getOptions?.() || {};
  if (options._forceLedgerReset) {
    return next();
  }
  next(
    new AppError(
      'FORBIDDEN',
      'Cryptographic ledger entries are permanent and cannot be deleted.',
      403
    )
  );
});

export const PassportEntry = mongoose.model('PassportEntry', passportEntrySchema);
