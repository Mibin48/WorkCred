/**
 * WorkCred Follows and Saves Controller
 */

import { toggleFollow, removeFollow, getFollows } from './follow.service.js';
import { ok } from '../../utils/response.js';

export async function handleToggleFollow(req, res) {
  const result = await toggleFollow(req.user.id, req.body);
  return ok(res, result);
}

export async function handleRemoveFollow(req, res) {
  const toUserId = req.params.toId || req.params.toUserId;
  const type = req.query.type || req.body?.type || null;
  const result = await removeFollow(req.user.id, toUserId, type);
  return ok(res, result, result.message);
}

export async function handleGetFollows(req, res) {
  const result = await getFollows(req.user.id, req.query);
  return ok(res, result);
}
