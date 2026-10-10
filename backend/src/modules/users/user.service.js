/**
 * WorkCred User Profile Core Service
 * Manages profile queries, role assignment, slug generation,
 * field whitelisting per role, and profile completion evaluation.
 */

import { User } from '../../models/User.js';
import { localityKey } from '../../../../shared/geo.js';
import { AppError } from '../../../../shared/errors.js';
import { validateUpdateProfile, validateRoleSelection } from '../../../../shared/validators.js';
import { validateOwnImageUrl } from '../../utils/cloudinary.js';
import { randomDigits } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

const PHOTO_HOST_ALLOWLIST = (process.env.PHOTO_HOST_ALLOWLIST || 'res.cloudinary.com,cloudinary.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const COMMON_UPDATABLE_FIELDS = new Set(['name', 'area', 'city', 'location', 'photoUrl']);

const WORKER_UPDATABLE_FIELDS = new Set([
  ...COMMON_UPDATABLE_FIELDS,
  'skills',
  'mainSkill',
  'rate',
  'rateUnit',
  'hourlyRate',
  'dailyRate',
  'bio',
  'radiusKm',
  'calendar',
  'blockedDates',
  'defaultMaskEmployerNames',
  'publicPassportEnabled',
  'isPublicPassportEnabled',
]);

const CUSTOMER_UPDATABLE_FIELDS = new Set([...COMMON_UPDATABLE_FIELDS]);

/**
 * Slugify a user name into a URL-safe string.
 */
function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a unique collision-safe passport slug.
 */
async function generateUniquePassportSlug(name) {
  const baseSlug = slugify(name) || 'worker';
  let attempts = 0;

  while (attempts < 10) {
    attempts++;
    const suffix = randomDigits(3);
    const candidateSlug = `${baseSlug}-${suffix}`;
    const existing = await User.findOne({ passportSlug: candidateSlug }).select('_id');
    if (!existing) {
      return candidateSlug;
    }
  }

  return `${baseSlug}-${Date.now().toString().slice(-4)}`;
}

/**
 * Computes profileComplete boolean flag.
 */
function checkProfileComplete(user) {
  const hasName = typeof user.name === 'string' && user.name.trim().length >= 2;
  const hasLocality = Boolean(user.area || user.city || user.localityKey);

  if (user.role === 'customer') {
    return Boolean(hasName && hasLocality);
  }

  if (user.role === 'worker') {
    const hasSkills = Array.isArray(user.skills) && user.skills.length > 0;
    const hasRate = Number(user.rate) > 0 || Number(user.hourlyRate) > 0 || Number(user.dailyRate) > 0;
    return Boolean(hasName && hasLocality && hasSkills && hasRate);
  }

  return false;
}

/**
 * Get authenticated user's private profile.
 */
export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
  }

  return { user: user.toJSON() };
}

/**
 * Set user role (one-time assignment).
 */
export async function setUserRole(userId, body) {
  const validationErrors = validateRoleSelection(body);
  if (validationErrors.length > 0) {
    throw new AppError('INVALID_ROLE', validationErrors[0].message, 400, validationErrors);
  }

  const { role } = body;
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
  }

  if (user.role) {
    throw new AppError('ROLE_ALREADY_SET', 'Role is already set and cannot be changed.', 409);
  }

  user.role = role;

  if (role === 'worker') {
    user.skills = user.skills || [];
    user.radiusKm = user.radiusKm || 5;
    user.defaultMaskEmployerNames = true;
    user.isPublicPassportEnabled = true;
    user.calendar = user.calendar || {
      monday: 'full',
      tuesday: 'full',
      wednesday: 'full',
      thursday: 'full',
      friday: 'full',
      saturday: 'full',
      sunday: 'off',
    };
    user.blockedDates = user.blockedDates || [];

    if (user.name && !user.passportSlug) {
      user.passportSlug = await generateUniquePassportSlug(user.name);
    }
  }

  user.profileComplete = checkProfileComplete(user);
  await user.save();

  logger.info({
    event: 'role_set',
    userId: user.id,
    role,
  });

  return { user: user.toJSON() };
}

/**
 * Update authenticated user's profile with strict field whitelisting per role.
 */
