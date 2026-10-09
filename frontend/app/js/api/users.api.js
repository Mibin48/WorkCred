import { http, unwrap } from './http.js';
import { store } from '../store.js';

const token = () => store.get().session?.accessToken;

export const usersApi = {
  async getMe() { return unwrap(await http.get('/users/me', token())); },
  async setRole(role) {
    const data = unwrap(await http.patch('/users/me/role', { role }, token()));
    store.setSession({ ...store.get().session, user: data.user });
    return data;
  },
  async updateMe(profile) {
    const data = unwrap(await http.patch('/users/me', profile, token()));
    store.setSession({ ...store.get().session, user: data.user });
    return data;
  },
};
