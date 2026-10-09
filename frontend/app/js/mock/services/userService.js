/**
 * WorkCred User & Worker Search Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { validateUpdateProfile } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { haversineKm, roundedDistanceLabel } from '../../../../shared/geo.js';

export function getMe(userId) {
  const db = readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
  return { user: structuredClone(user) };
}

export function updateMe(userId, updates) {
  const errors = validateUpdateProfile(updates);
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors[0].message, 400, errors);

  const db = readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new AppError('UNAUTHENTICATED', 'User not found.', 401);

  const allowed = ['name', 'skills', 'rate', 'rateUnit', 'area', 'city', 'profileComplete', 'bio', 'location'];
  for (const key of allowed) {
    if (key in updates) user[key] = updates[key];
  }
  if (!user.passportSlug && user.role === 'worker' && user.name) {
    user.passportSlug = `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(100 + Math.random() * 900)}`;
  }

  writeDb(db);
  return { user: structuredClone(user) };
}

export function setRole(userId, role) {
  const db = readDb();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
  if (user.role) throw new AppError('ROLE_ALREADY_SET', 'Role is already set and cannot be changed.', 400);
  if (!['worker', 'customer'].includes(role)) throw new AppError('INVALID_ROLE', 'Role must be worker or customer.', 400);

  user.role = role;
  if (role === 'worker' && !user.passportSlug && user.name) {
    user.passportSlug = `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(100 + Math.random() * 900)}`;
  }

  writeDb(db);
  return { user: structuredClone(user) };
}

export function searchWorkers(query = {}) {
  const db = readDb();
  const {
    skill,
    lat = 18.5204,
    lng = 73.8567,
    radiusKm = 5,
    minRating = 0,
    maxRate = 99999,
    sortBy = 'distance',
    cursor = 0,
    limit = 20,
  } = query;

  let workers = db.users.filter((u) => u.role === 'worker' && u.profileComplete);

  if (skill) {
    workers = workers.filter((w) => w.skills.includes(skill));
  }
  if (maxRate < 99999) {
    workers = workers.filter((w) => w.rate && w.rate <= maxRate);
  }

  const results = workers.map((worker) => {
    const wLat = worker.location?.coordinates?.[1] ?? 18.5204;
    const wLng = worker.location?.coordinates?.[0] ?? 73.8567;
    const distanceKm = haversineKm(lat, lng, wLat, wLng);

    // Calculate rating and jobs count from passport entries
    const entries = db.passportEntries.filter((p) => p.workerId === worker.id);
    const jobsCompleted = entries.length;
    const totalRating = entries.reduce((acc, p) => acc + (p.fields?.rating || 5), 0);
    const averageRating = jobsCompleted > 0 ? Math.round((totalRating / jobsCompleted) * 10) / 10 : 4.8;

    return {
      id: worker.id,
      name: worker.name,
      skills: worker.skills,
      rate: worker.rate,
      rateUnit: worker.rateUnit,
      area: worker.area,
      city: worker.city,
      distanceKm,
      distanceLabel: roundedDistanceLabel(distanceKm),
      rating: averageRating,
      jobsCompleted,
      passportSlug: worker.passportSlug,
      isSample: Boolean(worker.isSample),
    };
  }).filter((w) => w.distanceKm <= radiusKm && w.rating >= minRating);

  if (sortBy === 'distance') {
    results.sort((a, b) => a.distanceKm - b.distanceKm);
  } else if (sortBy === 'rating') {
    results.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'price') {
    results.sort((a, b) => (a.rate || 0) - (b.rate || 0));
  }

  const start = Number(cursor) || 0;
  const pageSize = Math.min(50, Number(limit) || 20);
  const items = results.slice(start, start + pageSize);
  const nextCursor = start + pageSize < results.length ? start + pageSize : null;

  return { workers: items, nextCursor, total: results.length };
}

export function getWorkerById(workerId, currentUserId) {
  const db = readDb();
  const worker = db.users.find((u) => u.id === workerId && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Worker not found.', 404);

  const entries = db.passportEntries.filter((p) => p.workerId === worker.id);
  const jobsCompleted = entries.length;
  const totalRating = entries.reduce((acc, p) => acc + (p.fields?.rating || 5), 0);
  const averageRating = jobsCompleted > 0 ? Math.round((totalRating / jobsCompleted) * 10) / 10 : 4.8;

  const endorsementsCount = db.endorsements.filter((e) => e.workerId === worker.id).length;
  const isFollowing = db.follows.some((f) => f.fromUserId === currentUserId && f.toUserId === worker.id && f.type === 'follow');
  const isSaved = db.follows.some((f) => f.fromUserId === currentUserId && f.toUserId === worker.id && f.type === 'save');

  return {
    worker: {
      id: worker.id,
      name: worker.name,
      skills: worker.skills,
      rate: worker.rate,
      rateUnit: worker.rateUnit,
      area: worker.area,
      city: worker.city,
      bio: worker.bio,
      rating: averageRating,
      jobsCompleted,
      endorsementsCount,
      passportSlug: worker.passportSlug,
      isFollowing,
      isSaved,
      isSample: Boolean(worker.isSample),
    },
  };
}
