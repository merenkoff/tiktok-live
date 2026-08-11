import { create } from 'zustand';
import { api } from '../services/api';
import type { User } from '../types';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearAuth: () => void;
}

function clearStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isHydrating: true,

  clearAuth: () => {
    clearStorage();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrating: false,
    });
  },

  login: async (username: string) => {
    const response = await api.login(username);
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    set({
      user: response.user,
      token: response.token,
      isAuthenticated: true,
      isHydrating: false,
    });
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // server revoke may fail if token already invalid
    }
    clearStorage();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrating: false,
    });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');

    if (!token || !rawUser) {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isHydrating: false,
      });
      return;
    }

    let cachedUser: User;
    try {
      cachedUser = JSON.parse(rawUser);
    } catch {
      clearStorage();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isHydrating: false,
      });
      return;
    }

    // Optimistic restore while validating with server
    set({
      token,
      user: cachedUser,
      isAuthenticated: true,
      isHydrating: true,
    });

    try {
      const me = await api.getMe();
      localStorage.setItem('user', JSON.stringify(me));
      set({
        user: me,
        token,
        isAuthenticated: true,
        isHydrating: false,
      });
    } catch {
      // Invalid / expired / legacy in-memory token → force re-login
      clearStorage();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isHydrating: false,
      });
    }
  },
}));
