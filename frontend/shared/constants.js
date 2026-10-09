/**
 * WorkCred Shared Constants
 * Isomorphic constants for browser and Node 20.
 */

export const BRAND = {
  NAME: 'WorkCred',
  TAGLINE: 'Proof of work, work near you.',
  MISSION:
    "Democratizing verified proof-of-work, local livelihoods, and trust capital for India's daily workforce.",
  PHONE_HELPLINE: '1800-WORK',
  COPYRIGHT: '© 2026 WorkCred. All rights reserved.',
};

export const ROLES = {
  WORKER: 'worker',
  CUSTOMER: 'customer',
};

export const SKILLS = [
  'helper',
  'electrician',
  'plumber',
  'mason',
  'painter',
  'carpenter',
  'cook',
  'cleaner',
  'driver',
  'vendor',
  'other',
];

export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
};

export const JOB_STATUS = {
  OPEN: 'open',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
};

export const EVENT_NAMES = {
  WORKER_FREE: 'radar:worker_free',
  WORKER_BUSY: 'radar:worker_busy',
  JOB_NEW: 'job:new',
  JOB_FILLED: 'job:filled',
  BOOKING_REQUEST: 'booking:request',
  BOOKING_CREATED: 'booking:created',
  BOOKING_STARTED: 'booking:started',
  BOOKING_COMPLETED: 'booking:completed',
  BOOKING_CANCELLED: 'booking:cancelled',
};

export const LIMITS = {
  MAX_OTP_ATTEMPTS: 5,
  MAX_CODE_ATTEMPTS: 5,
  MAX_OTP_REQUESTS_10MIN: 3,
  OTP_RESEND_SECONDS: 30,
  DEFAULT_RADIUS_KM: 3,
  MAX_RADIUS_KM: 25,
  FREE_NOW_HOURS: [2, 4, 8],
  IDEMPOTENCY_TTL_MS: 86400000, // 24 hours
  MAX_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024,
};

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  WRONG_ROLE: 'WRONG_ROLE',
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_CODE: 'INVALID_CODE',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  JOB_FILLED: 'JOB_FILLED',
  ALREADY_BOOKED: 'ALREADY_BOOKED',
  OVERLAPPING_BOOKING: 'OVERLAPPING_BOOKING',
  INVALID_START_CODE: 'INVALID_START_CODE',
  INVALID_FINISH_CODE: 'INVALID_FINISH_CODE',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  DUPLICATE_ENDORSEMENT: 'DUPLICATE_ENDORSEMENT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  ROLE_ALREADY_SET: 'ROLE_ALREADY_SET',
  INVALID_ROLE: 'INVALID_ROLE',
};

export const SAMPLE_DATA = {
  HERO_WORKER: {
    name: 'Ravi Kumar',
    role: 'Certified Senior Electrician',
    rating: '4.9',
    distance: '0.8 km away',
    availability: 'Free 4 hrs',
    location: 'Sector 4 Market',
    rate: '₹750',
    rateUnit: '/ day',
  },
  PASSPORT_WORKER: {
    id: '#WC-4091',
    name: 'Sunil Mehta',
    role: 'Master Electrician',
    hoursLogged: 140,
    jobsCompleted: 32,
    rating: '4.8',
    reviewsCount: 31,
    skills: ['House Wiring', 'Inverter Setup', 'Appliance Fix', 'Circuit Breakers'],
  },
  HANDSHAKE_CODES: {
    startCode: '8429',
    finishCode: '6104',
  },
  FAIR_RATES: {
    low: 400,
    peak: 850,
    recommendedMin: 500,
    recommendedMax: 650,
    acceptedPercentage: '94%',
  },
};
