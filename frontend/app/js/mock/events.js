/**
 * WorkCred In-Memory Event Bus
 * Pure ES module for browser and Node 20.
 */

const listeners = new Map();

export const eventBus = {
  on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (listeners.has(event)) {
      listeners.get(event).delete(callback);
    }
  },

  emit(event, payload) {
    const callbacks = listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(structuredClone(payload));
        } catch { /* ignore handler errors */ }
      });
    }
  },

  removeAllListeners() {
    listeners.clear();
  },
};
