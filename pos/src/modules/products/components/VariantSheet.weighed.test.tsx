// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A weighed variant's sheet (TechDocs/grocery/G4_WEIGHED.md): the price is per
// kilogram, the unit reads «кг», and the purchase price is typed per kilogram
// while the card stores it per gram — with a step the sheet says out loud.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VerticalPublicConfig } from '@pos/platform';
import { VariantSheet } from './VariantSheet';
import type { VariantDraft } from '../lib/productDraft';

const grocery: VerticalPublicConfig = {
  id: 'clothing',
  title: 'Продукти',
  attributes: [],
  units: ['шт', 'г'],
  defaultUnit: 'шт',
  weighedUnits: ['г'],
};

const cheese: VariantDraft = {
  id: 70,
  label: 'Гауда',
  quantity: 2350,
  attributes: {},
  unit: 'г',
  price: '189.90',
  compareAtCents: null,
  // 12 kopecks a gram — what 120 ₴ a kilogram is stored as.
  cost: '0.12',
  sku: '',
  barcode: '',
  pack: { qty: '', label: '' },
  components: [],
};

function setup() {
  const onApply = vi.fn();
  render(
    <VariantSheet
      variant={cheese}
      shape=""
      vertical={grocery}
      colours={[]}
      partOptions={[]}
      onApply={onApply}
      onArchive={vi.fn()}
      onClose={vi.fn()}
    />
  );
  return { user: userEvent.setup(), onApply };
}

describe('VariantSheet for a weighed variant', () => {
  it('asks the price per kilogram, captions the unit and shows the shelf in kilograms', () => {
    setup();
    expect(screen.getByText('Ціна за 1 кг, грн')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'кг — на вагу' })).toBeInTheDocument();
    expect(screen.getByText('2,350 кг')).toBeInTheDocument();
  });

  it('reads and writes the purchase price per kilogram, stored per gram with its step', async () => {
    const { user, onApply } = setup();
    const cost = screen.getByRole('textbox', { name: /^Закупівельна ціна за 1 кг, грн/ });
    expect(cost).toHaveValue('120');

    await user.clear(cost);
    await user.type(cost, '119,90');
    // 119,90 ₴/кг is 11,99 коп/г, kept as 12 — the sheet says what will be written.
    expect(screen.getByTestId('variant-cost-step')).toHaveTextContent('запишеться як 120 ₴ за 1 кг');

    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ cost: '0.12', price: '189.90' }));
  });
});
