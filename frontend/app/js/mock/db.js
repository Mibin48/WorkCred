/**
 * WorkCred Environment-Aware Database Adapter
 * Supports localStorage in browser and in-memory storage in Node 20.
 * Pure ES module.
 */

import { seed } from './seed.js';

const MOCK_STORAGE_KEY = 'workcred_mock_v1';
let memoryDb = null;

function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function readDb() {
  if (isBrowser()) {
    try {
      const stored = JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY) || 'null');
      if (stored && stored.version === seed.version) return stored;
    } catch { /* restore clean seed if corrupted */ }
  } else if (memoryDb && memoryDb.version === seed.version) {
    return memoryDb;
  }
  const cleanSeed = structuredClone(seed);
  if (isBrowser()) {
    try { localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(cleanSeed)); } catch { /* ignore */ }
  } else {
    memoryDb = cleanSeed;
  }
  return cleanSeed;
}

export function writeDb(db) {
  if (isBrowser()) {
    try { localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db)); } catch { /* ignore */ }
  } else {
    memoryDb = db;
  }
  return db;
}

export function resetDb() {
  const cleanSeed = structuredClone(seed);
  writeDb(cleanSeed);
  return cleanSeed;
}
