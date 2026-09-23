// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's menu screen (К6c). Most of what is worth testing here is the
// three refusals: no classification without a sample, no quadrant for a dish
// whose cost is unknown, and no restaurant block in a shop without tables.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CafeAnalytics, MenuMatrixRow } from '../analytics/types';

const getCafeAnalytics = vi.fn();

vi.mock('@pos/platform', () => ({
  formatUah: (cents: number) => `${(cents / 100).toFixed(2)} ₴`,
  useVertical: () => ({
    id: 'cafe',
    title: 'Кафе',
    attributes: [],
    units: ['шт'],
    defaultUnit: 'шт',
    writeoffReasons: [
      { code: 'spoiled', label: 'Зіпсувалося' },
      { code: 'tasting', label: 'Проба' },
    ],
  }),
}));
vi.mock('../analytics/cafeAnalyticsApi', () => ({
  getCafeAnalytics: (range: unknown) => getCafeAnalytics(range),
}));

const { default: CafeAnalyticsPage } = await import('./CafeAnalyticsPage');

function dish(over: Partial<MenuMatrixRow>): MenuMatrixRow {
  return {
    variant_id: 1,
    product_name: 'Капучино',
    label: 'M',
    sold: 40,
    share_bps: 4_000,
    revenue_cents: 200_000,
    cost_cents: 60_000,
    margin_cents: 140_000,
    unit_margin_cents: 3_500,
    quadrant: 'star',
    ...over,
  };
}

function analytics(over: Partial<CafeAnalytics> = {}): CafeAnalytics {
  return {
    from: '2026-08-24',
    to: '2026-09-22',
    food_cost: { revenue_cents: 400_000, cost_cents: 130_000, bps: 3_250, unpriced_lines: 0 },
    sales_count: 96,
    average_check_cents: 12_500,
    peak_hours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: hour === 13 ? 19 : 0,
      revenue_cents: 0,
    })),
    top_modifiers: [],
    menu: {
      rows: [
        dish({}),
        dish({ variant_id: 2, product_name: 'Сирник', quadrant: 'dog', sold: 3, margin_cents: 900 }),
      ],
      excluded: [],
      thresholds: { popularity_share_bps: 1_750, unit_margin_cents: 2_000 },
      enough_data: true,
    },
    writeoffs: {
      rows: [
        { reason: 'spoiled', quantity: 4, cost_cents: 12_000 },
        { reason: 'staff', quantity: 2, cost_cents: 3_000 },
      ],
      total_cost_cents: 15_000,
    },
    tables: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCafeAnalytics.mockResolvedValue(analytics());
});

