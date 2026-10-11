/**
 * WorkCred Server Entrypoint
 * Connects to MongoDB Atlas, starts HTTP + Socket.io servers, and manages graceful shutdowns.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { app } from './app.js';
import { config } from './config/env.js';
import { connectDb, disconnectDb, isDbConnected } from './config/db.js';
import { initSocketServer, closeSocketServer } from './realtime/socket.js';
import { startSweep, stopSweep } from './jobs/sweep.js';
import { logger } from './utils/logger.js';
import { printStartupBanner, getLanIp } from './utils/banner.js';

let server;

async function startServer() {
  const isLanMode = process.argv.includes('--lan') || process.env.LAN_MODE === '1' || process.env.LAN_MODE === 'true';
  const bindHost = isLanMode ? '0.0.0.0' : '127.0.0.1';

  if (isLanMode) {
    const lanIp = getLanIp();
    if (lanIp) {
      const lanOrigin = `http://${lanIp}:${config.PORT}`;
      if (!config.APP_ORIGINS.includes(lanOrigin)) {
        config.APP_ORIGINS.push(lanOrigin);
      }
    }
  }

  // Check for local TLS certificates (optional HTTPS)
  const certPath = process.env.TLS_CERT_FILE;
  const keyPath = process.env.TLS_KEY_FILE;
  let isHttps = false;
  let tlsOptions = null;

  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      tlsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      };
      isHttps = true;
    } catch (tlsErr) {
      logger.warn({ msg: 'Failed to read TLS certificate/key files, falling back to HTTP', error: tlsErr.message });
    }
  }

  try {
    // 1. Establish Database Connection
    if (config.MONGODB_URI) {
      try {
        await connectDb(config.MONGODB_URI);
      } catch (err) {
        if (config.NODE_ENV === 'production') {
          throw err;
        }
        logger.warn({ msg: 'Database connection failed; server will continue running in offline/unreachable fallback mode', error: err.message });
      }
    } else {
      logger.warn('Starting server without MONGODB_URI (test or development mode).');
    }

    // 2. Start Background Sweep Worker (clean up expired jobs/bookings)
    if (config.NODE_ENV !== 'test' && isDbConnected()) {
      startSweep(60000);
    }

    // 3. Create HTTP/HTTPS Server & Attach Socket.io
    server = isHttps ? https.createServer(tlsOptions, app) : http.createServer(app);
    initSocketServer(server, { appOrigins: config.APP_ORIGINS });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${config.PORT} is already in use by another process.`);
        console.error(`   To run WorkCred on an alternate port, pass PORT=<number>, e.g.:`);
        console.error(`     PORT=${config.PORT + 1} npm start\n`);
        process.exit(1);
      } else {
        logger.fatal({ msg: 'Server network error', error: err.message, stack: err.stack });
        process.exit(1);
      }
    });

    // 4. Start Listening
    server.listen(config.PORT, bindHost, async () => {
      if (config.NODE_ENV !== 'test') {
        await printStartupBanner({ config, isLanMode, isHttps });
      } else {
        logger.info(`WorkCred API test server running on port ${config.PORT}`);
      }
    });
  } catch (err) {
    logger.fatal({ msg: 'Fatal error during server startup', error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Graceful Shutdown Handler
async function handleShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop background sweep & close socket connections
  stopSweep();
  await closeSocketServer();

  const forceExitTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out (10s). Forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error({ msg: 'Error closing HTTP server', error: err.message });
      } else {
        logger.info('HTTP server closed successfully.');
      }

      try {
        await disconnectDb();
        clearTimeout(forceExitTimeout);
        logger.info('Graceful shutdown complete.');
        process.exit(0);
      } catch (dbErr) {
        logger.error({ msg: 'Error disconnecting database during shutdown', error: dbErr.message });
        process.exit(1);
      }
    });
  } else {
    await disconnectDb();
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ msg: 'Unhandled Promise Rejection', reason: reason?.message || reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ msg: 'Uncaught Exception', error: err.message, stack: err.stack });
  process.exit(1);
});

startServer();
