/**
 * WorkCred Isomorphic SHA-256 Passport Hash Chain
 * Pure ES Module running in Browser and Node 20.
 * Uses globalThis.crypto.subtle.
 */

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export function canonicalJSON(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map((item) => canonicalJSON(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const pairs = keys.map((key) => JSON.stringify(key) + ':' + canonicalJSON(val[key]));
  return '{' + pairs.join(',') + '}';
}

export async function sha256Hex(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function extractPassportFields(entry) {
  if (entry.fields) return entry.fields;
  const {
    bookingId,
    workerId,
    customerId,
    skill,
    hoursWorked,
    amountPaid,
    startedAt,
    finishedAt,
    rating,
  } = entry;
  return {
    bookingId,
    workerId,
    customerId,
    skill,
    hoursWorked,
    amountPaid,
    startedAt,
    finishedAt,
    rating,
  };
}

export async function computeEntryHash(prevHash, fields) {
  const payload = (prevHash ?? GENESIS_HASH) + canonicalJSON(fields);
  return sha256Hex(payload);
}

export async function verifyChain(entries = []) {
  if (!entries || entries.length === 0) {
    return { valid: true, checkedEntries: 0, brokenAtSeq: null };
  }

  // Sort entries by sequence number ascending
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const expectedSeq = i + 1;

    if (entry.seq !== expectedSeq) {
      return { valid: false, checkedEntries: i, brokenAtSeq: entry.seq ?? expectedSeq };
    }

    if (entry.prevHash !== expectedPrevHash) {
      return { valid: false, checkedEntries: i, brokenAtSeq: entry.seq };
    }

    const fields = extractPassportFields(entry);
    const calculatedHash = await computeEntryHash(entry.prevHash, fields);

    if (entry.hash !== calculatedHash) {
      return { valid: false, checkedEntries: i, brokenAtSeq: entry.seq };
    }

    expectedPrevHash = entry.hash;
  }

  return { valid: true, checkedEntries: sorted.length, brokenAtSeq: null };
}
