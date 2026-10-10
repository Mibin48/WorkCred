/**
 * WorkCred Push Subscription Service
 * Manages Web Push subscription registrations, endpoint reassignment,
 * and user caps (max 5 active devices per user).
 */

import { PushSubscription } from '../../models/PushSubscription.js';
import { validatePushSubscribe } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { logger } from '../../utils/logger.js';

export async function subscribePush(userId, body = {}) {
  const validationErrors = validatePushSubscribe(body);
  if (validationErrors.length > 0) {
    throw new AppError('VALIDATION_ERROR', validationErrors[0].message, 400, validationErrors);
  }

  const { endpoint, keys } = body;

  // Check if endpoint already exists
  const existing = await PushSubscription.findOne({ endpoint });

  if (existing) {
    // Reassign endpoint to current user if belonged to someone else
    existing.userId = userId;
    existing.keys = keys;
    await existing.save();
  } else {
    // Check cap of 5 subscriptions per user
    const userSubs = await PushSubscription.find({ userId }).sort({ createdAt: 1 });
    if (userSubs.length >= 5) {
      // Remove oldest
      await PushSubscription.deleteOne({ _id: userSubs[0]._id });
    }

    const newSub = new PushSubscription({
      userId,
      endpoint,
      keys,
    });
    await newSub.save();
  }

  logger.info({
    event: 'push_subscribed',
    userId,
  });

  return { message: 'Push subscription saved successfully.' };
}

export async function unsubscribePush(userId, endpoint) {
  if (!endpoint) {
    throw new AppError('VALIDATION_ERROR', 'Push endpoint is required.', 400);
  }

  await PushSubscription.deleteOne({ userId, endpoint });

  logger.info({
    event: 'push_unsubscribed',
    userId,
  });

  return { message: 'Push subscription removed successfully.' };
}
