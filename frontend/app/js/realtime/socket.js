/**
 * WorkCred Realtime Socket Stub & Event Bus Adapter
 * Exposes connect, disconnect, on, off, joinArea.
 */

import { config } from '../config.js';
import { eventBus } from '../mock/events.js';

let connected = false;
let currentArea = null;

export const socket = {
  connect() {
    connected = true;
    return Promise.resolve(true);
  },

  disconnect() {
    connected = false;
  },

  on(event, callback) {
    if (config.USE_MOCK) {
      return eventBus.on(event, callback);
    }
    return () => {};
  },

  off(event, callback) {
    if (config.USE_MOCK) {
      eventBus.off(event, callback);
    }
  },

  joinArea(area) {
    currentArea = area;
    return { joined: area };
  },

  isConnected() {
    return connected;
  },
};
