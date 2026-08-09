import { create } from 'zustand';
import { api } from '../services/api';
import type { AuthResponse, PosRole } from '../types';

interface AuthStore {
  auth: AuthResponse | null;
  isAuthenticated: boolean;
  bootstrapped: boolean;
  loginOwner: (login: string, password: string) => Promise<void>;
  loginPin: (storeSlug: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  role: () => PosRole | null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  auth: null,
  isAuthenticated: false,
  bootstrapped: false,

  loginOwner: async (login, password) => {
    const auth = await api.loginOwner(login, password);
    set({ auth, isAuthenticated: true });
  },

  loginPin: async (storeSlug, pin) => {
    const auth = await api.loginPin(storeSlug, pin);
    set({ auth, isAuthenticated: true });
  },

  logout: async () => {
    await api.logout();
    set({ auth: null, isAuthenticated: false });
  },

  bootstrap: async () => {
    const cached = api.loadAuth();
    if (!cached) {
      set({ bootstrapped: true, auth: null, isAuthenticated: false });
      return;
    }
    try {
      const auth = await api.me();
      set({ auth, isAuthenticated: true, bootstrapped: true });
    } catch {
      api.clearAuth();
      set({ auth: null, isAuthenticated: false, bootstrapped: true });
    }
  },

  role: () => get().auth?.staff.role ?? null,
}));
