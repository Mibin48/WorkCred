/**
 * WorkCred Database Connection & Transaction Manager
 * MongoDB Atlas connection pool with retry backoff, transaction management,
 * and masked diagnostic logging.
 */

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { parseMongoUri } from './env.js';

let isConnected = false;

export const DB_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10,
  autoIndex: process.env.NODE_ENV !== 'production',
};

/**
 * Log connection error diagnostic checklist without leaking URI/secrets.
 */
function logConnectionTroubleshooting(err, uri) {
  const parsed = parseMongoUri(uri);
  logger.error({
    msg: 'MongoDB Atlas connection attempt failed.',
    error: err.message,
    database: parsed.dbName || 'unknown',
    host: parsed.maskedHost || 'unknown-host',
  });

  console.error('\n⚠️  MongoDB Connection Troubleshooting Checklist:');
  console.error('   1. [Atlas Network Access]: Is your current public IP added to the Atlas IP Access List?');
  console.error('   2. [Authentication]: Are your username and password correct? (Special characters must be URL-encoded).');
  console.error('   3. [Cluster Status]: Is your MongoDB Atlas cluster active and not paused?');
  console.error('   4. [DNS / Firewall]: If your network blocks SRV DNS lookups (mongodb+srv://), use Atlas standard connection string (mongodb://).\n');
}

let isReconnecting = false;
let reconnectTimer = null;
let lastConnectionError = null;

export function getLastConnectionError() {
  return lastConnectionError;
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

export function stopBackgroundReconnect() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting = false;
}

export function startBackgroundReconnect(uri) {
  if (isReconnecting || reconnectTimer) return;
  isReconnecting = true;
  logger.info('Database background reconnection monitor started (retrying every 30s)...');

  reconnectTimer = setInterval(async () => {
    if (isDbConnected()) {
      stopBackgroundReconnect();
      return;
    }

    try {
      logger.info('Attempting background reconnection to MongoDB...');
      await mongoose.connect(uri, DB_OPTIONS);
      isConnected = true;
      lastConnectionError = null;
      const parsed = parseMongoUri(uri);
      logger.info(`✅ Successfully reconnected to MongoDB database: ${parsed.dbName} on host: ${parsed.maskedHost}`);
      stopBackgroundReconnect();
    } catch (err) {
      lastConnectionError = err;
      logger.warn({
        msg: 'Background MongoDB reconnection attempt failed. Retrying in 30s...',
        error: err.message,
      });
    }
  }, 30000);

  if (reconnectTimer.unref) {
    reconnectTimer.unref();
  }
}

/**
 * Connect to MongoDB with exponential backoff retry.
 */
export async function connectDb(uri = process.env.MONGODB_URI, maxRetries = 5) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const parsed = parseMongoUri(uri);
  const dbName = parsed.dbName || 'workcred';
  const maskedHost = parsed.maskedHost || 'atlas-cluster';

  let attempt = 0;
  let delay = 1000;

  while (attempt < maxRetries) {
    try {
      attempt++;
      logger.info(`Connecting to MongoDB (${maskedHost}/${dbName}) [Attempt ${attempt}/${maxRetries}]...`);
      await mongoose.connect(uri, DB_OPTIONS);
      isConnected = true;
      lastConnectionError = null;
      stopBackgroundReconnect();
      logger.info(`✅ Successfully connected to MongoDB database: ${dbName} on host: ${maskedHost}`);
      return mongoose.connection;
    } catch (err) {
      lastConnectionError = err;
      logConnectionTroubleshooting(err, uri);
      if (attempt >= maxRetries) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn(`Failed initial connection after ${maxRetries} attempts in development. Server will stay up and retry in background.`);
          isConnected = false;
          startBackgroundReconnect(uri);
          return null;
        }
        throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts: ${err.message}`);
      }
      logger.info(`Retrying MongoDB connection in ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }
}

/**
 * Disconnect from MongoDB gracefully.
 */
export async function disconnectDb() {
  stopBackgroundReconnect();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB.');
  }
}

/**
 * Check if database is currently reachable.
 */
export async function isDbReady() {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }
  try {
    const res = await mongoose.connection.db.admin().ping();
    return res && res.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Executes a callback within a MongoDB multi-document transaction.
 * Automatically retries on TransientTransactionError and UnknownTransactionCommitResult.
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
