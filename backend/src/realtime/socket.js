/**
 * WorkCred Socket.io Realtime Server
 * Authenticates connections with jose JWT access tokens, routes role-separated area rooms,
 * enforces connection caps and periodic session freshness, and bridges in-process realtime events.
 */

import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { areaCellsAround } from '../../../shared/geo.js';
import { EVENT_NAMES } from '../../../shared/constants.js';
import { realtimeEmitter } from './events.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let ioInstance = null;
let freshnessInterval = null;

// Allowlist payload projectors for outbound Socket.io events
export const EVENT_PROJECTORS = {
  [EVENT_NAMES.JOB_NEW]: (payload) => {
    const j = payload.job || payload;
    return {
      job: {
        id: j.id,
        title: j.title,
        skill: j.skill,
        rate: j.offeredRate || j.rate,
        rateUnit: j.rateUnit || 'day',
        area: j.area || 'Local',
        hours: j.hours || 8,
        scheduledAt: j.scheduledAt,
      },
    };
  },
  [EVENT_NAMES.JOB_FILLED]: (payload) => {
    const j = payload.job || payload;
    return {
      job: {
        id: j.id,
        skill: j.skill,
        status: 'filled',
      },
    };
  },
  [EVENT_NAMES.WORKER_FREE]: (payload) => {
    const a = payload.availability || payload;
    return {
      workerId: payload.workerId || a.workerId,
      availability: {
        id: a.id,
        workerId: a.workerId,
        skill: a.skill,
        rate: a.rate,
        rateUnit: a.rateUnit,
        hours: a.hours,
        expiresAt: a.expiresAt,
      },
    };
  },
  [EVENT_NAMES.WORKER_BUSY]: (payload) => {
    return {
      workerId: payload.workerId,
    };
  },
  [EVENT_NAMES.BOOKING_REQUEST]: (payload) => {
    const b = payload.booking || payload;
    return {
      booking: {
        id: b.id,
        customerId: b.customerId,
        workerId: b.workerId,
        skill: b.skill,
        status: 'pending',
        scheduledAt: b.scheduledAt,
      },
    };
  },
  [EVENT_NAMES.BOOKING_CREATED]: (payload) => {
    const b = payload.booking || payload;
    return {
      booking: {
        id: b.id,
        customerId: b.customerId,
        workerId: b.workerId,
        status: b.status || 'confirmed',
        scheduledAt: b.scheduledAt,
      },
    };
  },
  [EVENT_NAMES.BOOKING_STARTED]: (payload) => {
    const b = payload.booking || payload;
    return {
      booking: {
        id: b.id,
        customerId: b.customerId,
        workerId: b.workerId,
        status: 'in_progress',
        startedAt: b.startedAt,
      },
    };
  },
  [EVENT_NAMES.BOOKING_COMPLETED]: (payload) => {
    const b = payload.booking || payload;
    const p = payload.passportEntry || {};
    return {
      booking: {
        id: b.id,
        customerId: b.customerId,
        workerId: b.workerId,
        status: 'completed',
        rating: b.rating,
      },
      passportEntry: {
        seq: p.seq,
        recordId: p.recordId || p.id,
      },
    };
  },
  [EVENT_NAMES.BOOKING_CANCELLED]: (payload) => {
    const b = payload.booking || payload;
    return {
      booking: {
        id: b.id,
        status: 'cancelled',
        reason: b.reason || b.cancellationReason || 'cancelled',
      },
    };
  },
};

/**
 * Initialize and attach Socket.io to an HTTP server.
 * @param {import('http').Server} httpServer
 * @param {object} [options]
 * @returns {Server}
 */
