import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        gcTime: 0,
      },
      mutations: { retry: false },
    },
  });
}

interface ProvidersOptions {
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient = createTestQueryClient(), ...options }: ProvidersOptions & Omit<RenderOptions, 'wrapper'> = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}

export const mockUser = {
  id: 1,
  tiktok_username: 'evelin_kids',
  created_at: '2026-01-01T00:00:00.000Z',
  is_active: true,
  subscription_level: 'free' as const,
};

export const mockSettings = {
  id: 1,
  user_id: 1,
  telegram_bot_token: 'bot-token',
  telegram_channel_id: -100123,
  novaposhta_api_key: '',
  novaposhta_merchant_name: 'Shop',
  tiktok_username: 'evelin_kids',
  reservation_timeout_minutes: 5,
  payment_timeout_minutes: 10,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

export const mockSession = {
  id: 10,
  user_id: 1,
  status: 'running' as const,
  started_at: '2026-01-01T12:00:00.000Z',
  created_at: '2026-01-01T12:00:00.000Z',
};

export function makeLog(
  overrides: Partial<{
    id: number;
    session_id: number;
    user_id: number;
    log_type: 'tiktok_comment' | 'telegram_message' | 'order' | 'error' | 'info';
    message: string;
    created_at: string;
  }> = {}
) {
  return {
    id: overrides.id ?? 1,
    session_id: overrides.session_id ?? 10,
    user_id: overrides.user_id ?? 1,
    log_type: overrides.log_type ?? ('info' as const),
    message: overrides.message ?? 'hello',
    created_at: overrides.created_at ?? '2026-01-01T12:00:00.000Z',
  };
}
