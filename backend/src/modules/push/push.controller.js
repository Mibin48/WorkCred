/**
 * WorkCred Push Subscription Controller
 */

import { subscribePush, unsubscribePush } from './push.service.js';
import { ok } from '../../utils/response.js';

export async function handleSubscribePush(req, res) {
  const result = await subscribePush(req.user.id, req.body);
  return ok(res, result, result.message);
}

export async function handleUnsubscribePush(req, res) {
  const endpoint = req.body?.endpoint || req.query?.endpoint;
  const result = await unsubscribePush(req.user.id, endpoint);
  return ok(res, result, result.message);
}
