/**
 * WorkCred Push Notification Stub Service
 * Logs push notification dispatches without sending real network requests.
 * Real VAPID/Web-Push delivery is deferred post-launch.
 */

import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Dispatch a push notification to user's registered devices.
 * @param {string} userId
 * @param {object} payload
 * @param {string} payload.title
 * @param {string} payload.body
 * @param {string} [payload.url]
 * @param {string} [payload.eventName]
 */
export async function notify(userId, { title, body, url, eventName = 'push_notification' } = {}) {
  if (config.PUSH_ENABLED === 'true') {
    // Real VAPID web-push delivery stub (active post-launch)
    logger.info({
      event: 'push_sent',
      userId,
      eventName,
    });
  } else {
    // Stub mode: Log dispatch without sensitive payload content
    logger.info({
      event: 'push_stub_notify',
      userId,
      eventName,
    });
  }
}
