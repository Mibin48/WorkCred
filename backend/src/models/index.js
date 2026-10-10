/**
 * WorkCred Model Registry & Index Synchronization Tool
 */

import { User } from './User.js';
import { Otp } from './Otp.js';
import { RefreshToken } from './RefreshToken.js';
import { Job } from './Job.js';
import { Booking } from './Booking.js';
import { PassportEntry } from './PassportEntry.js';
import { Availability } from './Availability.js';
import { RateStat } from './RateStat.js';
import { Post } from './Post.js';
import { Follow } from './Follow.js';
import { Endorsement } from './Endorsement.js';
import { PushSubscription } from './PushSubscription.js';
import { Report } from './Report.js';
import { IdempotencyKey } from './IdempotencyKey.js';
import { logger } from '../utils/logger.js';

export const models = {
  User,
  Otp,
  RefreshToken,
  Job,
  Booking,
  PassportEntry,
  Availability,
  RateStat,
  Post,
  Follow,
  Endorsement,
  PushSubscription,
  Report,
  IdempotencyKey,
};

export {
  User,
  Otp,
  RefreshToken,
  Job,
  Booking,
  PassportEntry,
  Availability,
  RateStat,
  Post,
  Follow,
  Endorsement,
  PushSubscription,
  Report,
  IdempotencyKey,
};

/**
 * Synchronize and ensure all explicit database indexes exist across all collections.
 */
export async function ensureIndexes() {
  logger.info('Ensuring and synchronizing indexes across all Mongoose models...');
  const results = {};

  for (const [name, model] of Object.entries(models)) {
    try {
      await model.syncIndexes();
      const indexes = await model.collection.listIndexes().toArray();
      results[name] = indexes.map((idx) => idx.name);
      logger.info(`Synced ${indexes.length} index(es) for collection '${model.collection.name}'.`);
    } catch (err) {
      logger.error(`Failed to sync indexes for model ${name}: ${err.message}`);
      throw err;
    }
  }

  return results;
}
