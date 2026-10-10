/**
 * WorkCred Isomorphic Handwritten Input Validators
 * Pure ES module for browser and Node 20.
 * Returns array of { field, message } errors.
 */

import { SKILLS, LIMITS } from './constants.js';

export function isIndianMobile(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(digits);
}

export function validateSanitizedText(text, fieldName = 'text', { minLength = 0, maxLength = 300, required = false } = {}) {
  const errors = [];
  if (text === undefined || text === null || text === '') {
    if (required) {
      errors.push({ field: fieldName, message: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required.` });
    }
    return errors;
  }
  if (typeof text !== 'string') {
    errors.push({ field: fieldName, message: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be a string.` });
    return errors;
  }
  const trimmed = text.trim();
  if (minLength > 0 && trimmed.length < minLength) {
    errors.push({ field: fieldName, message: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at least ${minLength} characters long.` });
  }
  if (maxLength > 0 && trimmed.length > maxLength) {
    errors.push({ field: fieldName, message: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} cannot exceed ${maxLength} characters.` });
  }
  const phonePattern = /(?:\+?91[\s-]?)?[6-9]\d{9}|\b\d{5}[\s-]?\d{5}\b|\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/;
  const urlPattern = /(?:https?:\/\/|www\.)\S+/i;
  if (phonePattern.test(trimmed) || urlPattern.test(trimmed)) {
    errors.push({ field: fieldName, message: `Please do not put phone numbers or links in ${fieldName}.` });
  }
  return errors;
}

export function validateOtpRequest(body = {}) {
  const errors = [];
  const phone = String(body.phone ?? '').replace(/\D/g, '').slice(-10);
  if (!isIndianMobile(phone)) {
    errors.push({ field: 'phone', message: 'Enter a valid 10-digit Indian mobile number.' });
  }
  return errors;
}

export function validateOtpVerify(body = {}) {
  const errors = [];
  const phone = String(body.phone ?? '').replace(/\D/g, '').slice(-10);
  const code = String(body.code ?? body.otp ?? '').trim();

  if (!isIndianMobile(phone)) {
    errors.push({ field: 'phone', message: 'Enter a valid 10-digit Indian mobile number.' });
  }
  if (!/^\d{6}$/.test(code)) {
    errors.push({ field: 'code', message: 'Enter a valid 6-digit OTP code.' });
  }
  return errors;
}

export function validateRoleSelection(body = {}) {
  const errors = [];
  const role = body.role;
  if (!role || !['worker', 'customer'].includes(role)) {
    errors.push({ field: 'role', message: 'Role must be worker or customer.' });
  }
  return errors;
}

export function validateUpdateProfile(body = {}, role = null, photoHostAllowlist = ['res.cloudinary.com']) {
  const errors = [];

  // Common fields validation
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 60) {
      errors.push({ field: 'name', message: 'Name must be between 2 and 60 characters.' });
    } else {
      const trimmed = body.name.trim();
      if (/^\d+$/.test(trimmed)) {
        errors.push({ field: 'name', message: 'Name cannot be numbers only.' });
      }
      if (/(?:https?:\/\/|www\.)\S+/i.test(trimmed)) {
        errors.push({ field: 'name', message: 'Name cannot contain URLs or links.' });
      }
    }
  }

  if ('area' in body && body.area !== null && typeof body.area !== 'string') {
    errors.push({ field: 'area', message: 'Area must be a string.' });
  }

  if ('city' in body && body.city !== null && typeof body.city !== 'string') {
    errors.push({ field: 'city', message: 'City must be a string.' });
  }

  if ('location' in body && body.location !== null) {
    const lat = Number(body.location.lat);
    const lng = Number(body.location.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push({ field: 'location', message: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.' });
    }
  }

  if ('photoUrl' in body && body.photoUrl !== null && body.photoUrl !== '') {
    if (typeof body.photoUrl !== 'string') {
      errors.push({ field: 'photoUrl', message: 'Photo URL must be a valid URL string or null.' });
    } else if (body.photoUrl.startsWith('data:')) {
      errors.push({ field: 'photoUrl', message: 'Data URLs are not allowed. Please provide a hosted image URL.' });
    } else {
      try {
        const parsed = new URL(body.photoUrl);
        const host = parsed.hostname.toLowerCase();
        const isAllowed = photoHostAllowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
        if (!isAllowed) {
          errors.push({ field: 'photoUrl', message: `Photo host '${host}' is not in the allowed storage hosts.` });
        }
      } catch {
        errors.push({ field: 'photoUrl', message: 'Invalid Photo URL format.' });
      }
    }
  }

  // Worker-specific fields validation
  if ('skills' in body) {
    if (!Array.isArray(body.skills)) {
      errors.push({ field: 'skills', message: 'Skills must be an array.' });
    } else if (body.skills.length === 0) {
      errors.push({ field: 'skills', message: 'At least one skill is required for worker profiles.' });
    } else if (body.skills.length > 6) {
      errors.push({ field: 'skills', message: 'Maximum 6 skills are allowed per worker.' });
    } else {
      const invalid = body.skills.filter((s) => !SKILLS.includes(s));
      if (invalid.length > 0) {
        errors.push({ field: 'skills', message: `Invalid skill(s): ${invalid.join(', ')}` });
      }
    }
  }

  if ('mainSkill' in body && body.mainSkill !== null) {
    if (!SKILLS.includes(body.mainSkill)) {
      errors.push({ field: 'mainSkill', message: `Invalid main skill '${body.mainSkill}'.` });
    }
  }

  if ('rate' in body && body.rate !== null) {
    const r = Number(body.rate);
    if (!Number.isFinite(r) || r <= 0 || r > 50000) {
      errors.push({ field: 'rate', message: 'Expected rate must be a positive number up to ₹50,000.' });
    }
  }

  if ('hourlyRate' in body && body.hourlyRate !== null) {
    const hr = Number(body.hourlyRate);
    if (!Number.isFinite(hr) || hr <= 0 || hr > 5000) {
      errors.push({ field: 'hourlyRate', message: 'Hourly rate must be a positive number up to ₹5,000.' });
    }
  }

  if ('dailyRate' in body && body.dailyRate !== null) {
    const dr = Number(body.dailyRate);
    if (!Number.isFinite(dr) || dr <= 0 || dr > 50000) {
      errors.push({ field: 'dailyRate', message: 'Daily rate must be a positive number up to ₹50,000.' });
    }
  }

  if ('rateUnit' in body && body.rateUnit !== null && !['day', 'hour'].includes(body.rateUnit)) {
    errors.push({ field: 'rateUnit', message: 'Rate unit must be day or hour.' });
  }

  if ('bio' in body && body.bio !== null) {
    if (typeof body.bio !== 'string' || body.bio.length > 200) {
      errors.push({ field: 'bio', message: 'Bio cannot exceed 200 characters.' });
    }
  }

  if ('radiusKm' in body && body.radiusKm !== null) {
    const rad = Number(body.radiusKm);
    if (!Number.isFinite(rad) || rad < 1 || rad > 10) {
      errors.push({ field: 'radiusKm', message: 'Service radius must be between 1 and 10 km.' });
    }
  }

  if ('calendar' in body && body.calendar !== null) {
    if (typeof body.calendar !== 'object' || Array.isArray(body.calendar)) {
      errors.push({ field: 'calendar', message: 'Calendar must be a weekly pattern object.' });
    } else {
      const allowedDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const allowedSlots = ['off', 'morning', 'afternoon', 'evening', 'full'];
      for (const [day, val] of Object.entries(body.calendar)) {
        if (!allowedDays.includes(day.toLowerCase())) {
          errors.push({ field: 'calendar', message: `Invalid day in calendar: '${day}'.` });
        } else if (!allowedSlots.includes(String(val).toLowerCase())) {
          errors.push({ field: 'calendar', message: `Slot for ${day} must be one of: ${allowedSlots.join(', ')}.` });
        }
      }
    }
  }

  if ('blockedDates' in body && body.blockedDates !== null) {
    if (!Array.isArray(body.blockedDates)) {
      errors.push({ field: 'blockedDates', message: 'Blocked dates must be an array of date strings.' });
    } else if (body.blockedDates.length > 60) {
      errors.push({ field: 'blockedDates', message: 'Cannot block more than 60 dates in advance.' });
    } else {
      const invalid = body.blockedDates.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(String(d)));
      if (invalid.length > 0) {
        errors.push({ field: 'blockedDates', message: 'Blocked dates must be formatted as YYYY-MM-DD.' });
      }
    }
  }

  return errors;
}