export function initSocketServer(httpServer, options = {}) {
  if (ioInstance) return ioInstance;

  const allowedOrigins = options.appOrigins || config.APP_ORIGINS || [config.APP_ORIGIN || 'http://localhost:3000'];

  const io = new Server(httpServer, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 10 * 1024, // 10 KB
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    ...options,
  });

  // 1. Handshake Authentication Middleware
  io.use(async (socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin && Array.isArray(allowedOrigins) && !allowedOrigins.includes(origin) && config.NODE_ENV === 'production') {
      logger.warn({ msg: 'Socket connection rejected: origin mismatch', origin, expected: allowedOrigins });
      return next(new Error('Origin not allowed'));
    }

    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      logger.debug({ msg: 'Socket connection rejected: missing auth token' });
      return next(new Error('Authentication token required'));
    }

    try {
      const claims = await verifyAccessToken(token);
      const user = await User.findById(claims.userId).select('role isActive skills name');

      if (!user || user.isActive === false) {
        logger.debug({ msg: 'Socket connection rejected: user inactive or not found', userId: claims.userId });
        return next(new Error('Account disabled or not found'));
      }

      socket.data = {
        userId: user.id,
        role: user.role,
        skills: user.skills || [],
        sessionId: claims.familyId,
        name: user.name,
      };

      return next();
    } catch (err) {
      logger.debug({ msg: 'Socket connection rejected: token verification failed', error: err.message });
      return next(new Error('Invalid or expired authentication token'));
    }
  });

  // 2. Connection Handler
  io.on('connection', async (socket) => {
    const { userId, role } = socket.data;

    // Enforce max 5 sockets per user
    const existingSockets = await io.in(`user:${userId}`).fetchSockets();
    if (existingSockets.length >= 5) {
      // Disconnect oldest socket
      existingSockets[0].disconnect(true);
    }

    // Join user room
    socket.join(`user:${userId}`);

    logger.info({
      event: 'socket_connected',
      socketId: socket.id,
      userId,
      role,
    });

    // Track area rooms joined by this socket
    socket.data.areaRooms = new Set();
    socket.data.joinCount = 0;
    socket.data.lastJoinReset = Date.now();

    // 3. Area Join Event
    socket.on('area:join', (data = {}, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};

      // Rate limit: 10 per minute per socket
      const now = Date.now();
      if (now - socket.data.lastJoinReset > 60000) {
        socket.data.joinCount = 0;
        socket.data.lastJoinReset = now;
      }
      socket.data.joinCount++;
      if (socket.data.joinCount > 10) {
        return ack({ error: 'Rate limit exceeded for area:join. Max 10 calls per minute.' });
      }

      const { lat, lng, radiusKm: rawRadius = 5 } = data;
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        return ack({ error: 'Valid latitude and longitude are required.' });
      }

      const radiusKm = Math.min(10, Math.max(1, Number(rawRadius) || 5));
      const cells = areaCellsAround(Number(lat), Number(lng), radiusKm);

      // Leave previous area rooms
      for (const room of socket.data.areaRooms) {
        socket.leave(room);
      }
      socket.data.areaRooms.clear();

      // Join new role-separated area rooms (up to 25 cells)
      const userRole = socket.data.role || 'customer';
      const joinedCells = cells.slice(0, 25);

      for (const cell of joinedCells) {
        const roomName = `area:${cell}:${userRole}`;
        socket.join(roomName);
        socket.data.areaRooms.add(roomName);
      }

      return ack({ ok: true, cells: joinedCells.length });
    });

    // 4. Token Refresh Event
    socket.on('auth:refresh', async (data = {}, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const { token } = data;
      if (!token) return ack({ error: 'Token is required.' });

      try {
        const claims = await verifyAccessToken(token);
        if (claims.userId !== socket.data.userId) {
          logger.warn({ msg: 'Socket disconnected: auth:refresh userId mismatch', socketId: socket.id });
          socket.disconnect(true);
          return;
        }

        socket.data.sessionId = claims.familyId;
        return ack({ ok: true });
      } catch (err) {
        logger.debug({ msg: 'auth:refresh failed', error: err.message });
        return ack({ error: 'Invalid token.' });
      }
    });

    // 5. Disconnect Handler
    socket.on('disconnect', (reason) => {
      logger.info({
        event: 'socket_disconnected',
        socketId: socket.id,
        userId: socket.data.userId,
        reason,
      });
    });
  });

  // 6. Bridge In-Process Realtime Events to Sockets
  wireEventBridge(io);

  // 7. Periodic Session Freshness Check (every 5 minutes)
  freshnessInterval = setInterval(async () => {
    try {
      const sockets = await io.fetchSockets();
      if (sockets.length === 0) return;

      const userIds = Array.from(new Set(sockets.map((s) => s.data?.userId).filter(Boolean)));
      const activeUsers = await User.find({ _id: { $in: userIds }, isActive: true }).select('_id');
      const activeSet = new Set(activeUsers.map((u) => u.id));

      for (const s of sockets) {
        if (!activeSet.has(s.data?.userId)) {
          logger.info({ msg: 'Disconnecting socket: user inactive or removed', userId: s.data?.userId });
          s.disconnect(true);
          continue;
        }

        // Check if session family was revoked
        if (s.data?.sessionId) {
          const validFamily = await RefreshToken.findOne({
            familyId: s.data.sessionId,
            isRevoked: false,
          });
          if (!validFamily) {
            logger.info({ msg: 'Disconnecting socket: session revoked', userId: s.data?.userId });
            s.disconnect(true);
          }
        }
      }
    } catch (err) {
      logger.warn({ msg: 'Error in socket session freshness check', error: err.message });
    }
  }, options.freshnessIntervalMs || 5 * 60 * 1000);

  if (freshnessInterval.unref) {
    freshnessInterval.unref();
  }

  ioInstance = io;
  return io;
}

