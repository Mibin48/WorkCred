/**
 * WorkCred Upload Signing Service
 * Generates HMAC-SHA1 signatures bound to caller folders.
 */

import { generateUploadSignature } from '../../utils/cloudinary.js';
import { validateUploadSign } from '../../../../shared/validators.js';
import { AppError } from '../../../../shared/errors.js';
import { logger } from '../../utils/logger.js';

export async function signUpload(userId, body = {}) {
  const validationErrors = validateUploadSign(body);
  if (validationErrors.length > 0) {
    throw new AppError('VALIDATION_ERROR', validationErrors[0].message, 400, validationErrors);
  }

  const { purpose } = body;
  const signatureData = generateUploadSignature({ userId, purpose });

  logger.info({
    event: 'upload_signed',
    userId,
    purpose,
  });

  return signatureData;
}
