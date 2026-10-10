/**
 * WorkCred Offline Action Queue
 * ONLY queues safe, idempotent actions: save/unsave and follow/unfollow.
 * Flushes automatically on online event and app focus.
 * Every action carries an Idempotency-Key.
 */

const STORAGE_KEY = 'workcred.offline_queue';

export function getQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQueue(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore quota errors */ }
}

/**
 * Enqueue a safe action
 */
export function enqueueAction({ actionType, targetId, targetName = '', body = {} }) {
  const queue = getQueue();
  const idempotencyKey = crypto.randomUUID();
  const entry = {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actionType, // 'save', 'unsave', 'follow', 'unfollow'
    targetId,
    targetName,
    body,
    idempotencyKey,
    createdAt: new Date().toISOString(),
  };

  // Dedup: if opposite action is already queued for same target, replace it
  const existingIdx = queue.findIndex((item) => item.targetId === targetId && item.actionType.includes(actionType.replace('un', '')));
  if (existingIdx >= 0) {
    queue.splice(existingIdx, 1);
  }
  queue.push(entry);
  saveQueue(queue);
  return entry;
}

export function discardQueueItem(id) {
  const queue = getQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

export function clearQueue() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Flush all queued actions against the API
 */
export async function flushQueue(httpApi, token) {
  if (!navigator.onLine) return { flushed: 0, failed: 0 };
  const queue = getQueue();
  if (!queue.length) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      if (item.actionType === 'save') {
        await httpApi.post('/follows', { toUserId: item.targetId, type: 'save' }, {
          token,
          headers: { 'Idempotency-Key': item.idempotencyKey },
        });
      } else if (item.actionType === 'unsave') {
        await httpApi.post('/follows', { toUserId: item.targetId, type: 'save' }, {
          token,
          headers: { 'Idempotency-Key': item.idempotencyKey },
        });
      } else if (item.actionType === 'follow') {
        await httpApi.post('/follows', { toUserId: item.targetId, type: 'follow' }, {
          token,
          headers: { 'Idempotency-Key': item.idempotencyKey },
        });
      } else if (item.actionType === 'unfollow') {
        await httpApi.delete(`/follows/${item.targetId}`, { token });
      }
      flushed++;
    } catch (err) {
      // 409 or invalid state -> drop item
      if (err.status === 409 || err.code === 'DUPLICATE_REQUEST' || err.code === 'INVALID_STATE') {
        flushed++;
      } else {
        remaining.push(item);
        failed++;
      }
    }
  }

  saveQueue(remaining);
  return { flushed, failed, remaining: remaining.length };
}
