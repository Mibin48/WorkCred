/**
 * WorkCred User Profile Controller
 */

import { getMe, setUserRole, updateMe } from './user.service.js';
import { ok } from '../../utils/response.js';

export async function handleGetMe(req, res) {
  const result = await getMe(req.user.id);
  return ok(res, result, 'Profile retrieved successfully');
}

export async function handleSetRole(req, res) {
  const result = await setUserRole(req.user.id, req.body);
  return ok(res, result, 'Role set successfully');
}

export async function handleUpdateMe(req, res) {
  const result = await updateMe(req.user.id, req.body);
  return ok(res, result, 'Profile updated successfully');
}
