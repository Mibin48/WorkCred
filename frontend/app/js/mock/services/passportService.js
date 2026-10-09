/**
 * WorkCred Passport Mock Service
 */

import { readDb, writeDb } from '../db.js';
import { GENESIS_HASH, computeEntryHash, verifyChain } from '../../../../shared/hash.js';
import { AppError } from '../../../../shared/errors.js';

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

export function updatePassportEntry(workerId, entryId, updates = {}) {
  const db = readDb();
  const entry = db.passportEntries.find((p) => p.id === entryId && p.workerId === workerId);
  if (!entry) throw new AppError('NOT_FOUND', 'Passport entry not found.', 404);

  if ('visibility' in updates && ['public', 'private'].includes(updates.visibility)) {
    entry.visibility = updates.visibility;
  }
  if ('isMasked' in updates && typeof updates.isMasked === 'boolean') {
    entry.isMasked = updates.isMasked;
  }

  writeDb(db);
  return { entry: structuredClone(entry) };
}

export function getPublicPassport(slug) {
  const db = readDb();
  const worker = db.users.find((u) => u.passportSlug === slug && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Work Passport not found for this user.', 404);

  const entries = db.passportEntries
    .filter((p) => p.workerId === worker.id && p.visibility === 'public')
    .sort((a, b) => b.seq - a.seq)
    .map((p) => {
      const copy = structuredClone(p);
      if (copy.isMasked) {
        const customer = db.users.find((u) => u.id === copy.fields.customerId);
        if (customer && customer.name) {
          const parts = customer.name.trim().split(/\s+/);
          copy.customerNameMasked = parts.map((part) => part[0] + '***').join(' ');
        } else {
          copy.customerNameMasked = 'Local Customer';
        }
      }
      return copy;
    });

  const totalJobs = db.passportEntries.filter((p) => p.workerId === worker.id).length;
  const totalRating = db.passportEntries.filter((p) => p.workerId === worker.id).reduce((acc, p) => acc + (p.fields?.rating || 5), 0);
  const averageRating = totalJobs > 0 ? Math.round((totalRating / totalJobs) * 10) / 10 : 4.8;

  return {
    worker: {
      id: worker.id,
      name: worker.name,
      skills: worker.skills,
      area: worker.area,
      city: worker.city,
      rating: averageRating,
      totalJobs,
      passportSlug: worker.passportSlug,
    },
    passportEntries: entries,
  };
}

export async function verifyPassportChain(slug) {
  const db = readDb();
  const worker = db.users.find((u) => u.passportSlug === slug && u.role === 'worker');
  if (!worker) throw new AppError('NOT_FOUND', 'Work Passport not found.', 404);

  const allEntries = db.passportEntries.filter((p) => p.workerId === worker.id).sort((a, b) => a.seq - b.seq);
  const verification = await verifyChain(allEntries);

  return {
    workerId: worker.id,
    passportSlug: slug,
    ...verification,
  };
}

export function tamperEntry(workerId, seq = 1) {
  const db = readDb();
  const entry = db.passportEntries.find((p) => p.workerId === workerId && p.seq === seq);
  if (!entry) throw new AppError('NOT_FOUND', 'Entry not found to tamper.', 404);

  entry.fields.amountPaid = 999999; // Corrupt stored field
  writeDb(db);
  return { message: `Tampered passport entry seq ${seq} for worker ${workerId}.`, entry: structuredClone(entry) };
}
