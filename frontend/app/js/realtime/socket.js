/**
 * WorkCred Realtime Socket Client & Event Bus Adapter
 * Phase B Real Realtime Client:
 * - Dynamically loads Socket.io client from backend (/socket.io/socket.io.js)
 * - Authenticates with in-memory access token
 * - Handles automatic auth token refresh via window.__workcred_socket_refresh
 * - Supports area:join with cell subscriptions
 * - Graceful fallback to mock eventBus when in mock mode
 */

import { config } from '../config.js';
import { store } from '../store.js';
import { getAccessToken } from '../api/http.js';

let socketInstance = null;
let currentArea = null;
let loadPromise = null;
const eventHandlers = new Map();

/**
 * Dynamically loads the Socket.io client script from the same-origin backend
 */
async function loadSocketIoScript() {
  if (typeof window === 'undefined') return false;
  if (window.io) return true;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="socket.io.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.io)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.io));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return loadPromise;
}

export const socket = {
  /**
   * Connect to Socket.io server
   */
  async connect() {
    if (config.USE_MOCK) {
      return true;
    }

    const hasIo = await loadSocketIoScript();
    if (!hasIo || !window.io) {
      return false;
    }

    const token = getAccessToken() || store.get().session?.accessToken;
    if (!token) {
      // Disconnect if no active session
      this.disconnect();
      return false;
    }

    if (socketInstance && socketInstance.connected) {
      return true;
    }

    try {
      socketInstance = window.io('/', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      // Register global refresh callback called by http.js when accessToken rotates
      window.__workcred_socket_refresh = (newToken) => {
        if (socketInstance) {
          socketInstance.auth = { token: newToken };
          if (socketInstance.connected) {
            socketInstance.emit('auth:refresh', { token: newToken });
          }
        }
      };

      socketInstance.on('connect', () => {
        // Re-join active area if previously joined
        if (currentArea) {
          this.joinArea(currentArea);
        }
      });

      // Bind all registered event handlers
      for (const [eventName, callbacks] of eventHandlers.entries()) {
        callbacks.forEach((cb) => {
          socketInstance.on(eventName, cb);
        });
      }

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Disconnect socket connection
   */
  disconnect() {
    if (socketInstance) {
      try {
        socketInstance.disconnect();
      } catch { /* ignore */ }
      socketInstance = null;
    }
  },

  /**
   * Subscribe to a realtime event
   */
  on(event, callback) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set());
    }
    eventHandlers.get(event).add(callback);

    if (config.USE_MOCK) {
      import('../mock/events.js').then(({ eventBus }) => {
        eventBus.on(event, callback);
      }).catch(() => {});
    } else if (socketInstance) {
      socketInstance.on(event, callback);
    }

    return () => this.off(event, callback);
  },

  /**
   * Unsubscribe from a realtime event
   */
  off(event, callback) {
    const set = eventHandlers.get(event);
    if (set) {
      set.delete(callback);
    }

    if (config.USE_MOCK) {
      import('../mock/events.js').then(({ eventBus }) => {
        eventBus.off(event, callback);
      }).catch(() => {});
    } else if (socketInstance) {
      socketInstance.off(event, callback);
    }
  },

  /**
   * Join an area room for localized events
   * @param {{ lat: number, lng: number, radiusKm?: number }|string} area
   */
  joinArea(area) {
    currentArea = area;
    if (socketInstance && socketInstance.connected) {
      if (typeof area === 'object' && area.lat && area.lng) {
        socketInstance.emit('area:join', {
          lat: Number(area.lat),
          lng: Number(area.lng),
          radiusKm: Number(area.radiusKm) || 5,
        });
      }
    }
    return { joined: area };
  },

  /**
   * Check connection status
   */
  isConnected() {
    return Boolean(socketInstance && socketInstance.connected);
  },
};
