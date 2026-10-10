/**
 * WorkCred Cloudinary Utilities
 * Zero external SDKs: Signs upload requests using node:crypto HMAC/SHA-1,
 * enforces strict caller folder ownership, and executes signed asset destruction.
 */

import crypto from 'node:crypto';
import { AppError } from '../../../shared/errors.js';
import { logger } from './logger.js';
import { config } from '../config/env.js';

/**
 * Generate signed upload parameters for direct client upload to Cloudinary.
 * @param {object} params
 * @param {string} params.userId
 * @param {'profile'|'post'} params.purpose
 * @param {number} [params.timestamp]
 * @param {string} [params.cloudName]
 * @param {string} [params.apiKey]
 * @param {string} [params.apiSecret]
 */
export function generateUploadSignature({
  userId,
  purpose,
  timestamp = Math.floor(Date.now() / 1000),
  cloudName = process.env.CLOUDINARY_CLOUD_NAME || config.CLOUDINARY_CLOUD_NAME,
  apiKey = process.env.CLOUDINARY_API_KEY || config.CLOUDINARY_API_KEY,
  apiSecret = process.env.CLOUDINARY_API_SECRET || config.CLOUDINARY_API_SECRET,
}) {
  if (!cloudName || !apiKey || !apiSecret || cloudName === 'placeholder' || apiKey === 'placeholder' || apiSecret === 'placeholder') {
    throw new AppError('SERVICE_UNAVAILABLE', 'Cloudinary storage credentials are not configured.', 503);
  }

  if (!userId) {
    throw new AppError('UNAUTHENTICATED', 'User ID is required to sign uploads.', 401);
  }

  if (!['profile', 'post'].includes(purpose)) {
    throw new AppError('VALIDATION_ERROR', "Purpose must be 'profile' or 'post'.", 400);
  }

  const folder = `workcred/${userId}/${purpose}`;
  const allowedFormats = 'jpg,png,webp';

  // Cloudinary signature parameters must be sorted alphabetically by key name
  const paramsToSign = {
    allowed_formats: allowedFormats,
    folder,
    timestamp,
  };

  const sortedKeys = Object.keys(paramsToSign).sort();
  const serialized = sortedKeys.map((k) => `${k}=${paramsToSign[k]}`).join('&');
  const stringToSign = serialized + apiSecret;

  const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

  return {
    cloudName,
    apiKey,
    timestamp,
    folder,
    allowedFormats,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
}

/**
 * Validates that an image URL belongs to the caller's authorized Cloudinary storage folder.
 * Rejects any foreign folders, path traversal, query parameters, or non-Cloudinary hosts.
 * @param {string} url
 * @param {string} userId
 * @param {string} [cloudName]
 * @returns {boolean}
 */
export function validateOwnImageUrl(url, userId, cloudName = null) {
  if (!url || typeof url !== 'string') return false;

  // Reject query params, hashes, path traversal, or encoded characters
  if (url.includes('?') || url.includes('#') || url.includes('..') || /%2f/i.test(url)) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // Enforce HTTPS, exact hostname, and no userinfo
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.username || parsed.password) {
    return false;
  }

  const expectedCloudName = cloudName || process.env.CLOUDINARY_CLOUD_NAME || config.CLOUDINARY_CLOUD_NAME;
  if (!expectedCloudName || expectedCloudName === 'placeholder') return false;

  // Path format: /<cloudName>/image/upload/(v<version>/)?workcred/<userId>/<purpose>/<filename>.<ext>
  // or /<cloudName>/image/upload/(v<version>/)?workcred/<userId>/<filename>.<ext>
  const expectedPrefix = `/${expectedCloudName}/image/upload/`;
  if (!parsed.pathname.startsWith(expectedPrefix)) {
    return false;
  }

  const remainder = parsed.pathname.slice(expectedPrefix.length);
  // Strip optional version segment (e.g. v1728500000/)
  const withoutVersion = remainder.replace(/^v\d+\//, '');

  const expectedFolderPrefix = `workcred/${userId}/`;
  if (!withoutVersion.startsWith(expectedFolderPrefix)) {
    return false;
  }

  // Must end in allowed image extension
  if (!/\.(jpg|jpeg|png|webp)$/i.test(withoutVersion)) {
    return false;
  }

  return true;
}

/**
 * Extract public_id from Cloudinary URL for deletion.
 * @param {string} url
 * @param {string} [cloudName]
 * @returns {string|null}
 */
export function extractPublicIdFromUrl(url, cloudName = null) {
  if (!url || typeof url !== 'string') return null;
  try {
    const activeCloudName = cloudName || process.env.CLOUDINARY_CLOUD_NAME || config.CLOUDINARY_CLOUD_NAME;
    const parsed = new URL(url);
    const expectedPrefix = `/${activeCloudName}/image/upload/`;
    if (!parsed.pathname.startsWith(expectedPrefix)) return null;

    let path = parsed.pathname.slice(expectedPrefix.length);
    path = path.replace(/^v\d+\//, ''); // strip version
    // strip extension
    const lastDot = path.lastIndexOf('.');
    if (lastDot !== -1) {
      path = path.slice(0, lastDot);
    }
    return path;
  } catch {
    return null;
  }
}

/**
 * Best-effort signed asset deletion from Cloudinary.
 * Never throws; logs warning on failure.
 * @param {string} publicId
 * @param {object} [options]
 * @param {string} [options.cloudName]
 * @param {string} [options.apiKey]
 * @param {string} [options.apiSecret]
 * @param {Function} [options.customFetch]
 */
export async function destroyCloudinaryAsset(publicId, options = {}) {
  if (!publicId) return;

  const cloudName = options.cloudName || process.env.CLOUDINARY_CLOUD_NAME || config.CLOUDINARY_CLOUD_NAME;
  const apiKey = options.apiKey || process.env.CLOUDINARY_API_KEY || config.CLOUDINARY_API_KEY;
  const apiSecret = options.apiSecret || process.env.CLOUDINARY_API_SECRET || config.CLOUDINARY_API_SECRET;
  const fetchFn = options.customFetch || globalThis.fetch;

  if (!cloudName || !apiKey || !apiSecret || cloudName === 'placeholder' || apiKey === 'placeholder' || apiSecret === 'placeholder') {
    logger.debug({ msg: 'Skipping Cloudinary destroy: credentials not configured', publicId });
    return;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: apiKey,
      signature,
    });

    const res = await fetchFn(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body,
    });

    if (!res.ok) {
      logger.warn({ msg: 'Cloudinary destroy failed with HTTP status', status: res.status, publicId });
    } else {
      logger.info({ msg: 'Cloudinary asset destroyed successfully', publicId });
    }
  } catch (err) {
    logger.warn({ msg: 'Error executing Cloudinary destroy', error: err.message, publicId });
  }
}
