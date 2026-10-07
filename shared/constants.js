/**
 * WorkCred Shared Constants
 * Contains copy, token references, roles, and configuration.
 */

export const BRAND = {
  NAME: 'WorkCred',
  TAGLINE: 'Proof of work, work near you.',
  MISSION:
    "Democratizing verified proof-of-work, local livelihoods, and trust capital for India's daily workforce.",
  PHONE_HELPLINE: '1800-WORK',
  COPYRIGHT: "Made for India's working people • © 2025 WorkCred India. All rights reserved.",
};

export const ROLES = {
  WORKER: 'worker',
  CUSTOMER: 'customer',
};

export const SAMPLE_DATA = {
  HERO_WORKER: {
    name: 'Ravi Kumar',
    role: 'Certified Senior Electrician',
    rating: '4.9',
    distance: '0.8 km away',
    availability: 'Free 4 hrs',
    location: 'Sector 4 Market',
    rate: '₹500',
    rateUnit: '/ 2-hr slot',
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
