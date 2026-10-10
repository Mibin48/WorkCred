/**
 * WorkCred Activity Feed Controller
 */

import { getFeed } from './feed.service.js';
import { ok } from '../../utils/response.js';

export async function handleGetFeed(req, res) {
  const result = await getFeed(req.user.id, req.query);
  return ok(res, result);
}
