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

export function validateUpdateProfile(body = {}) {
  const errors = [];
  if ('name' in body && typeof body.name === 'string' && body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name cannot be empty.' });
  }
  if ('skills' in body && Array.isArray(body.skills)) {
    const invalid = body.skills.filter((s) => !SKILLS.includes(s));
    if (invalid.length > 0) {
      errors.push({ field: 'skills', message: `Invalid skill(s): ${invalid.join(', ')}` });
    }
  }
  if ('rate' in body && body.rate !== null) {
    const r = Number(body.rate);
    if (!Number.isFinite(r) || r <= 0) {
      errors.push({ field: 'rate', message: 'Expected rate must be a positive number.' });
    }
  }
  if ('rateUnit' in body && !['day', 'hour'].includes(body.rateUnit)) {
    errors.push({ field: 'rateUnit', message: 'Rate unit must be day or hour.' });
  }
  return errors;
}

export function validateJobCreate(body = {}) {
  const errors = [];
  const { title, skill, description, area, city, lat, lng, rate, rateUnit, slotsNeeded } = body;

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    errors.push({ field: 'title', message: 'Job title must be at least 3 characters long.' });
  }
  if (!skill || !SKILLS.includes(skill)) {
    errors.push({ field: 'skill', message: `Skill must be one of: ${SKILLS.join(', ')}.` });
  }
  if (!area || typeof area !== 'string' || area.trim().length === 0) {
    errors.push({ field: 'area', message: 'Area or locality is required.' });
  }
  if (!city || typeof city !== 'string' || city.trim().length === 0) {
    errors.push({ field: 'city', message: 'City is required.' });
  }
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    errors.push({ field: 'location', message: 'Valid latitude and longitude are required.' });
  }
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) {
    errors.push({ field: 'rate', message: 'Offered rate must be a positive number.' });
  }
  if (rateUnit && !['day', 'hour'].includes(rateUnit)) {
    errors.push({ field: 'rateUnit', message: 'Rate unit must be day or hour.' });
  }
  if (slotsNeeded !== undefined) {
    const slots = Number(slotsNeeded);
    if (!Number.isInteger(slots) || slots < 1) {
      errors.push({ field: 'slotsNeeded', message: 'Slots needed must be an integer of at least 1.' });
    }
  }
  return errors;
}

export function validateBookingCreate(body = {}) {
  const errors = [];
  const { workerId, source, jobId, skill, rate, rateUnit } = body;

  if (source && !['job', 'freenow', 'direct'].includes(source)) {
    errors.push({ field: 'source', message: 'Source must be job, freenow, or direct.' });
  }
  if (!workerId && source !== 'job') {
    errors.push({ field: 'workerId', message: 'Worker ID is required for direct or free-now bookings.' });
  }
  if (source === 'job' && !jobId) {
    errors.push({ field: 'jobId', message: 'Job ID is required when booking from a job.' });
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
  const { skill, caption } = body;
  if (!skill || !SKILLS.includes(skill)) {
    errors.push({ field: 'skill', message: `Skill must be one of: ${SKILLS.join(', ')}.` });
  }
  if (!caption || typeof caption !== 'string' || caption.trim().length < 5) {
    errors.push({ field: 'caption', message: 'Caption must be at least 5 characters long.' });
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