describe('CafeAnalyticsPage', () => {
  it('opens on the month and re-reads when the owner picks another period', async () => {
    render(<CafeAnalyticsPage />);
    await waitFor(() => expect(getCafeAnalytics).toHaveBeenCalledTimes(1));
    // A single `from`, no `to`: the server's own default is «сьогодні», and a
    // hand-rolled end date is how an off-by-one loses the current day.
    expect(getCafeAnalytics.mock.calls[0][0]).toEqual({ from: expect.any(String) });

    await userEvent.click(screen.getByTestId('range-7'));
    await waitFor(() => expect(getCafeAnalytics).toHaveBeenCalledTimes(2));
    expect(getCafeAnalytics.mock.calls[1][0].from > getCafeAnalytics.mock.calls[0][0].from).toBe(
      true
    );
  });

  it('draws the four quadrants with the advice, and the table beneath them', async () => {
    render(<CafeAnalyticsPage />);
    await waitFor(() => expect(screen.getByTestId('cafe-matrix')).toBeInTheDocument());

    // The point of the screen: not the classification, the sentence after it.
    expect(screen.getByTestId('quadrant-star')).toHaveTextContent('Зірки');
    expect(screen.getByTestId('quadrant-star')).toHaveTextContent('тримати як є');
    expect(screen.getByTestId('quadrant-dog')).toHaveTextContent('прибрати з меню');
    // An empty quadrant stays on screen — «конячок немає» is itself a reading.
    expect(screen.getByTestId('quadrant-plowhorse')).toHaveTextContent('Порожньо');

    expect(screen.getByTestId('cafe-menu-table')).toHaveTextContent('Капучино');
    expect(screen.getByTestId('cafe-food-cost')).toHaveTextContent('32,5 %');
  });

  it('withholds the quadrants — but not the figures — on too small a sample', async () => {
    // Rule 3. The arithmetic is still arithmetic; the recommendation is not.
    getCafeAnalytics.mockResolvedValue(
      analytics({
        menu: {
          rows: [dish({})],
          excluded: [],
          thresholds: { popularity_share_bps: 7_000, unit_margin_cents: 3_500 },
          enough_data: false,
        },
      })
    );
    render(<CafeAnalyticsPage />);

    await waitFor(() => expect(screen.getByTestId('cafe-not-enough')).toBeInTheDocument());
    expect(screen.queryByTestId('cafe-matrix')).toBeNull();
    expect(screen.getByTestId('cafe-menu-table')).toHaveTextContent('Капучино');
    // And no quadrant word leaks into the table either.
    expect(screen.getByTestId('cafe-menu-table')).not.toHaveTextContent('зірки');
  });

  it('names a dish it could not cost instead of quietly calling it a dog', async () => {
    // Rule 2, the one that decides whether an owner cuts a dish for a true
    // reason or for a missing ingredient price.
    getCafeAnalytics.mockResolvedValue(
      analytics({
        food_cost: { revenue_cents: 400_000, cost_cents: 130_000, bps: 3_250, unpriced_lines: 7 },
        menu: {
          rows: [dish({})],
          excluded: [
            { variant_id: 9, product_name: 'Борщ', label: '', sold: 12, reason: 'no_cost' },
          ],
          thresholds: { popularity_share_bps: 7_000, unit_margin_cents: 2_000 },
          enough_data: true,
        },
      })
    );
    render(<CafeAnalyticsPage />);

    await waitFor(() => expect(screen.getByTestId('cafe-excluded')).toBeInTheDocument());
    expect(screen.getByTestId('cafe-excluded')).toHaveTextContent('Борщ');
    expect(screen.getByTestId('cafe-excluded')).toHaveTextContent(
      'не вистачає собівартості складника'
    );
    expect(screen.queryByTestId('quadrant-dog')).not.toHaveTextContent('Борщ');
    // And the food cost above says it is computed over less than everything.
    expect(screen.getByTestId('cafe-blind-lines')).toHaveTextContent('7 проданих позицій');
  });

  it("names write-offs in the store's own words, and an unknown code as it is", async () => {
    render(<CafeAnalyticsPage />);
    await waitFor(() => expect(screen.getByTestId('cafe-writeoff-total')).toHaveTextContent('150.00'));
    expect(screen.getByTestId('cafe-writeoff-spoiled')).toHaveTextContent('Зіпсувалося');
    // The session's vertical does not carry `staff`; showing the raw code is
    // the honest answer, folding it into «Інше» is not.
    expect(screen.getByTestId('cafe-writeoff-staff')).toHaveTextContent('staff');
  });

  it('has no room block in a café with no bills, and one when there are', async () => {
    render(<CafeAnalyticsPage />);
    await waitFor(() => expect(screen.getByTestId('cafe-analytics')).toBeInTheDocument());
    // Absent, not zero: «оборотність столу: 0» reads as a bad month rather
    // than as a question that is not about a counter-service café.
    expect(screen.queryByTestId('cafe-tables')).toBeNull();

    getCafeAnalytics.mockResolvedValue(
      analytics({
        tables: {
          bills: 40,
          guests: 96,
          revenue_cents: 1_200_000,
          avg_bill_cents: 30_000,
          avg_per_guest_cents: 12_500,
          turns_per_table_per_day: 2.4,
          avg_minutes: 95,
        },
      })
    );
    await userEvent.click(screen.getByTestId('range-7'));
    await waitFor(() => expect(screen.getByTestId('cafe-tables')).toBeInTheDocument());
    expect(screen.getByTestId('cafe-tables')).toHaveTextContent('300.00');
    expect(screen.getByTestId('cafe-tables')).toHaveTextContent('2,4');
    expect(screen.getByTestId('cafe-tables')).toHaveTextContent('1 год 35 хв');
  });

  it("says the server's 409 in words rather than drawing an empty screen", async () => {
    // Unlike the panels, which render nothing: this page is where a store that
    // is not a café finds out why there is nothing to show.
    getCafeAnalytics.mockRejectedValue({ response: { data: { error: 'not_a_cafe' } } });
    render(<CafeAnalyticsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('cafe-analytics-error')).toHaveTextContent('не кафе')
    );
  });
});