/**
 * Bridge realtimeEmitter events to Socket.io rooms with allowlist projected payloads.
 */
function wireEventBridge(io) {
  Object.keys(EVENT_PROJECTORS).forEach((eventName) => {
    realtimeEmitter.on(eventName, (rawPayload, targets = {}) => {
      try {
        const projector = EVENT_PROJECTORS[eventName];
        const sanitizedPayload = projector ? projector(rawPayload) : rawPayload;

        const { userIds = [], areaKeys = [] } = targets;

        // 1. Direct User Rooms
        for (const uid of userIds) {
          io.to(`user:${uid}`).emit(eventName, sanitizedPayload);
        }

        // 2. Area Broadcasts
        if (areaKeys.length > 0) {
          if (eventName === EVENT_NAMES.JOB_NEW) {
            const jobSkill = rawPayload.job?.skill || rawPayload.skill;
            for (const area of areaKeys) {
              // Send to worker area rooms, filtering by skill
              io.to(`area:${area}:worker`).fetchSockets().then((sockets) => {
                for (const s of sockets) {
                  if (!jobSkill || s.data.skills?.includes(jobSkill)) {
                    s.emit(eventName, sanitizedPayload);
                  }
                }
              }).catch(() => {});
            }
          } else if (eventName === EVENT_NAMES.JOB_FILLED) {
            for (const area of areaKeys) {
              io.to(`area:${area}:worker`).emit(eventName, sanitizedPayload);
            }
          } else if (eventName === EVENT_NAMES.WORKER_FREE || eventName === EVENT_NAMES.WORKER_BUSY) {
            for (const area of areaKeys) {
              io.to(`area:${area}:customer`).emit(eventName, sanitizedPayload);
            }
          }
        }
      } catch (err) {
        logger.warn({ msg: 'Error broadcasting realtime event to sockets', eventName, error: err.message });
      }
    });
  });
}

/**
 * Close Socket.io server and stop freshness checks.
 */
export async function closeSocketServer() {
  if (freshnessInterval) {
    clearInterval(freshnessInterval);
    freshnessInterval = null;
  }
  if (ioInstance) {
    await new Promise((resolve) => ioInstance.close(resolve));
    ioInstance = null;
  }
}
