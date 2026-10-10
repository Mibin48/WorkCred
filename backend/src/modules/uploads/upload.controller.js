/**
 * WorkCred Upload Signing Controller
 */

import { signUpload } from './upload.service.js';
import { ok } from '../../utils/response.js';

export async function handleSignUpload(req, res) {
  const result = await signUpload(req.user.id, req.body);
  return ok(res, result);
}