export function validateJobCreate(body = {}) {
  const errors = [];
  const { title, skill, description, area, city, lat, lng, rate, offeredRate, rateUnit, slotsNeeded, workersNeeded, hours, hoursPerWorker, scheduledAt, startAt } = body;

  const jobTitle = title ?? (skill ? `${String(skill).charAt(0).toUpperCase() + String(skill).slice(1)} Required` : '');
  if (!jobTitle || typeof jobTitle !== 'string' || jobTitle.trim().length < 3) {
    errors.push({ field: 'title', message: 'Job title must be at least 3 characters long.' });
  }
  if (!skill || !SKILLS.includes(skill)) {
    errors.push({ field: 'skill', message: `Skill must be one of: ${SKILLS.join(', ')}.` });
  }
  if (!area && !city && lat === undefined && lng === undefined && !body.location) {
    // location will default to customer's saved location if not provided
  } else {
    if (lat !== undefined && lng !== undefined) {
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180) {
        errors.push({ field: 'location', message: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.' });
      }
    }
  }

  const effectiveRate = Number(offeredRate ?? rate);
  if (!Number.isFinite(effectiveRate) || effectiveRate <= 0 || effectiveRate > 50000) {
    errors.push({ field: 'offeredRate', message: 'Offered rate must be a positive number up to ₹50,000.' });
  }
  if (rateUnit && !['day', 'hour'].includes(rateUnit)) {
    errors.push({ field: 'rateUnit', message: 'Rate unit must be day or hour.' });
  }

  const needed = Number(workersNeeded ?? slotsNeeded ?? 1);
  if (!Number.isInteger(needed) || needed < 1 || needed > 10) {
    errors.push({ field: 'workersNeeded', message: 'Workers needed must be an integer between 1 and 10.' });
  }

  const jobHours = Number(hours ?? hoursPerWorker ?? 8);
  if (!Number.isFinite(jobHours) || jobHours < 1 || jobHours > 12) {
    errors.push({ field: 'hours', message: 'Hours per worker must be between 1 and 12.' });
  }

  const effectiveStart = startAt ?? scheduledAt;
  if (effectiveStart) {
    const startTime = new Date(effectiveStart).getTime();
    const now = Date.now();
    if (Number.isNaN(startTime) || startTime <= now) {
      errors.push({ field: 'startAt', message: 'Start time must be in the future.' });
    } else if (startTime > now + 30 * 86400000) {
      errors.push({ field: 'startAt', message: 'Start time cannot be more than 30 days in the future.' });
    }
  }

  if (description !== undefined && description !== null && description !== '') {
    errors.push(...validateSanitizedText(description, 'description', { maxLength: 300 }));
  }

  return errors;
}

export function validateBookingCreate(body = {}) {
  const errors = [];
  const { workerId, source = 'direct', jobId, hours, scheduledAt, note } = body;

  if (!['job', 'freenow', 'direct'].includes(source)) {
    errors.push({ field: 'source', message: 'Source must be job, freenow, or direct.' });
  }
  if (!workerId && source !== 'job') {
    errors.push({ field: 'workerId', message: 'Worker ID is required for direct or free-now bookings.' });
  }
  if (source === 'job' && !jobId) {
    errors.push({ field: 'jobId', message: 'Job ID is required when booking from a job.' });
  }

  if (hours !== undefined) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 1 || h > 12) {
      errors.push({ field: 'hours', message: 'Hours must be between 1 and 12.' });
    }
  }

  if (scheduledAt) {
    const sTime = new Date(scheduledAt).getTime();
    const now = Date.now();
    if (Number.isNaN(sTime)) {
      errors.push({ field: 'scheduledAt', message: 'Invalid scheduled date and time format.' });
    } else if (source === 'freenow') {
      // Free now allows starting immediately or within 30 minutes
      if (sTime < now - 5 * 60 * 1000 || sTime > now + 30 * 60 * 1000) {
        errors.push({ field: 'scheduledAt', message: 'Free-Now bookings must be scheduled within 30 minutes.' });
      }
    } else {
      if (sTime <= now) {
        errors.push({ field: 'scheduledAt', message: 'Scheduled time must be in the future.' });
      } else if (sTime > now + 30 * 86400000) {
        errors.push({ field: 'scheduledAt', message: 'Scheduled time cannot be more than 30 days in the future.' });
      }
    }
  }

  if (note !== undefined && note !== null && note !== '') {
    errors.push(...validateSanitizedText(note, 'note', { maxLength: 200 }));
  }

  return errors;
}

