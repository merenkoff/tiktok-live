// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { useAuthStore } from '../hooks/useAuth';
import { server } from './msw/server';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    isHydrating: false,
  });

  const replace = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      hostname: 'localhost',
      host: 'localhost:3001',
      protocol: 'http:',
      href: 'http://localhost:3001/',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'http://localhost:3001',
      replace,
      assign: vi.fn(),
      reload: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
