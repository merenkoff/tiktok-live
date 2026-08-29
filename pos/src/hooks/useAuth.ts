import { create } from 'zustand';
import { api, isNetworkError, isUnauthorized } from '../services/api';
import type { AuthResponse, PosRole } from '../types';
import { isOfflinePosEnabled } from '../offline/enabled';

const LAST_SLUG_KEY = 'pos_last_store_slug';

export function loadLastStoreSlug(): string {
  return localStorage.getItem(LAST_SLUG_KEY) ?? '';
}

function persistStoreSlug(slug: string): void {
  const value = slug.trim();
  if (value) localStorage.setItem(LAST_SLUG_KEY, value);
}

async function afterOnlineLogin(
  auth: AuthResponse,
  secret: string,
  kind: 'pin' | 'password',
  loginHint?: string | null
): Promise<void> {
  if (!isOfflinePosEnabled()) return;
  persistStoreSlug(auth.store.slug);
  const offline = await import('../offline');
  await offline.saveStaffUnlock({ auth, secret, kind, loginHint });
  void offline
    .refreshSnapshot()
    .then(() => offline.runSync())
    .catch(() => undefined);
}

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
    const tryLocal = async () => {
      const { localOwnerLogin } = await import('../offline');
      const auth = await localOwnerLogin(login, password, api.loadAuth());
      api.saveAuth(auth);
      persistStoreSlug(auth.store.slug);
      set({ auth, isAuthenticated: true });
    };

    // Не довіряємо navigator.onLine (у WebView2 на Windows він відображає
    // статус Windows NCSI, а не фактичний зв'язок). Завжди пробуємо мережу,
    // у локальний кеш падаємо лише на реальній мережевій помилці.
    try {
      const auth = await api.loginOwner(login, password);
      await afterOnlineLogin(auth, password, 'password', login);
      set({ auth, isAuthenticated: true });
    } catch (error) {
      if (isOfflinePosEnabled() && isNetworkError(error)) {
        await tryLocal();
        return;
      }
      throw error;
    }
  },

  loginPin: async (storeSlug, pin) => {
    const tryLocal = async () => {
      const { localPinLogin } = await import('../offline');
      const auth = await localPinLogin(storeSlug, pin, api.loadAuth());
      api.saveAuth(auth);
      persistStoreSlug(storeSlug);
      set({ auth, isAuthenticated: true });
    };

    // Див. коментар у loginOwner: navigator.onLine у Tauri/WebView2 ненадійний.
    try {
      const auth = await api.loginPin(storeSlug, pin);
      await afterOnlineLogin(auth, pin, 'pin');
      set({ auth, isAuthenticated: true });
    } catch (error) {
      if (isOfflinePosEnabled() && isNetworkError(error)) {
        await tryLocal();
        return;
      }
      throw error;
    }
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

    const offlineToken = cached.offlineSession || cached.token.startsWith('offline:');
    if (isOfflinePosEnabled() && offlineToken) {
      const { hasUnlockForAuth } = await import('../offline');
      const ok = await hasUnlockForAuth(cached);
      set({
        bootstrapped: true,
        auth: ok ? cached : null,
        isAuthenticated: ok,
      });
      if (!ok) api.clearAuth();
      return;
    }

    try {
      const auth = await api.me();
      set({ auth, isAuthenticated: true, bootstrapped: true });
      if (isOfflinePosEnabled()) {
        const offline = await import('../offline');
        void offline
          .refreshSnapshot()
          .then(() => offline.runSync())
          .catch(() => undefined);
      }
    } catch (error) {
      if (isUnauthorized(error)) {
        api.clearAuth();
        set({ auth: null, isAuthenticated: false, bootstrapped: true });
        return;
      }
      if (api.hasLiveJwt()) {
        set({ auth: cached, isAuthenticated: true, bootstrapped: true });
        return;
      }
      api.clearAuth();
      set({ auth: null, isAuthenticated: false, bootstrapped: true });
    }
  },

  role: () => get().auth?.staff.role ?? null,
}));
