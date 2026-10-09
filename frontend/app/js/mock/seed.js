/**
 * WorkCred Deterministic Mock Seed Data Generator
 * Pune city cluster (10 localities), 40 workers, 12 customers,
 * 25 jobs, ~120 completed bookings with SHA-256 passport hash chains.
 * Pure ES module for browser and Node 20.
 */

import { SKILLS } from '../../../shared/constants.js';
import { GENESIS_HASH, computeEntryHash } from '../../../shared/hash.js';
import { localityKey, roundToCell } from '../../../shared/geo.js';

// Deterministic PRNG (Linear Congruential Generator)
function createPrng(seedValue = 12345) {
  let s = seedValue;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const LOCALITIES = [
  { name: 'Shivajinagar', lat: 18.5304, lng: 73.8467 },
  { name: 'Kothrud', lat: 18.5074, lng: 73.8077 },
  { name: 'Deccan', lat: 18.5158, lng: 73.8418 },
  { name: 'Aundh', lat: 18.5602, lng: 73.8031 },
  { name: 'Baner', lat: 18.5590, lng: 73.7868 },
  { name: 'Viman Nagar', lat: 18.5679, lng: 73.9143 },
  { name: 'Hadapsar', lat: 18.5089, lng: 73.9259 },
  { name: 'Swargate', lat: 18.5018, lng: 73.8636 },
  { name: 'FC Road', lat: 18.5236, lng: 73.8411 },
  { name: 'Wakad', lat: 18.5987, lng: 73.7689 },
];

const WORKER_NAMES = [
  'Ravi Kumar', 'Sunil Mehta', 'Rajesh Sharma', 'Lakshmi Devi', 'Amit Verma',
  'Anand Shinde', 'Suresh Pawar', 'Pooja Patil', 'Vijay Jadhav', 'Deepak Joshi',
  'Ganesh Gaikwad', 'Manoj Deshmukh', 'Prakash Kulkarni', 'Sanjay More', 'Ramesh Thorat',
  'Vikas Bhosale', 'Rahul Chovan', 'Kiran Mane', 'Mahesh Wagh', 'Santosh Salunkhe',
  'Anita Kamble', 'Nitin Shinde', 'Sachin Kale', 'Prashant Darekar', 'Kavita Gawde',
  'Dinesh Dhumal', 'Yogesh Jagtap', 'Ashok Mohite', 'Pravin Bandal', 'Sharad Shelke',
  'Babu Londhe', 'Sunita Jadhav', 'Tushar Nagare', 'Rohit Nikam', 'Amol Popat',
  'Harish Tambe', 'Nilesh Gurav', 'Archana Sutar', 'Vishal Belhe', 'Sandip Ghodke',
];

const CUSTOMER_NAMES = [
  'Meera Nair', 'Vikramaditya Roy', 'Priya Kulkarni', 'Rahul Kapoor', 'Sneha Iyer',
  'Rohan Mehta', 'Aditi Rao', 'Siddharth Joshi', 'Tanvi Shah', 'Abhishek Gupta',
  'Neha Agarwal', 'Karan Malhotra',
];

const CAPTIONS = [
  'Clean distribution box wiring job completed in Kothrud.',
  'Replaced old sink pipe and fixed water pressure issue.',
  'Full room interior painting done with 2 coats.',
  'Custom teakwood bookshelf fitted and finished.',
  'Kitchen deep cleaning and tile degreasing completed.',
  'Masonry wall plaster repair and structural patch work.',
];

function makeSvgDataUrl(title, colorHex = '%23c85a32') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="${colorHex}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-size="24">${title}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

export async function buildSeedData() {
  const rand = createPrng(42);
  const now = Date.now();
  const DAY_MS = 86400000;

  const users = [];
  const jobs = [];
  const bookings = [];
  const passportEntries = [];
  const availability = [];
  const posts = [];
  const follows = [];
  const endorsements = [];
  const rateStats = [];

  // 1. Seed Demo Worker (Ravi Kumar)
  const raviLoc = LOCALITIES[0]; // Shivajinagar
  const demoWorker = {
    id: 'user-worker-ravi',
    phone: '9000000001',
    name: 'Ravi Kumar',
    role: 'worker',
    skills: ['electrician', 'helper'],
    rate: 750,
    rateUnit: 'day',
    area: raviLoc.name,
    city: 'Pune',
    location: { type: 'Point', coordinates: [raviLoc.lng, raviLoc.lat] },
    profileComplete: true,
    bio: 'Licensed electrician with 8+ years experience in residential wiring and distribution boards.',
    passportSlug: 'ravi-kumar-pune-842',
    isSample: true,
  };
  users.push(demoWorker);

  // 2. Seed Demo Customer (Meera Nair)
  const meeraLoc = LOCALITIES[2]; // Deccan
  const demoCustomer = {
    id: 'user-customer-meera',
    phone: '9000000002',
    name: 'Meera Nair',
    role: 'customer',
    skills: [],
    rate: null,
    rateUnit: 'day',
    area: meeraLoc.name,
    city: 'Pune',
    location: { type: 'Point', coordinates: [meeraLoc.lng, meeraLoc.lat] },
    profileComplete: true,
    bio: 'Homeowner in Deccan Pune.',
    isSample: true,
  };
  users.push(demoCustomer);

  // 3. Seed 39 Additional Workers
  for (let i = 1; i < WORKER_NAMES.length; i++) {
    const loc = LOCALITIES[i % LOCALITIES.length];
    const skillIndex = i % SKILLS.length;
    const primarySkill = SKILLS[skillIndex];
    const secondarySkill = SKILLS[(skillIndex + 3) % SKILLS.length];
    const baseRate = 450 + Math.floor(rand() * 10) * 50;

    const wId = `user-worker-${i + 1}`;
    const name = WORKER_NAMES[i];
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${i + 100}`;

    users.push({
      id: wId,
      phone: `9000000${String(i + 10).padStart(3, '0')}`,
      name,
      role: 'worker',
      skills: [primarySkill, secondarySkill],
      rate: baseRate,
      rateUnit: 'day',
      area: loc.name,
      city: 'Pune',
      location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      profileComplete: true,
      bio: `Experienced ${primarySkill} serving ${loc.name} area.`,
      passportSlug: slug,
      isSample: true,
    });
  }

  // 4. Seed 11 Additional Customers
  for (let i = 1; i < CUSTOMER_NAMES.length; i++) {
    const loc = LOCALITIES[(i * 2) % LOCALITIES.length];
    users.push({
      id: `user-customer-${i + 1}`,
      phone: `9100000${String(i + 10).padStart(3, '0')}`,
      name: CUSTOMER_NAMES[i],
      role: 'customer',
      skills: [],
      rate: null,
      rateUnit: 'day',
      area: loc.name,
      city: 'Pune',
      location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      profileComplete: true,
      bio: `Resident of ${loc.name}, Pune.`,
      isSample: true,
    });
  }

  const allWorkers = users.filter((u) => u.role === 'worker');
  const allCustomers = users.filter((u) => u.role === 'customer');

  // 5. Seed ~120 Completed Bookings & Passport Hash Chains across workers over past 180 days
  for (const worker of allWorkers) {
    const jobCount = worker.id === demoWorker.id ? 32 : Math.floor(rand() * 12);
    let prevHash = GENESIS_HASH;

    for (let seq = 1; seq <= jobCount; seq++) {
      const customer = allCustomers[Math.floor(rand() * allCustomers.length)];
      const skill = worker.skills[0];
      const daysAgo = Math.floor(180 - (seq / jobCount) * 175);
      const startTime = new Date(now - daysAgo * DAY_MS - (Math.floor(rand() * 6) + 8) * 3600000);
      const hoursWorked = 4 + Math.floor(rand() * 5);
      const endTime = new Date(startTime.getTime() + hoursWorked * 3600000);
      const amountPaid = Math.round((worker.rate / 8) * hoursWorked);
      const rating = rand() > 0.15 ? 5 : 4;

      const bookingId = `booking-hist-${worker.id}-${seq}`;
      const fields = {
        bookingId,
        workerId: worker.id,
        customerId: customer.id,
        skill,
        hoursWorked,
        amountPaid,
        startedAt: startTime.toISOString(),
        finishedAt: endTime.toISOString(),
        rating,
      };

      const entryHash = await computeEntryHash(prevHash, fields);

      bookings.push({
        id: bookingId,
        source: 'direct',
        jobId: null,
        workerId: worker.id,
        customerId: customer.id,
        skill,
        status: 'completed',
        rate: worker.rate,
        rateUnit: 'day',
        startCode: '1111',
        finishCode: '2222',
        startedAt: startTime.toISOString(),
        startedGeo: { type: 'Point', coordinates: worker.location.coordinates },
        finishedAt: endTime.toISOString(),
        hoursWorked,
        amountPaid,
        paidCash: true,
        rating,
        comment: 'Great work, very professional!',
        createdAt: new Date(startTime.getTime() - DAY_MS).toISOString(),
        isSample: true,
      });

      passportEntries.push({
        id: `pass-${worker.id}-${seq}`,
        workerId: worker.id,
        seq,
        prevHash,
        hash: entryHash,
        fields,
        visibility: 'public',
        isMasked: true,
        createdAt: endTime.toISOString(),
        isSample: true,
      });

      prevHash = entryHash;
    }
  }

  // 6. Seed Active Bookings for Demo Accounts (Ravi & Meera)
  // Demo Worker (Ravi): 1 Pending, 1 Confirmed, 1 In_Progress
  const pendingBookingWorker = {
    id: 'booking-demo-pending',
    source: 'direct',
    jobId: null,
    workerId: demoWorker.id,
    customerId: allCustomers[1].id,
    skill: 'electrician',
    status: 'pending',
    rate: 750,
    rateUnit: 'day',
    startCode: '4821',
    finishCode: '9153',
    createdAt: new Date(now - 3600000).toISOString(),
    isSample: true,
  };
  const confirmedBookingWorker = {
    id: 'booking-demo-confirmed',
    source: 'direct',
    jobId: null,
    workerId: demoWorker.id,
    customerId: allCustomers[2].id,
    skill: 'electrician',
    status: 'confirmed',
    rate: 750,
    rateUnit: 'day',
    startCode: '8429',
    finishCode: '6104',
    createdAt: new Date(now - 7200000).toISOString(),
    isSample: true,
  };
  const inProgressBookingWorker = {
    id: 'booking-demo-inprogress',
    source: 'freenow',
    jobId: null,
    workerId: demoWorker.id,
    customerId: demoCustomer.id,
    skill: 'electrician',
    status: 'in_progress',
    rate: 750,
    rateUnit: 'day',
    startCode: '1234',
    finishCode: '5678',
    startedAt: new Date(now - 1800000).toISOString(),
    startedGeo: { type: 'Point', coordinates: demoWorker.location.coordinates },
    createdAt: new Date(now - 3600000).toISOString(),
    isSample: true,
  };
  bookings.push(pendingBookingWorker, confirmedBookingWorker, inProgressBookingWorker);

  // 7. Seed 25 Open Jobs across Pune
  for (let i = 1; i <= 25; i++) {
    const loc = LOCALITIES[i % LOCALITIES.length];
    const customer = allCustomers[i % allCustomers.length];
    const skill = SKILLS[i % SKILLS.length];
    const rate = 500 + (i % 6) * 100;

    jobs.push({
      id: `job-${i}`,
      customerId: customer.id,
      title: `${skill.charAt(0).toUpperCase() + skill.slice(1)} needed in ${loc.name}`,
      description: `Need an experienced ${skill} for half-day work starting tomorrow 9 AM.`,
      skill,
      area: loc.name,
      city: 'Pune',
      location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      rate,
      rateUnit: 'day',
      slotsNeeded: 1,
      slotsFilled: 0,
      status: 'open',
      acceptedWorkerIds: [],
      createdAt: new Date(now - i * 3600000).toISOString(),
      isSample: true,
    });
  }

  // 8. Seed 8 Free-Now Workers (`availability`)
  for (let i = 0; i < 8; i++) {
    const worker = allWorkers[i];
    const loc = LOCALITIES[i % LOCALITIES.length];
    const hours = [2, 4, 8][i % 3];
    availability.push({
      id: `avail-${worker.id}`,
      workerId: worker.id,
      skill: worker.skills[0],
      hours,
      rate: worker.rate,
      rateUnit: worker.rateUnit,
      location: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      createdAt: new Date(now - 600000).toISOString(),
      expiresAt: new Date(now + hours * 3600000).toISOString(),
      isSample: true,
    });
  }

  // 9. Seed Work Posts (15 posts)
  for (let i = 1; i <= 15; i++) {
    const worker = allWorkers[i % allWorkers.length];
    const skill = worker.skills[0];
    posts.push({
      id: `post-${i}`,
      workerId: worker.id,
      workerName: worker.name,
      workerArea: worker.area,
      skill,
      caption: CAPTIONS[i % CAPTIONS.length],
      beforePhotoUrl: makeSvgDataUrl(`Before: ${skill}`, '%23514943'),
      afterPhotoUrl: makeSvgDataUrl(`After: ${skill}`, '%232a5a3b'),
      likesCount: Math.floor(rand() * 25) + 3,
      createdAt: new Date(now - i * 12 * 3600000).toISOString(),
      isSample: true,
    });
  }

  // 10. Seed Follows (20) & Endorsements (30)
  for (let i = 0; i < 20; i++) {
    const customer = allCustomers[i % allCustomers.length];
    const worker = allWorkers[(i + 2) % allWorkers.length];
    follows.push({
      id: `follow-${i + 1}`,
      fromUserId: customer.id,
      toUserId: worker.id,
      type: i % 2 === 0 ? 'follow' : 'save',
      createdAt: new Date(now - (i + 1) * DAY_MS).toISOString(),
      isSample: true,
    });
  }

  for (let i = 0; i < 30; i++) {
    const customer = allCustomers[i % allCustomers.length];
    const worker = allWorkers[i % allWorkers.length];
    endorsements.push({
      id: `endorse-${i + 1}`,
      customerId: customer.id,
      workerId: worker.id,
      skill: worker.skills[0],
      comment: 'Highly skilled, polite, and prompt.',
      createdAt: new Date(now - (i + 1) * DAY_MS).toISOString(),
      isSample: true,
    });
  }

  // 11. Seed Baseline Compass `rateStats`
  for (const loc of LOCALITIES) {
    for (const skill of SKILLS) {
      rateStats.push({
        id: `stat-${loc.name}-${skill}`,
        locality: loc.name,
        city: 'Pune',
        skill,
        localityKey: localityKey(loc.lat, loc.lng),
        p25: 75,
        median: 95,
        p75: 125,
        sampleSize: 15,
        isSeed: true,
      });
    }
  }

  return {
    version: 1,
    users,
    jobs,
    bookings,
    passportEntries,
    availability,
    posts,
    follows,
    endorsements,
    rateStats,
    otpRequests: {},
    otpAttempts: {},
    idempotencyKeys: {},
    session: null,
  };
}

export const seed = await buildSeedData();
