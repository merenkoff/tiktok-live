// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Техкарти» — what a composite costs to assemble and what share of its price
// that is (café phase К5d).
//
// The one rule pinned here above all: a dish whose cost cannot be told
// honestly shows «—» AND the reason, never 0 %. Zero per cent on this screen
// is not a rounding error — it is a number the owner would reprice the menu on.

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { TechCardRow } from '../data/techCardsApi';

const posRequest = vi.fn<[], Promise<TechCardRow[]>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: () => posRequest() } };
});

const { TechCardsPage } = await import('./TechCardsPage');

function card(overrides: Partial<TechCardRow> = {}): TechCardRow {
  return {
    variant_id: 1,
    product_id: 10,
    product_name: 'Борщ',
    label: '',
    unit: 'шт',
    kind: 'composite',
    stock_mode: 'derived',
    price_cents: 20000,
    cost_cents: 6100,
    leaf_count: 2,
    has_unpriced_leaf: false,
    food_cost_bps: 3050,
    ...overrides,
  };
}

const rowsOf = () => screen.getAllByRole('row').slice(1); // drop the header

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TechCardsPage', () => {
  it('says out loud which prices the cost is built from', async () => {
    posRequest.mockResolvedValue([card()]);
    renderWithProviders(<TechCardsPage />);
    expect(
      await screen.findByText(/за останніми цінами закупівлі/)
    ).toBeInTheDocument();
  });

  it('draws the percentage the server computed', async () => {
    posRequest.mockResolvedValue([card()]);
    renderWithProviders(<TechCardsPage />);
    expect(await screen.findByText('30,5 %')).toBeInTheDocument();
    expect(screen.getByText('61,00 ₴')).toBeInTheDocument();
  });

  it('sorts worst first and sends the unknowns to the end', async () => {
    posRequest.mockResolvedValue([
      card({ variant_id: 1, product_name: 'Дешева', food_cost_bps: 1500 }),
      card({ variant_id: 2, product_name: 'Невідома', food_cost_bps: null, leaf_count: 0 }),
      card({ variant_id: 3, product_name: 'Ненажерлива', food_cost_bps: 8000 }),
    ]);
    renderWithProviders(<TechCardsPage />);
    await screen.findByText('Ненажерлива');

    const names = rowsOf().map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names?.[0]).toContain('Ненажерлива');
    expect(names?.[1]).toContain('Дешева');
    expect(names?.[2]).toContain('Невідома');
  });

  it('shows «—» with a named reason instead of 0 %', async () => {
    posRequest.mockResolvedValue([
      card({ food_cost_bps: null, has_unpriced_leaf: true, cost_cents: 100 }),
    ]);
    renderWithProviders(<TechCardsPage />);
    expect(
      await screen.findByText(/не вистачає собівартості складника/)
    ).toBeInTheDocument();
    expect(screen.queryByText('0,0 %')).not.toBeInTheDocument();
  });

  it('takes the owner to the card that needs fixing', async () => {
    posRequest.mockResolvedValue([card({ product_id: 42 })]);
    renderWithProviders(<TechCardsPage />);
    const link = await screen.findByRole('link', { name: 'Борщ' });
    expect(link).toHaveAttribute('href', '/admin/products?edit=42');
  });

  // A clothing shop sees this item in the sidebar too — it CAN make a product
  // composite — so the empty state has to be an answer, not a blank table.
  it('explains itself to a shop with no composites', async () => {
    posRequest.mockResolvedValue([]);
    renderWithProviders(<TechCardsPage />);
    expect(
      await screen.findByText(/ще немає складених товарів/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says so when the list cannot be read', async () => {
    posRequest.mockRejectedValue(new Error('boom'));
    renderWithProviders(<TechCardsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('tech-cards-error')).toBeInTheDocument()
    );
  });
});
