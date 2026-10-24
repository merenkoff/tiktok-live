// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Рух за період» and goods given «під запис» (migration 073): their own
// column, but only in a shop that has any — and none at all from a server
// older than the column.

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { MovementSummaryRow } from '../../../types';

const stockMovementSummary = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      stockMovementSummary: (...a: unknown[]) => stockMovementSummary(...a),
    },
  };
});

const { StockMovementPage } = await import('./StockMovementPage');

function row(over: Partial<MovementSummaryRow> = {}): MovementSummaryRow {
  return {
    variant_id: 1,
    product_name: 'Хліб',
    label: '',
    unit: 'шт',
    opening: 20,
    receipt: 0,
    sale: -5,
    writeoff: 0,
    adjust: 0,
    inventory: 0,
    refund: 0,
    void: 0,
    closing: 15,
    ...over,
  };
}

describe('StockMovementPage', () => {
  beforeEach(() => stockMovementSummary.mockReset());

  it('shows what left «під запис» in its own column', async () => {
    stockMovementSummary.mockResolvedValue([row({ credit: -3, closing: 12 })]);
    renderWithProviders(<StockMovementPage />);
    expect(await screen.findByRole('columnheader', { name: 'Під запис' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '-3' })).toBeInTheDocument();
  });

  it('leaves the column out where nothing was given on credit, or the server does not say', async () => {
    stockMovementSummary.mockResolvedValue([row({ credit: 0 }), row({ variant_id: 2, product_name: 'Молоко' })]);
    renderWithProviders(<StockMovementPage />);
    expect(await screen.findByText('Молоко')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Під запис' })).not.toBeInTheDocument();
  });
});
