// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useAuthStore } from '../hooks/useAuth';
import { useCartStore } from '../hooks/useCart';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { server } from './msw/server';

// The module registry eagerly reaches the cashier screens, which pull in the
// Tauri bridge and the camera scanner. Neither exists in jsdom, so stub them
// globally rather than in every test that renders a route.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: () => false,
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {},
  Html5QrcodeScanner: class {},
  Html5QrcodeSupportedFormats: {},
}));

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ auth: null, isAuthenticated: false, bootstrapped: true });
  useUpdateStore.setState({ updateInfo: null, checked: false });
  useCartStore.getState().clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