export function validateStartBooking(body = {}) {
  const errors = [];
  const startCode = String(body.startCode ?? '').trim();
  if (!/^\d{4}$/.test(startCode)) {
    errors.push({ field: 'startCode', message: 'Start code must be a 4-digit number.' });
  }
  if (!Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lng))) {
    errors.push({ field: 'location', message: 'Worker GPS location (lat, lng) is required at start.' });
  }
  return errors;
}

export function validateFinishBooking(body = {}) {
  const errors = [];
  const finishCode = String(body.finishCode ?? '').trim();
  if (!/^\d{4}$/.test(finishCode)) {
    errors.push({ field: 'finishCode', message: 'Finish code must be a 4-digit number.' });
  }
  if (body.paidCash !== true) {
    errors.push({ field: 'paidCash', message: 'Customer must confirm cash payment was made.' });
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push({ field: 'rating', message: 'Rating must be an integer between 1 and 5 stars.' });
  }
  return errors;
}

export function validateAvailability(body = {}) {
  const errors = [];
  const hours = Number(body.hours);
  if (!LIMITS.FREE_NOW_HOURS.includes(hours)) {
    errors.push({ field: 'hours', message: `Hours must be one of: ${LIMITS.FREE_NOW_HOURS.join(', ')}.` });
  }
  if (!Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lng))) {
    errors.push({ field: 'location', message: 'Valid latitude and longitude are required.' });
  }
  return errors;
}

