/**
 * WorkCred Work Posts Controller
 */

import { createPost, getMyPosts, deletePost } from './post.service.js';
import { ok, created } from '../../utils/response.js';

export async function handleCreatePost(req, res) {
  const result = await createPost(req.user.id, req.body);
  return created(res, result, 'Work post published successfully.');
}

export async function handleGetMyPosts(req, res) {
  const result = await getMyPosts(req.user.id, req.query);
  return ok(res, result);
}

export async function handleDeletePost(req, res) {
  const result = await deletePost(req.user.id, req.params.id);
  return ok(res, result, result.message);
}
