/**
 * WorkCred Image Upload Mock Service
 */

import { LIMITS } from '../../../../shared/constants.js';
import { AppError } from '../../../../shared/errors.js';

export function signUpload(body = {}) {
  const { fileName = 'image.jpg', fileSizeBytes = 0, mimeType = 'image/jpeg' } = body;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(mimeType)) {
    throw new AppError('VALIDATION_ERROR', 'Only JPEG, PNG, and WebP images are allowed.', 400);
  }

  if (fileSizeBytes > LIMITS.MAX_UPLOAD_SIZE_BYTES) {
    throw new AppError('VALIDATION_ERROR', 'File size exceeds the 5 MB limit. Choose a smaller image.', 400);
  }

  return {
    uploadUrl: '/mock/upload',
    fileKey: `uploads/${Date.now()}-${fileName}`,
    maxSizeBytes: LIMITS.MAX_UPLOAD_SIZE_BYTES,
    allowedMimeTypes: validTypes,
  };
}