export function validatePostCreate(body = {}) {
  const errors = [];
  const { skill, caption, afterUrl, afterPhotoUrl, beforeUrl, beforePhotoUrl, linkedBookingId, bookingId } = body;
  const effectiveAfter = afterUrl ?? afterPhotoUrl;

  if (!skill || !SKILLS.includes(skill)) {
    errors.push({ field: 'skill', message: `Skill must be one of: ${SKILLS.join(', ')}.` });
  }
  if (!effectiveAfter || typeof effectiveAfter !== 'string') {
    errors.push({ field: 'afterUrl', message: 'An after photo URL is required to create a post.' });
  }
  if (caption !== undefined && caption !== null) {
    errors.push(...validateSanitizedText(caption, 'caption', { minLength: 5, maxLength: 140, required: true }));
  } else {
    errors.push({ field: 'caption', message: 'Caption is required.' });
  }
  return errors;
}


export function validateEndorsement(body = {}) {
  const errors = [];
  const { workerId, skill } = body;
  if (!workerId || typeof workerId !== 'string') {
    errors.push({ field: 'workerId', message: 'Worker ID is required.' });
  }
  if (!skill || !SKILLS.includes(skill)) {
    errors.push({ field: 'skill', message: `Skill must be one of: ${SKILLS.join(', ')}.` });
  }
  return errors;
}

export function validatePassportEntryPatch(body = {}) {
  const errors = [];
  const allowed = ['visibility', 'isMasked'];
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      errors.push({ field: key, message: `Field '${key}' cannot be modified on passport entries.` });
    }
  }
  if ('visibility' in body && !['public', 'private'].includes(body.visibility)) {
    errors.push({ field: 'visibility', message: "Visibility must be 'public' or 'private'." });
  }
  if ('isMasked' in body && typeof body.isMasked !== 'boolean') {
    errors.push({ field: 'isMasked', message: 'isMasked must be a boolean.' });
  }
  return errors;
}

export function validateReport(body = {}) {
  const errors = [];
  const targetType = body.targetType;
  if (!targetType || !['passport', 'worker', 'booking', 'post'].includes(targetType)) {
    errors.push({ field: 'targetType', message: "targetType must be 'passport', 'worker', 'booking', or 'post'." });
  }
  if (!body.target && !body.targetId) {
    errors.push({ field: 'target', message: 'Target identifier is required.' });
  }
  if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
    errors.push({ field: 'reason', message: 'Reason for report is required.' });
  }
  if (body.note) {
    errors.push(...validateSanitizedText(body.note, 'note', { maxLength: 300 }));
  }
  return errors;
}

export function validateUploadSign(body = {}) {
  const errors = [];
  const { purpose } = body;
  if (!purpose || !['profile', 'post'].includes(purpose)) {
    errors.push({ field: 'purpose', message: "Purpose must be 'profile' or 'post'." });
  }
  return errors;
}

export function validatePushSubscribe(body = {}) {
  const errors = [];
  const { endpoint, keys } = body;
  if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    errors.push({ field: 'endpoint', message: 'Endpoint must be a valid HTTPS URL.' });
  }
  if (!keys || typeof keys !== 'object' || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    errors.push({ field: 'keys', message: 'Keys must contain p256dh and auth strings.' });
  } else {
    if (keys.p256dh.trim().length === 0 || keys.auth.trim().length === 0) {
      errors.push({ field: 'keys', message: 'p256dh and auth keys cannot be empty.' });
    }
  }
  return errors;
}

