/**
 * WorkCred Job Module Controller
 */

import { createJob, getOpenJobs, getCustomerJobs, acceptJob, cancelJob } from './job.service.js';
import { ok } from '../../utils/response.js';

export async function handleCreateJob(req, res) {
  const result = await createJob(req.user.id, req.body);
  return ok(res, result, 'Job posted successfully');
}

export async function handleGetOpenJobs(req, res) {
  const result = await getOpenJobs(req.user.id, req.query);
  return ok(res, result);
}

export async function handleGetCustomerJobs(req, res) {
  const result = await getCustomerJobs(req.user.id);
  return ok(res, result);
}

export async function handleAcceptJob(req, res) {
  const result = await acceptJob(req.user.id, req.params.id);
  return ok(res, result, 'Job accepted successfully');
}

export async function handleCancelJob(req, res) {
  const result = await cancelJob(req.user.id, req.params.id);
  return ok(res, result, 'Job cancelled successfully');
}
