// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Популярні товари» with weighed goods (TechDocs/grocery/G4_WEIGHED.md): a
// weighing's grams read as kilograms, a café's grams stay grams, pieces stay
// «шт.» — and a row from an older server, with no unit at all, reads as before.

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
      // The feedback tile (F4) asks and, told «older server», draws nothing.
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

describe('Dashboard — weighed top items', () => {
  it('shows each item in its own unit, a weighing in kilograms', async () => {
    salesSummary.mockResolvedValue(
      summary({
        top_items: [
          { product_name: 'Сир твердий', variant_label: 'Гауда', qty_sold: 3500, unit: 'г', price_per: 1000, revenue_cents: 66465 },
          { product_name: 'Хліб', variant_label: '', qty_sold: 12, unit: 'шт', price_per: 1, revenue_cents: 55080 },
          { product_name: 'Сироп', variant_label: '', qty_sold: 250, unit: 'г', price_per: 1, revenue_cents: 2500 },
          { product_name: 'Футболка', variant_label: 'M', qty_sold: 2, revenue_cents: 90000 },
        ],
      })
    );
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('3,500 кг')).toBeInTheDocument();
    expect(screen.getByText('12 шт.')).toBeInTheDocument();
    expect(screen.getByText('250 г')).toBeInTheDocument();
    expect(screen.getByText('2 шт.')).toBeInTheDocument();
  });
});
