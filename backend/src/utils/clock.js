/**
 * WorkCred Server Clock Utility
 * Centralizes all time queries for the backend.
 * Provides deterministic time travel testing capabilities in NODE_ENV=test.
 */

let overrideTime = null;

export const clock = {
  /**
   * Returns current epoch timestamp in milliseconds.
   */
  now() {
    if (process.env.NODE_ENV === 'test' && overrideTime !== null) {
      return overrideTime;
    }
    return Date.now();
  },

  /**
   * Returns a Date object representing current clock time.
   */
  toDate() {
    return new Date(this.now());
  },

  /**
   * Returns current clock time as ISO string.
   */
  toISOString() {
    return new Date(this.now()).toISOString();
  },

  /**
   * Set fixed time (Allowed ONLY when NODE_ENV=test).
   */
  setTime(timeMs) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('clock.setTime is only permitted in test environment.');
    }
    overrideTime = typeof timeMs === 'number' ? timeMs : new Date(timeMs).getTime();
  },

  /**
   * Advance time by offset in ms (Allowed ONLY when NODE_ENV=test).
   */
  advance(ms) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('clock.advance is only permitted in test environment.');
    }
    const current = this.now();
    overrideTime = current + ms;
  },

  /**
   * Reset time override back to real clock (Allowed ONLY when NODE_ENV=test).
   */
  resetTime() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('clock.resetTime is only permitted in test environment.');
    }
    overrideTime = null;
  },
};
