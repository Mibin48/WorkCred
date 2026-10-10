/**
 * WorkCred In-Process Realtime Event Emitter
 * Exposes emit(eventName, payload, targets)
 * Targets: { userIds: string[], areaKeys: string[] }
 * In Step 11, with no Socket.io listeners attached, this runs as a clean, structured in-process emitter.
 * Step 13 will wire Socket.io broadcast adapters to this emitter.
 */

import { logger } from '../utils/logger.js';

const listeners = new Map();

export const realtimeEmitter = {
  /**
   * Register a listener for an event.
   * @param {string} eventName
   * @param {Function} handler
   * @returns {Function} unsubscribe function
   */
  on(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  },

  /**
   * Remove a registered listener.
   */
  off(eventName, handler) {
    if (listeners.has(eventName)) {
      listeners.get(eventName).delete(handler);
    }
  },

  /**
   * Emit an event to targets.
   * @param {string} eventName
   * @param {Object} payload
   * @param {Object} [targets]
   * @param {string[]} [targets.userIds]
   * @param {string[]} [targets.areaKeys]
   */
  emit(eventName, payload, targets = {}) {
    const userIds = Array.isArray(targets.userIds) ? targets.userIds : [];
    const areaKeys = Array.isArray(targets.areaKeys) ? targets.areaKeys : [];

    logger.debug({
      event: 'realtime_event_emitted',
      eventName,
      targetUserCount: userIds.length,
      targetAreaCount: areaKeys.length,
    });

    const handlers = listeners.get(eventName);
    if (handlers && handlers.size > 0) {
      const cloned = structuredClone(payload);
      for (const handler of handlers) {
        try {
          handler(cloned, { userIds, areaKeys });
        } catch (err) {
          logger.warn({
            event: 'realtime_handler_error',
            eventName,
            error: err.message,
          });
        }
      }
    }
  },

  /**
   * Remove all registered listeners (used in testing).
   */
  removeAllListeners() {
    listeners.clear();
  },
};
