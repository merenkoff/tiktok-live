// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The three figures the florist sees on «Сьогодні», and — the part that keeps
// the host's dashboard safe — what the panel does when it cannot get them.

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FlowerAnalytics } from '../../../types';

const getFlowerAnalytics = vi.fn();

vi.mock('@pos/platform', () => ({
  api: { getFlowerAnalytics: (range: unknown) => getFlowerAnalytics(range) },
  formatUah: (cents: number) => `${(cents / 100).toFixed(2)} ₴`,
}));

const { default: FlowerPanels } = await import('./FlowerPanels');

function analytics(over: Partial<FlowerAnalytics> = {}): FlowerAnalytics {
  return {
    from: '2026-09-18',
    to: '2026-09-18',
    loss: {
      total_cost_cents: 42000,
      by_reason: [
        { reason: 'damaged', quantity: 14, cost_cents: 39000 },
        { reason: 'gift', quantity: 2, cost_cents: 3000 },
      ],
      top_variants: [],
    },
    stems: [],
    margin: {
      rows: [
        { kind: 'bouquet', lines: 6, revenue_cents: 180000, cost_cents: 90000, margin_cents: 90000, markup_bps: 10000 },
        { kind: 'other', lines: 9, revenue_cents: 60000, cost_cents: 40000, margin_cents: 20000, markup_bps: 5000 },
      ],
      total_revenue_cents: 240000,
      total_cost_cents: 130000,
      total_margin_cents: 110000,
      labour_bps: 3000,
    },
    daily_loss: [],
    ...over,
  };
}

function draw() {
  return render(
    <MemoryRouter>
      <FlowerPanels from="2026-09-18" to="2026-09-18" />
    </MemoryRouter>
  );
}

describe('FlowerPanels', () => {
  it('asks for exactly the window the dashboard is showing', async () => {
    getFlowerAnalytics.mockResolvedValue(analytics());
    draw();
    await waitFor(() => expect(getFlowerAnalytics).toHaveBeenCalled());
    // Not its own default range: a panel answering about a different period
    // than the figures above it is worse than no panel.
    expect(getFlowerAnalytics).toHaveBeenCalledWith({ from: '2026-09-18', to: '2026-09-18' });
  });

  it('shows what the bin cost, what bouquets brought and what survived the discounts', async () => {
    getFlowerAnalytics.mockResolvedValue(analytics());
    draw();

    await waitFor(() => expect(screen.getByTestId('panel-loss')).toHaveTextContent('420.00'));
    expect(screen.getByTestId('panel-loss')).toHaveTextContent('здебільшого: завʼяло');

    expect(screen.getByTestId('panel-bouquet-revenue')).toHaveTextContent('1800.00');
    expect(screen.getByTestId('panel-bouquet-revenue')).toHaveTextContent('75% усіх продажів');

    // §13.2: the realised markup means nothing without the rate beside it.
    expect(screen.getByTestId('panel-bouquet-markup')).toHaveTextContent('100%');
    expect(screen.getByTestId('panel-bouquet-markup')).toHaveTextContent('магазин просить 30%');
  });

  it('says «—» for a day the shop sold only loose stems', async () => {
    // Not hidden: "no bouquets today" is itself an answer, and a tile that
    // comes and goes between days is harder to read than a dash.
    getFlowerAnalytics.mockResolvedValue(
      analytics({
        margin: {
          rows: [
            { kind: 'other', lines: 4, revenue_cents: 20000, cost_cents: 12000, margin_cents: 8000, markup_bps: 6666 },
          ],
          total_revenue_cents: 20000,
          total_cost_cents: 12000,
          total_margin_cents: 8000,
          labour_bps: 3000,
        },
      })
    );
    draw();

    await waitFor(() => expect(screen.getByTestId('panel-bouquet-revenue')).toHaveTextContent('—'));
    expect(screen.getByTestId('panel-bouquet-markup')).toHaveTextContent('—');
    // The share needs a denominator it does not have here; silence beats 0%.
    expect(screen.queryByText(/усіх продажів/)).toBeNull();
  });

  it('draws nothing at all when the request fails', async () => {
    // The rule the whole slot rests on: a broken panel must not be visible on
    // the shop's main screen. `/admin/flowers` is where the failure is
    // explained in words.
    getFlowerAnalytics.mockImplementation(() => Promise.reject(new Error('network')));
    const { container } = draw();
    await waitFor(() => expect(getFlowerAnalytics).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('flower-panels')).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing for a store that does not sell flowers', async () => {
    // The server's 409. Reachable only if a store's vertical and its
    // module_remotes disagree, but that is a state, not an impossibility.
    getFlowerAnalytics.mockImplementation(() =>
      Promise.reject({ response: { data: { error: 'not_a_flower_shop' } } })
    );
    const { container } = draw();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
