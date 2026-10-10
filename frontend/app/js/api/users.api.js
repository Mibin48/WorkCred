import { http, unwrap } from './http.js';
import { store } from '../store.js';

const token = () => store.get().session?.accessToken;

export const usersApi = {
  async getMe() {
    const data = unwrap(await http.get('/users/me', token()));
    const user = data.user || data;
    return { ...user, user };
  },

  async setRole(role) {
    const data = unwrap(await http.patch('/users/me/role', { role }, token()));
    const user = data.user || data;
    store.setSession({ ...store.get().session, user });
    return { ...user, user };
  },

  async updateMe(profile) {
    const data = unwrap(await http.patch('/users/me', profile, token()));
    const user = data.user || data;
    store.setSession({ ...store.get().session, user });
    return { ...user, user };
  },
};
