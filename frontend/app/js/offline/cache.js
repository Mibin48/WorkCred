/**
 * WorkCred App-Level Offline Data Cache
 * Pure ES module using IndexedDB for whitelisted GET response caching.
 *
 * WHITELIST:
 * - /users/me
 * - /workers (first page)
 * - /bookings (and booking details, with startCode/finishCode STRIPPED)
 * - /passport/me
 * - /passport/:slug
 * - /feed (first page)
 * - /follows (saved list)
 * - /jobs, /jobs/mine (first page)
 *
 * SECURITY: Never caches authentication tokens, secrets, or handshake codes.
 * ISOLATION: Entries tagged with userId; cleared on logout or user switch.
 */

const DB_NAME = 'workcred_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'responses';

let dbPromise = null;

function getDb() {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
          store.createIndex('userId', 'userId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

/**
 * Checks if a GET path/query is whitelisted for offline caching.
 */
export function isWhitelistedPath(path) {
  const clean = path.split('?')[0];

  // Whitelisted exact paths or regex patterns
  if (clean === '/users/me') return true;
  if (clean === '/passport/me') return true;
  if (clean === '/feed') return true;
  if (clean === '/follows') return true;
  if (clean === '/jobs' || clean === '/jobs/mine') return true;
  if (clean === '/workers') return true;
  if (clean.match(/^\/workers\/[^/]+$/)) return true;
  if (clean === '/bookings') return true;
  if (clean.match(/^\/bookings\/[^/]+$/)) return true;
  if (clean.match(/^\/passport\/[^/]+$/)) return true;
  if (clean.match(/^\/passport\/[^/]+\/verify$/)) return true;
  if (clean.match(/^\/receipts\/[^/]+$/)) return true;

  return false;
}

/**
 * Strips sensitive data like startCode and finishCode from customer booking objects.
 */
export function sanitizeForOffline(path, data) {
  if (!data || typeof data !== 'object') return data;
  const clone = structuredClone(data);

  // Strip handshake codes from booking responses
  if (clone.booking) {
    delete clone.booking.startCode;
    delete clone.booking.finishCode;
  }
  if (Array.isArray(clone.bookings)) {
    clone.bookings.forEach((b) => {
      delete b.startCode;
      delete b.finishCode;
    });
  }
  if (clone.startCode) delete clone.startCode;
  if (clone.finishCode) delete clone.finishCode;

  return clone;
}

/**
 * Store a whitelisted GET response
 */
export async function cacheResponse(userId, path, data) {
  if (!isWhitelistedPath(path)) return;
  const db = await getDb();
  if (!db) return;

  const sanitized = sanitizeForOffline(path, data);
  const cacheKey = `${userId || 'anon'}:${path}`;
  const record = {
    cacheKey,
    userId: userId || 'anon',
    path,
    data: sanitized,
    cachedAt: new Date().toISOString(),
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieve cached GET response
 */
export async function getCachedResponse(userId, path) {
  const db = await getDb();
  if (!db) return null;

  const cacheKey = `${userId || 'anon'}:${path}`;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(cacheKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Clear all offline cache for a user or on logout
 */
export async function clearOfflineCache(userId = null) {
  const db = await getDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (userId) {
        const index = store.index('userId');
        const req = index.openCursor(IDBKeyRange.only(userId));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      } else {
        store.clear();
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
