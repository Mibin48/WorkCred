/**
 * WorkCred Incident & Safety Reporting Controller
 */

import { submitReport } from './report.service.js';
import { ok } from '../../utils/response.js';

export async function handleCreateReport(req, res) {
  const result = await submitReport(req.user, req.body, req.ip);
  return ok(res, result, result.message);
}
