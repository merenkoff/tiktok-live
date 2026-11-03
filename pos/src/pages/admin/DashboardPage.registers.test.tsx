// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Сьогодні» by register (track ДК, TechDocs/POS_DUAL_REGISTER.md): two
// registers are two ФОП, so the owner reads each one's takings apart — and a
// store with one register sees nothing new.

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
      posRequest: async () => {
        throw Object.assign(new Error('older'), { response: { status: 404 } });
      },
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
    from: '2026-11-03',
    to: '2026-11-03',
    sales_count: 3,
    gross_cents: 150000,
    refunded_cents: 10000,
    net_cents: 140000,
    avg_check_cents: 50000,
    top_items: [],
    payments: [{ method: 'card', amount_cents: 150000, unconfirmed_cents: 0 }],
    daily: [],
    ...over,
  } as SalesSummary;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard — takings by register', () => {
  it('lists each register with its own takings', async () => {
    salesSummary.mockResolvedValue(
      summary({
        registers: [
          {
            register_no: 1,
            label: null,
            sales_count: 2,
            gross_cents: 100000,
            refunded_cents: 10000,
            net_cents: 90000,
            rounding_cents: 0,
            payments: [{ method: 'card', amount_cents: 100000 }],
          },
          {
            register_no: 2,
            label: 'Бар',
            sales_count: 1,
            gross_cents: 50000,
            refunded_cents: 0,
            net_cents: 50000,
            rounding_cents: 0,
            payments: [{ method: 'card', amount_cents: 50000 }],
          },
        ],
      })
    );
    renderWithProviders(<DashboardPage />);

    const one = await screen.findByTestId('dashboard-register-1');
    expect(one).toHaveTextContent('Каса 1');
    expect(one).toHaveTextContent('2 чеки');
    expect(one).toHaveTextContent('повернення 100,00 ₴');
    const two = screen.getByTestId('dashboard-register-2');
    expect(two).toHaveTextContent('Каса 2 · Бар');
    expect(two).toHaveTextContent('1 чек');
    expect(two).toHaveTextContent('500,00 ₴');
  });

  it('shows nothing in a store with one register', async () => {
    salesSummary.mockResolvedValue(summary());
    renderWithProviders(<DashboardPage />);

    await screen.findByTestId('dashboard-stats');
    expect(screen.queryByTestId('dashboard-registers')).not.toBeInTheDocument();
  });
});
