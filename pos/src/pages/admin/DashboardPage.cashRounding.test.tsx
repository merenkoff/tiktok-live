// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Сьогодні» and cash rounding (TechDocs/POS_CASH_ROUNDING.md): with rounding
// the payments no longer add up to the takings, so the dashboard says by how
// much — and says nothing in a store that never rounds or on an older server.

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import type { SalesSummary } from '../../types';

const salesSummary = vi.fn<[unknown], Promise<SalesSummary>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      ...real.api,
      salesSummary: (p: unknown) => salesSummary(p),
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

function summary(over: Partial<SalesSummary> = {}): SalesSummary {
  return {
    from: '2026-10-23',
    to: '2026-10-23',
    sales_count: 2,
    gross_cents: 44246,
    refunded_cents: 22123,
    net_cents: 22123,
    avg_check_cents: 22123,
    top_items: [],
    payments: [{ method: 'cash', amount_cents: 44200, unconfirmed_cents: 0 }],
    daily: [],
    ...over,
  } as SalesSummary;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard — cash rounding', () => {
  it('names the rounding of sales and of refunds', async () => {
    salesSummary.mockResolvedValue(summary({ rounding_cents: -46, refund_rounding_cents: -23 }));
    renderWithProviders(<DashboardPage />);

    const block = await screen.findByTestId('dashboard-rounding');
    expect(block).toHaveTextContent('Заокруглення готівки в продажах: −0,46 ₴');
    expect(block).toHaveTextContent('Заокруглення готівкових повернень: −0,23 ₴');
  });

  it('shows nothing when there is no rounding or the server is older', async () => {
    salesSummary.mockResolvedValue(summary({ payments: [{ method: 'cash', amount_cents: 44246, unconfirmed_cents: 0 }] }));
    renderWithProviders(<DashboardPage />);

    await screen.findByTestId('dashboard-stats');
    expect(screen.queryByTestId('dashboard-rounding')).not.toBeInTheDocument();
  });
});
