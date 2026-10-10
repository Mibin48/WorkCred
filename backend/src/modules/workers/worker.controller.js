/**
 * WorkCred Worker Module Controller
 */

import { searchWorkers, getWorkerDetail } from './worker.service.js';
import { ok } from '../../utils/response.js';

export async function handleSearchWorkers(req, res) {
  const result = await searchWorkers(req.query, req.user?.id);
  return ok(res, result);
}

export async function handleGetWorkerDetail(req, res) {
  const result = await getWorkerDetail(req.params.id, req.user?.id);
  return ok(res, result);
}
