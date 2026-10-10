/**
 * WorkCred Passport Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { GENESIS_HASH, computeEntryHash, verifyChain } from '../../../../shared/hash.js';
import { AppError } from '../../../../shared/errors.js';
import { validatePassportEntryPatch } from '../../../../shared/validators.js';
import { generateQrSvg } from '../../utils/qr.js';

// Rate limit counter for public passport views (60 per minute simulation)
const publicRateLimitMap = new Map();

export async function addPassportEntry(params) {
  const { bookingId, workerId, customerId, skill, hoursWorked, amountPaid, startedAt, finishedAt, rating } = params;
  const db = readDb();

  const workerEntries = db.passportEntries.filter((p) => p.workerId === workerId).sort((a, b) => a.seq - b.seq);
  const lastEntry = workerEntries.length > 0 ? workerEntries[workerEntries.length - 1] : null;
  const seq = (lastEntry?.seq || 0) + 1;
  const prevHash = lastEntry?.hash || GENESIS_HASH;

  const fields = {
    bookingId,
    workerId,
    customerId,
    skill,
    hoursWorked: Number(hoursWorked),
    amountPaid: Number(amountPaid),
    startedAt,
    finishedAt,
    rating: Number(rating),
  };

  const hash = await computeEntryHash(prevHash, fields);

  const newEntry = {
    id: `pass-${workerId}-${seq}`,
    workerId,
    seq,
    prevHash,
    hash,
    fields,
    visibility: 'public',
    isMasked: true,
    createdAt: new Date().toISOString(),
    isSample: false,
  };

  db.passportEntries.push(newEntry);
  writeDb(db);

  return { entry: structuredClone(newEntry) };
}

export function getMyPassport(workerId) {
  const db = readDb();
  const entries = db.passportEntries.filter((p) => p.workerId === workerId).sort((a, b) => b.seq - a.seq);
  return { passportEntries: structuredClone(entries) };
}

export function checkPublicRateLimit(ipOrKey = 'global-public') {
  const now = Date.now();
  const windowMs = 60000;
  const maxReq = 60;
  let record = publicRateLimitMap.get(ipOrKey);
  if (!record || now - record.resetAt > windowMs) {
    record = { count: 1, resetAt: now + windowMs };
    publicRateLimitMap.set(ipOrKey, record);
    return;
  }
  record.count++;
  if (record.count > maxReq) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    throw new AppError('RATE_LIMITED', `Too many requests. Please try again in ${retryAfterSec} seconds.`, 429, { retryAfter: retryAfterSec });
  }
}

export function updatePassportEntry(workerId, entryId, updates = {}) {
  const errors = validatePassportEntryPatch(updates);
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', errors[0].message, 400, { errors });
  }

  const db = readDb();
  const entry = db.passportEntries.find((p) => p.id === entryId);
  if (!entry) throw new AppError('NOT_FOUND', 'Passport entry not found.', 404);
  if (entry.workerId !== workerId) throw new AppError('FORBIDDEN', 'Only the owner of this Passport can update entry settings.', 403);

  if ('visibility' in updates) {
    entry.visibility = updates.visibility;
  }
  if ('isMasked' in updates) {
    entry.isMasked = updates.isMasked;
  }

  writeDb(db);
  return { entry: structuredClone(entry) };
}

export function getPublicPassport(slug) {
  checkPublicRateLimit(`passport-view-${slug}`);

  const db = readDb();
  const worker = db.users.find((u) => u.passportSlug === slug && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Work Passport not found for this user.', 404);

  // Filter ONLY public entries
  const allWorkerEntries = db.passportEntries.filter((p) => p.workerId === worker.id);
  const hiddenCount = allWorkerEntries.filter((p) => p.visibility !== 'public').length;
  const entries = allWorkerEntries
    .filter((p) => p.visibility === 'public')
    .sort((a, b) => b.seq - a.seq)
    .map((p) => {
      const customer = db.users.find((u) => u.id === p.fields.customerId);
      let customerDisplayName = 'Customer';
      if (customer?.name) {
        if (p.isMasked) {
          const parts = customer.name.trim().split(/\s+/);
          customerDisplayName = parts.map((part) => part[0] + '***').join(' ');
        } else {
          customerDisplayName = customer.name;
        }
      }

      return {
        id: p.id,
        seq: p.seq,
        hashPrefix: p.hash ? p.hash.slice(0, 8) : '',
        skill: p.fields.skill,
        hoursWorked: p.fields.hoursWorked,
        amountPaid: p.fields.amountPaid,
        rating: p.fields.rating,
        finishedAt: p.fields.finishedAt,
        startedAt: p.fields.startedAt,
        customerName: customerDisplayName,
        isMasked: p.isMasked,
        isSample: Boolean(p.isSample),
      };
    });

  const totalJobs = allWorkerEntries.length;
  const totalRating = allWorkerEntries.reduce((acc, p) => acc + (p.fields?.rating || 5), 0);
  const averageRating = totalJobs > 0 ? Math.round((totalRating / totalJobs) * 10) / 10 : 4.8;
  const totalHours = allWorkerEntries.reduce((acc, p) => acc + (p.fields?.hoursWorked || 0), 0);

  // Skill counts breakdown
  const topSkillsMap = {};
  for (const entry of allWorkerEntries) {
    if (entry.fields?.skill) {
      topSkillsMap[entry.fields.skill] = (topSkillsMap[entry.fields.skill] || 0) + 1;
    }
  }
  const topSkills = Object.entries(topSkillsMap).map(([skill, count]) => ({ skill, count }));

  return {
    worker: {
      id: worker.id,
      name: worker.name,
      avatarUrl: worker.photoUrl || worker.avatarUrl || null,
      skills: worker.skills || [],
      mainSkill: worker.mainSkill || worker.skills?.[0] || 'Helper',
      area: worker.area || 'Local',
      city: worker.city || 'Bangalore',
      rating: averageRating,
      totalJobs,
      totalHours,
      hiddenRecordsCount: hiddenCount,
      topSkills,
      memberSince: worker.createdAt || '2024-01-01T00:00:00.000Z',
      passportSlug: worker.passportSlug,
      phoneVerified: true,
      isDisabled: Boolean(worker.isPassportDisabled),
    },
    passportEntries: entries,
  };
}

export async function verifyPassportChain(slug) {
  checkPublicRateLimit(`passport-verify-${slug}`);

  const db = readDb();
  const worker = db.users.find((u) => u.passportSlug === slug && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Work Passport not found.', 404);

  const allEntries = db.passportEntries.filter((p) => p.workerId === worker.id).sort((a, b) => a.seq - b.seq);
  const verification = await verifyChain(allEntries);

  const hiddenCount = allEntries.filter((p) => p.visibility !== 'public').length;

  return {
    workerId: worker.id,
    passportSlug: slug,
    totalRecords: allEntries.length,
    hiddenRecords: hiddenCount,
    ...verification,
  };
}

export function getPassportQrSvg(slug) {
  const db = readDb();
  const worker = db.users.find((u) => u.passportSlug === slug && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Work Passport not found.', 404);

  const url = `https://workcred.in/p/${slug}`;
  return generateQrSvg(url, {
    title: `Work Passport QR for ${worker.name}`,
    margin: 4,
    sizePx: 240,
  });
}

export function tamperEntry(workerId, seq = 1) {
  const db = readDb();
  const entry = db.passportEntries.find((p) => p.workerId === workerId && p.seq === seq);
  if (!entry) throw new AppError('NOT_FOUND', 'Entry not found to tamper.', 404);

  if (entry._originalAmountPaid === undefined) {
    entry._originalAmountPaid = entry.fields.amountPaid;
  }
  entry.fields.amountPaid = 999999; // Corrupt stored field
  writeDb(db);
  return { message: `Tampered passport entry seq ${seq} for worker ${workerId}.`, entry: structuredClone(entry) };
}

export function resetTamper(workerId, seq = 1) {
  const db = readDb();
  const entry = db.passportEntries.find((p) => p.workerId === workerId && p.seq === seq);
  if (!entry) throw new AppError('NOT_FOUND', 'Entry not found to restore.', 404);

  // Reset to original nominal value
  if (entry._originalAmountPaid !== undefined) {
    entry.fields.amountPaid = entry._originalAmountPaid;
    delete entry._originalAmountPaid;
  }
  writeDb(db);
  return { message: `Restored passport entry seq ${seq} for worker ${workerId}.`, entry: structuredClone(entry) };
}


