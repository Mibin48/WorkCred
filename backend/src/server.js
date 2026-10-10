/**
 * WorkCred Server Entrypoint
 * Connects to MongoDB Atlas, starts HTTP + Socket.io servers, and manages graceful shutdowns.
 */

import http from 'node:http';
import { app } from './app.js';
import { config } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { initSocketServer, closeSocketServer } from './realtime/socket.js';
import { startSweep, stopSweep } from './jobs/sweep.js';
import { logger } from './utils/logger.js';

let server;

async function startServer() {
  try {
    // 1. Establish Database Connection
    if (config.MONGODB_URI) {
      await connectDb(config.MONGODB_URI);
    } else {
      logger.warn('Starting server without MONGODB_URI (test or development mode).');
    }

    // 2. Start Background Sweep Worker (clean up expired jobs/bookings)
    if (config.NODE_ENV !== 'test') {
      startSweep(60000);
    }

    // 3. Create HTTP Server & Attach Socket.io
    server = http.createServer(app);
    initSocketServer(server, { appOrigin: config.APP_ORIGIN });

    // 4. Start Listening
    server.listen(config.PORT, () => {
      logger.info(`🚀 WorkCred API server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
      logger.info(`   Local API URL: http://localhost:${config.PORT}/api/v1/health`);
      logger.info(`   App Origin: ${config.APP_ORIGIN}`);
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
