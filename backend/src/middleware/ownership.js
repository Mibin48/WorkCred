/**
 * WorkCred Resource Ownership Assertion Helper
 */

import { AppError } from '../../../shared/errors.js';

export function assertOwner(resourceOwnerId, requesterId) {
  if (String(resourceOwnerId) !== String(requesterId)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to access or modify this resource.', 403);
  }
}
