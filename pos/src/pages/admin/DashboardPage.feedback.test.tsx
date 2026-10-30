// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The dashboard's glance at guests' feedback (F4): drawn for a kitchen
// vertical with feedback in the window, and nothing at all for a boutique, on
// an older server, or with none — the owner's morning screen never breaks for it.

import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../hooks/useAuth';
import { makeAuthResponse, renderWithProviders } from '../../test/utils';
import type { SalesSummary } from '../../types';

const salesSummary = vi.fn<[unknown], Promise<SalesSummary>>();
const posRequest = vi.fn<[string, string, unknown?], Promise<unknown>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      ...real.api,
      salesSummary: (p: unknown) => salesSummary(p),
      posRequest: (m: string, p: string, b?: unknown) => posRequest(m, p, b),
      lowStock: async () => [],
      listPreorders: async () => [],
    },
  };
});

vi.mock('./attention', async () => {
  const real = await vi.importActual<typeof import('./attention')>('./attention');
  const state = { items: [], load: async () => undefined };
  const useAttention = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state,
  });
  return { ...real, useAttention };
});

const { DashboardPage } = await import('./DashboardPage');

const SUMMARY: SalesSummary = {
  from: '2026-10-31',
  to: '2026-10-31',
  sales_count: 0,
  gross_cents: 0,
  refunded_cents: 0,
  net_cents: 0,
  avg_check_cents: 0,
  top_items: [],
  payments: [],
  daily: [],
} as SalesSummary;

const CAFE = { id: 'cafe', title: 'Кав’ярня', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 3, dishFacts: true };
const BOUTIQUE = { id: 'clothing', title: 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1, dishFacts: false };

function signIn(vertical: typeof CAFE) {
  useAuthStore.setState({ auth: makeAuthResponse({ store: { vertical } as never }) } as never);
}

afterEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ auth: null } as never);
});

describe('Dashboard — guests’ feedback', () => {
  it('draws the average, the count, the low ones waiting and the newest words for a café', async () => {
    signIn(CAFE);
    salesSummary.mockResolvedValue(SUMMARY);
    posRequest.mockResolvedValue({
      from: '2026-10-31',
      to: '2026-10-31',
      count: 4,
      average: 4.3,
      distribution: { '1': 0, '2': 1, '3': 0, '4': 0, '5': 3 },
      tags: [],
      unhandled_low: 1,
      latest: [{ id: 1, score: 2, comment: 'Довго чекали суп', created_at: '2026-10-31T17:00:00.000Z' }],
    });
    renderWithProviders(<DashboardPage />);
    const tile = await screen.findByTestId('dashboard-feedback');
    expect(tile).toHaveTextContent('4,3');
    expect(tile).toHaveTextContent('відгуків: 4');
    expect(tile).toHaveTextContent('низьких без відповіді: 1');
    expect(tile).toHaveTextContent('Довго чекали суп');
    expect(screen.getByRole('link', { name: 'Усі відгуки' })).toHaveAttribute('href', '/admin/reviews');
    expect(posRequest).toHaveBeenCalledWith('get', '/feedback/summary?from=2026-10-31&to=2026-10-31', undefined);
  });

  it('asks nothing for a boutique, and draws nothing on an older server or with no feedback', async () => {
    signIn(BOUTIQUE);
    salesSummary.mockResolvedValue(SUMMARY);
    const boutique = renderWithProviders(<DashboardPage />);
    await screen.findByTestId('dashboard-attention');
    expect(posRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dashboard-feedback')).not.toBeInTheDocument();
    boutique.unmount();

    signIn(CAFE);
    posRequest.mockRejectedValue({ response: { status: 404 } });
    const older = renderWithProviders(<DashboardPage />);
    await screen.findByTestId('dashboard-attention');
    await waitFor(() => expect(posRequest).toHaveBeenCalled());
    expect(screen.queryByTestId('dashboard-feedback')).not.toBeInTheDocument();
    older.unmount();

    posRequest.mockResolvedValue({ from: '', to: '', count: 0, average: null, distribution: {}, tags: [], unhandled_low: 0, latest: [] });
    renderWithProviders(<DashboardPage />);
    await screen.findByTestId('dashboard-attention');
    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('dashboard-feedback')).not.toBeInTheDocument();
  });
});
