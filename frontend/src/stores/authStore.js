import { create } from 'zustand';
import { authApi } from '../api/endpoints';
import { hasPermission as userHasPermission } from '../lib/permissions';
import { clearToken, getToken, setToken } from '../lib/token';
import { useNotificationStore } from './notificationStore';

export const useAuthStore = create((set, get) => ({
  token: getToken(),
  user: null,
  status: 'idle',

  async login(email, password) {
    const session = await authApi.login(email, password);
    setToken(session.token);
    set({ token: session.token, user: session.user, status: 'ready' });
    return session.user;
  },

  async bootstrap() {
    if (get().status !== 'idle') return;

    const token = getToken();

    if (!token) {
      set({ token: null, user: null, status: 'ready' });
      return;
    }

    set({ token, status: 'loading' });

    try {
      const { user } = await authApi.me();
      set({ user, status: 'ready' });
    } catch {
      clearToken();
      set({ token: null, user: null, status: 'ready' });
    }
  },

  logout() {
    clearToken();
    useNotificationStore.getState().reset();
    set({ token: null, user: null, status: 'ready' });
  },

  hasPermission(key, scope) {
    return userHasPermission(get().user, key, scope);
  },
}));
