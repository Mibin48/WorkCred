/**
 * WorkCred Radar (Free Now) Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { validateAvailability } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { haversineKm, roundedDistanceLabel } from '../../../../shared/geo.js';
import { eventBus } from '../events.js';
import { EVENT_NAMES } from '../../../../shared/constants.js';

export function setAvailability(workerId, body) {
  const errors = validateAvailability(body);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const worker = db.users.find((u) => u.id === workerId && u.role === 'worker');
  if (!worker) throw new AppError('WRONG_ROLE', 'Only workers can go Free Now.', 403);

  const { hours, lat, lng } = body;
  const now = Date.now();
  const expiresAt = new Date(now + Number(hours) * 3600000).toISOString();

  // Replace existing availability window if any
  db.availability = db.availability.filter((a) => a.workerId !== workerId);

  const avail = {
    id: `avail-${workerId}`,
    workerId,
    skill: worker.skills[0] || 'helper',
    hours: Number(hours),
    rate: worker.rate || 500,
    rateUnit: worker.rateUnit || 'day',
    location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
    createdAt: new Date(now).toISOString(),
    expiresAt,
    isSample: false,
  };

  db.availability.unshift(avail);
  writeDb(db);

  eventBus.emit(EVENT_NAMES.WORKER_FREE, { workerId, availability: avail });
  return { availability: structuredClone(avail) };
}

export function getMyAvailability(workerId) {
  const db = readDb();
  const now = new Date().toISOString();
  const active = db.availability.find((a) => a.workerId === workerId && a.expiresAt > now);
  return { availability: active ? structuredClone(active) : null, isFreeNow: Boolean(active) };
}

export function clearAvailability(workerId) {
  const db = readDb();
  db.availability = db.availability.filter((a) => a.workerId !== workerId);
  writeDb(db);

  eventBus.emit(EVENT_NAMES.WORKER_BUSY, { workerId });
  return { message: 'Free Now status cleared.' };
}

export function getNearbyAvailability(query = {}) {
  const db = readDb();
  const now = new Date().toISOString();
  const { lat = 18.5204, lng = 73.8567, radiusKm = 3, skill } = query;

  // Filter non-expired availability
  const active = db.availability.filter((a) => a.expiresAt > now);

  const results = active.map((a) => {
    const worker = db.users.find((u) => u.id === a.workerId);
    if (!worker) return null;
    if (skill && worker.skills && !worker.skills.includes(skill)) return null;

    const wLat = a.location?.coordinates?.[1] ?? 18.5204;
    const wLng = a.location?.coordinates?.[0] ?? 73.8567;
    const dist = haversineKm(lat, lng, wLat, wLng);

    if (dist > Number(radiusKm)) return null;

    const entries = db.passportEntries.filter((p) => p.workerId === worker.id);
    const jobsCompleted = entries.length;
    const totalRating = entries.reduce((acc, p) => acc + (p.fields?.rating || 5), 0);
    const averageRating = jobsCompleted > 0 ? Math.round((totalRating / jobsCompleted) * 10) / 10 : 4.8;

    return {
      id: a.id,
      workerId: worker.id,
      workerName: worker.name,
      skill: a.skill,
      rate: a.rate,
      rateUnit: a.rateUnit,
      hours: a.hours,
      expiresAt: a.expiresAt,
      rating: averageRating,
      jobsCompleted,
      distanceKm: dist,
      distanceLabel: roundedDistanceLabel(dist),
      passportSlug: worker.passportSlug,
      isSample: Boolean(a.isSample),
    };
  }).filter(Boolean);

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return { workers: results };
}

export function cleanExpiredAvailability() {
  const db = readDb();
  const now = new Date().toISOString();
  db.availability = db.availability.filter((a) => a.expiresAt > now);
  writeDb(db);
}