export async function updateMe(userId, updates = {}) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'User not found.', 401);
  }

  const allowedFields = user.role === 'worker' ? WORKER_UPDATABLE_FIELDS : CUSTOMER_UPDATABLE_FIELDS;

  // 1. Verify no forbidden or role-mismatched fields are submitted
  const invalidFields = Object.keys(updates).filter((key) => !allowedFields.has(key));
  if (invalidFields.length > 0) {
    const details = invalidFields.map((f) => ({
      field: f,
      message: `Field '${f}' is not editable or not permitted for ${user.role || 'unassigned'} accounts.`,
    }));
    throw new AppError('VALIDATION_ERROR', details[0].message, 400, details);
  }

  // 2. Validate input values
  const validationErrors = validateUpdateProfile(updates, user.role, PHOTO_HOST_ALLOWLIST);
  if (validationErrors.length > 0) {
    throw new AppError('VALIDATION_ERROR', validationErrors[0].message, 400, validationErrors);
  }

  // 2.1 Enforce own Cloudinary folder for photoUrl
  if ('photoUrl' in updates && updates.photoUrl !== null && updates.photoUrl !== '') {
    if (!validateOwnImageUrl(updates.photoUrl, userId)) {
      throw new AppError('IMAGE_NOT_ALLOWED', 'Photo URL must be hosted in your own authorized Cloudinary folder.', 400);
    }
  }

  // 3. Apply common fields
  if ('name' in updates) {
    user.name = updates.name.trim();
  }
  if ('area' in updates) {
    user.area = updates.area ? updates.area.trim() : '';
  }
  if ('city' in updates) {
    user.city = updates.city ? updates.city.trim() : 'Pune';
  }
  if ('photoUrl' in updates) {
    user.photoUrl = updates.photoUrl || null;
  }
  if ('location' in updates) {
    if (updates.location && typeof updates.location === 'object') {
      const lat = Number(updates.location.lat);
      const lng = Number(updates.location.lng);
      user.location = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      user.localityKey = localityKey(lat, lng);
    } else {
      user.location = null;
      user.localityKey = null;
    }
  }

  // 4. Apply worker fields
  if (user.role === 'worker') {
    if ('skills' in updates) {
      user.skills = updates.skills;
      if (!user.mainSkill || !user.skills.includes(user.mainSkill)) {
        user.mainSkill = user.skills[0] || null;
      }
    }
    if ('mainSkill' in updates) {
      user.mainSkill = updates.mainSkill;
    }
    if ('rate' in updates) {
      user.rate = updates.rate !== null ? Number(updates.rate) : null;
    }
    if ('rateUnit' in updates) {
      user.rateUnit = updates.rateUnit || 'day';
    }
    if ('hourlyRate' in updates) {
      user.hourlyRate = updates.hourlyRate !== null ? Number(updates.hourlyRate) : null;
    }
    if ('dailyRate' in updates) {
      user.dailyRate = updates.dailyRate !== null ? Number(updates.dailyRate) : null;
    }

    // Auto-compute hourly/daily rates if rate + rateUnit provided
    if (user.rate !== null && user.rate > 0) {
      if (user.rateUnit === 'hour') {
        user.hourlyRate = user.rate;
        user.dailyRate = user.dailyRate || user.rate * 8;
      } else {
        user.dailyRate = user.rate;
        user.hourlyRate = user.hourlyRate || Math.round(user.rate / 8);
      }
    }

    if ('bio' in updates) {
      user.bio = updates.bio ? updates.bio.trim() : '';
    }
    if ('radiusKm' in updates) {
      user.radiusKm = Number(updates.radiusKm) || 5;
    }
    if ('calendar' in updates) {
      user.calendar = updates.calendar;
    }
    if ('blockedDates' in updates) {
      user.blockedDates = updates.blockedDates;
    }
    if ('defaultMaskEmployerNames' in updates) {
      user.defaultMaskEmployerNames = Boolean(updates.defaultMaskEmployerNames);
    }
    if ('publicPassportEnabled' in updates || 'isPublicPassportEnabled' in updates) {
      user.isPublicPassportEnabled = Boolean(
        updates.isPublicPassportEnabled ?? updates.publicPassportEnabled
      );
    }

    // Generate passport slug if missing and worker has name
    if (!user.passportSlug && user.name) {
      user.passportSlug = await generateUniquePassportSlug(user.name);
    }
  }

  // 5. Update profile completion flag
  user.profileComplete = checkProfileComplete(user);
  await user.save();

  logger.info({
    event: 'profile_updated',
    userId: user.id,
    profileComplete: user.profileComplete,
  });

  return { user: user.toJSON() };
}
