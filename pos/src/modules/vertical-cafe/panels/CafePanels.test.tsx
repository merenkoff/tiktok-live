// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The café's tiles on «Сьогодні» — and the part that keeps the host's
// dashboard safe: what the panel does when it cannot get its numbers.

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CafeAnalytics } from '../analytics/types';

const getCafeAnalytics = vi.fn();

vi.mock('@pos/platform', () => ({
  formatUah: (cents: number) => `${(cents / 100).toFixed(2)} ₴`,
}));
vi.mock('../analytics/cafeAnalyticsApi', () => ({
  getCafeAnalytics: (range: unknown) => getCafeAnalytics(range),
}));

const { default: CafePanels } = await import('./CafePanels');

function analytics(over: Partial<CafeAnalytics> = {}): CafeAnalytics {
  return {
    from: '2026-09-22',
    to: '2026-09-22',
    food_cost: { revenue_cents: 100_000, cost_cents: 32_500, bps: 3_250, unpriced_lines: 0 },
    sales_count: 48,
    average_check_cents: 12_500,
    peak_hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: hour === 13 ? 19 : 0,
      revenue_cents: 0,
    })),
    top_modifiers: [{ group_name: 'Молоко', name: 'вівсяне', times: 42 }],
    menu: {
      rows: [],
      excluded: [],
      thresholds: { popularity_share_bps: 1_750, unit_margin_cents: 5_000 },
      enough_data: true,
    },
    writeoffs: { rows: [], total_cost_cents: 0 },
    tables: null,
    ...over,
  };
}

const show = () =>
  render(
    <MemoryRouter>
      <CafePanels from="2026-09-22" to="2026-09-22" />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getCafeAnalytics.mockResolvedValue(analytics());
});

describe('CafePanels', () => {
  it('shows the four figures a café glances at daily', async () => {
    show();
    await waitFor(() => expect(screen.getByTestId('cafe-panel-food-cost')).toHaveTextContent('32,5 %'));
    expect(screen.getByTestId('cafe-panel-check')).toHaveTextContent('125.00 ₴');
    expect(screen.getByTestId('cafe-panel-check')).toHaveTextContent('48 чеків');
    expect(screen.getByTestId('cafe-panel-peak')).toHaveTextContent('13:00');
    expect(screen.getByTestId('cafe-panel-peak')).toHaveTextContent('19 замовлень');
    expect(screen.getByTestId('cafe-panel-modifier')).toHaveTextContent('вівсяне');
  });

  it('warns when the food cost is blind to part of the menu', async () => {
    // The honesty rule on the dashboard: a share computed over half the menu
    // must not look like a share computed over all of it.
    getCafeAnalytics.mockResolvedValue(
      analytics({
        food_cost: { revenue_cents: 100_000, cost_cents: 20_000, bps: 2_000, unpriced_lines: 3 },
      }),
    );
    show();
    await waitFor(() =>
      expect(screen.getByTestId('cafe-panel-food-cost')).toHaveTextContent(
        '3 поз. без собівартості',
      ),
    );
    // And it is not the ordinary caption any more.
    expect(screen.getByTestId('cafe-panel-food-cost')).not.toHaveTextContent('за останніми цінами');
  });

  it('adds the table figure only where there are tables', async () => {
    show();
    await waitFor(() => expect(screen.getByTestId('cafe-panels')).toBeInTheDocument());
    // A counter-service café: absent, not «0 ₴».
    expect(screen.queryByTestId('cafe-panel-table-check')).not.toBeInTheDocument();

    getCafeAnalytics.mockResolvedValue(
      analytics({
        tables: {
          bills: 7,
          guests: 19,
          revenue_cents: 140_000,
          avg_bill_cents: 20_000,
          avg_per_guest_cents: 7_368,
          turns_per_table_per_day: 1.4,
          avg_minutes: 52,
        },
      }),
    );
    show();
    await waitFor(() =>
      expect(screen.getAllByTestId('cafe-panel-table-check')[0]).toHaveTextContent('200.00 ₴'),
    );
    expect(screen.getAllByTestId('cafe-panel-table-check')[0]).toHaveTextContent('7 рахунків · 52 хв');
  });

  it('renders NOTHING when the numbers cannot be had', async () => {
    // Includes the 409 a store that is not a café gets. A broken panel on the
    // shop's main screen is worse than an absent one — the slot has no
    // fallback precisely so that a failing module cannot take the dashboard
    // down with it.
    getCafeAnalytics.mockRejectedValue(new Error('409'));
    const { container } = show();
    await waitFor(() => expect(container.querySelector('[data-testid="cafe-panels"]')).toBeNull());
  });
});
