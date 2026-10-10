/**
 * WorkCred Endorsements Controller
 */

import { addEndorsement } from './endorsement.service.js';
import { created } from '../../utils/response.js';

export async function handleAddEndorsement(req, res) {
  const result = await addEndorsement(req.user.id, req.body);
  return created(res, result, 'Worker skill endorsed successfully.');
}
