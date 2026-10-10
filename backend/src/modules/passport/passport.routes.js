/**
 * WorkCred Work Passport Ledger Routes
 * Cryptographically verified proof-of-work chain queries, public passport presentation,
 * and entry privacy toggles.
 */

import express from 'express';
import { PassportEntry } from '../../models/PassportEntry.js';
import { User } from '../../models/User.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ok } from '../../utils/response.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../../../shared/errors.js';
import { verifyChain, computeEntryHash } from '../../../../shared/hash.js';
import { config } from '../../config/env.js';

export const passportRouter = express.Router();

// 1. Worker gets own full passport ledger
passportRouter.get(
  '/me',
  authenticate,
  requireRole('worker'),
  asyncHandler(async (req, res) => {
    const worker = await User.findById(req.user.id);
    if (!worker) {
      throw new AppError('UNAUTHENTICATED', 'Worker not found.', 401);
    }

    const entries = await PassportEntry.find({ workerId: worker.id }).sort({ seq: 1 });

    // Fetch customer names to display with privacy
    const customerIds = entries.map((e) => e.fields?.customerId).filter(Boolean);
    const customers = await User.find({ _id: { $in: customerIds } }).select('_id name');
    const customerNameMap = new Map();
    customers.forEach((c) => {
      customerNameMap.set(c.id, c.name ? c.name.trim().split(/\s+/)[0] : 'Customer');
    });

    const formattedEntries = entries.map((e) => {
      const obj = e.toJSON();
      const customerFirstName = customerNameMap.get(e.fields?.customerId) || 'Customer';
      obj.customerName = e.isMasked ? `${customerFirstName.slice(0, 1)}***` : customerFirstName;
      return obj;
    });

    return ok(res, {
      worker: {
        id: worker.id,
        name: worker.name,
        photoUrl: worker.photoUrl,
        skills: worker.skills || [],
        passportSlug: worker.passportSlug,
        stats: worker.passportStats || {
          jobsCompleted: entries.length,
          totalHoursWorked: entries.reduce((acc, curr) => acc + (curr.fields?.hoursWorked || 0), 0),
          avgRating: worker.rating || 5.0,
        },
      },
      entries: formattedEntries,
    });
  })
);

// 2. Worker updates entry privacy (public/private or isMasked)
passportRouter.patch(
  '/entries/:id',
  authenticate,
  requireRole('worker'),
  asyncHandler(async (req, res) => {
    const entry = await PassportEntry.findById(req.params.id);
    if (!entry) {
      throw new AppError('NOT_FOUND', 'Passport entry not found.', 404);
    }
    if (entry.workerId !== req.user.id) {
      throw new AppError('FORBIDDEN', 'Access denied to this passport entry.', 403);
    }

    const { visibility, isMasked } = req.body;
    if (visibility !== undefined && ['public', 'private'].includes(visibility)) {
      entry.visibility = visibility;
    }
    if (isMasked !== undefined) {
      entry.isMasked = Boolean(isMasked);
    }

    await entry.save();
    return ok(res, { entry: entry.toJSON() }, 'Passport entry privacy updated');
  })
);

// 3. Verify cryptographic ledger integrity
passportRouter.get(
  '/:slug/verify',
  asyncHandler(async (req, res) => {
    const worker = await User.findOne({ passportSlug: req.params.slug, isActive: true });
    if (!worker) {
      throw new AppError('NOT_FOUND', 'Worker passport not found.', 404);
    }

    const entries = await PassportEntry.find({ workerId: worker.id }).sort({ seq: 1 });
    const result = await verifyChain(entries);

    return ok(res, {
      valid: result.valid,
      checkedEntries: result.checkedEntries,
      brokenAtSeq: result.brokenAtSeq,
      workerId: worker.id,
      slug: worker.passportSlug,
    });
  })
);

// 4. Public QR code generation / metadata
passportRouter.get(
  '/:slug/qr',
  asyncHandler(async (req, res) => {
    const worker = await User.findOne({ passportSlug: req.params.slug, isActive: true });
    if (!worker) {
      throw new AppError('NOT_FOUND', 'Worker passport not found.', 404);
    }

    const passportUrl = `${config.APP_ORIGIN}/p/${worker.passportSlug}`;
    return ok(res, {
      slug: worker.passportSlug,
      url: passportUrl,
    });
  })
);

// 5. Public passport ledger presentation
passportRouter.get(
  '/:slug',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const worker = await User.findOne({ passportSlug: req.params.slug, isActive: true });
    if (!worker) {
      throw new AppError('NOT_FOUND', 'Worker passport not found.', 404);
    }

    const isOwner = req.user?.id === worker.id;
    const query = { workerId: worker.id };
    if (!isOwner) {
      query.visibility = 'public';
    }

    const entries = await PassportEntry.find(query).sort({ seq: 1 });

    // Customer masking
    const customerIds = entries.map((e) => e.fields?.customerId).filter(Boolean);
    const customers = await User.find({ _id: { $in: customerIds } }).select('_id name');
    const customerMap = new Map();
    customers.forEach((c) => {
      customerMap.set(c.id, c.name ? c.name.trim().split(/\s+/)[0] : 'Customer');
    });

    const formattedEntries = entries.map((e) => {
      const obj = e.toJSON();
      const firstName = customerMap.get(e.fields?.customerId) || 'Customer';
      obj.customerName = isOwner ? firstName : e.isMasked ? `${firstName.slice(0, 1)}***` : firstName;
      return obj;
    });

    const chainVerification = await verifyChain(entries);

    return ok(res, {
      worker: {
        id: worker.id,
        name: worker.name,
        photoUrl: worker.photoUrl,
        skills: worker.skills || [],
        mainSkill: worker.mainSkill || worker.skills?.[0] || 'helper',
        area: worker.area || 'Local',
        city: worker.city || 'Pune',
        passportSlug: worker.passportSlug,
        stats: worker.passportStats || {
          jobsCompleted: entries.length,
          totalHoursWorked: entries.reduce((acc, curr) => acc + (curr.fields?.hoursWorked || 0), 0),
          avgRating: worker.rating || 5.0,
        },
      },
      entries: formattedEntries,
      valid: chainVerification.valid,
    });
  })
);

// 6. Dev-only Tamper & Reset routes
passportRouter.post(
  '/dev/tamper',
  asyncHandler(async (req, res) => {
    if (config.NODE_ENV === 'production') {
      throw new AppError('FORBIDDEN', 'Dev tamper endpoints are disabled in production.', 403);
    }
    const { workerId, seq } = req.body;
    await PassportEntry.collection.updateOne(
      { workerId, seq: Number(seq) },
      { $set: { hash: 'tampered-sha256-hash-00000000000000000000000000000000000000000000' } }
    );
    return ok(res, { tampered: true });
  })
);

passportRouter.post(
  '/dev/reset-tamper',
  asyncHandler(async (req, res) => {
    if (config.NODE_ENV === 'production') {
      throw new AppError('FORBIDDEN', 'Dev tamper endpoints are disabled in production.', 403);
    }
    const { workerId, seq } = req.body;
    const entry = await PassportEntry.findOne({ workerId, seq: Number(seq) });
    if (entry) {
      const recomputed = await computeEntryHash(entry.prevHash, entry.fields);
      await PassportEntry.collection.updateOne(
        { workerId, seq: Number(seq) },
        { $set: { hash: recomputed } }
      );
    }
    return ok(res, { restored: true });
  })
);
