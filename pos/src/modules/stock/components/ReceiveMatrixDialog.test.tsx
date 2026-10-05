// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Receiving by matrix (clothing S1): a card the shop has opens with its own
// colours and sizes on the grid, a count on an existing size is a line and on
// a new one a stub on that card; a new name is a new card and every cell a
// stub; the price is asked only for what the card does not have.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, VerticalPublicConfig } from '../../../types';

const getProducts = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { getProducts: () => getProducts() } };
});

const { ReceiveMatrixDialog } = await import('./ReceiveMatrixDialog');

const vertical: VerticalPublicConfig = {
  id: 'clothing',
  title: 'Одяг',
  attributes: [
    { key: 'color', label: 'Колір', type: 'text', inLabel: true },
    { key: 'size', label: 'Розмір', type: 'text', inLabel: true },
  ],
  units: ['шт'],
  defaultUnit: 'шт',
  autoBarcode: true,
};

function variant(id: number, color: string, size: string, quantity: number): Product['variants'][number] {
  return {
    id,
    product_id: 1,
    attributes: { color, size },
    label: `${color} · ${size}`,
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 39000,
    cost_cents: 15000,
    compare_at_cents: null,
    is_active: true,
    quantity,
  };
}

const body: Product = {
  id: 1,
  name: 'Боді',
  description: null,
  image_url: null,
  is_active: true,
  tag_ids: [],
  variants: [variant(10, 'Синій', '86', 3), variant(11, 'Синій', '92', 0)],
};

beforeEach(() => {
  getProducts.mockReset().mockResolvedValue([body]);
  try {
    localStorage.clear();
  } catch {
    /* nothing to clear */
  }
});

function open() {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(<ReceiveMatrixDialog vertical={vertical} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose };
}

describe('ReceiveMatrixDialog', () => {
  it('a card the shop has: its sizes are on the grid, an existing size is a line, a new one a stub on the card', async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await user.type(await screen.findByLabelText('Назва товару'), 'бод');
    await user.click(await screen.findByRole('button', { name: /Боді/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Боді' });
    // Its own colour and sizes, seeded; the baby-height scale was detected from them.
    expect(within(dialog).getByRole('button', { name: 'Прибрати колір Синій' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '86' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: '92' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: '80' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByLabelText('К-сть: Синій · 86')).toHaveAttribute('placeholder', 'є 3');

    // A size the card does not have: typed in, it becomes a «+ новий» cell.
    await user.type(within(dialog).getByLabelText('Свій розмір'), '98{Enter}');
    expect(within(dialog).getByLabelText('К-сть: Синій · 98')).toHaveAttribute('placeholder', '+ новий');
    // The card's usual price is offered for it.
    expect(within(dialog).getByLabelText('Ціна продажу, грн')).toHaveValue('390');

    await user.type(within(dialog).getByLabelText('К-сть: Синій · 86'), '2');
    await user.type(within(dialog).getByLabelText('К-сть: Синій · 98'), '1');
    expect(within(dialog).getByTestId('receive-matrix-summary').textContent).toBe('До документа: 3 шт · нових розмірів: 1');
    await user.click(within(dialog).getByRole('button', { name: 'Додати в прихід' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const result = onAdd.mock.calls[0][0];
    expect(result.existing).toEqual([{ variant: body.variants[0], quantity: 2, label: 'Боді Синій · 86' }]);
    expect(result.placeholders).toEqual([
      { name: 'Боді', attributes: { color: 'Синій', size: '98' }, quantity: 1, price_cents: 39000, product_id: 1, unit: 'шт' },
    ]);
  });

  it('a new name: an empty grid, every counted cell a stub, and no stub without a price', async () => {
    const user = userEvent.setup();
    const { onAdd } = open();
    await user.type(await screen.findByLabelText('Назва товару'), 'Світшот');
    await user.click(screen.getByRole('button', { name: 'Новий товар «Світшот»' }));

    const dialog = await screen.findByRole('dialog', { name: 'Новий товар «Світшот»' });
    await user.type(within(dialog).getByLabelText('Новий колір'), 'Сірий{Enter}');
    await user.click(within(dialog).getByRole('button', { name: '86' }));
    await user.type(within(dialog).getByLabelText('К-сть: Сірий · 86'), '4');

    await user.click(within(dialog).getByRole('button', { name: 'Додати в прихід' }));
    expect(within(dialog).getByRole('status').textContent).toBe('Вкажіть ціну продажу');
    expect(onAdd).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Ціна продажу, грн'), '500');
    await user.type(within(dialog).getByLabelText('Закупівельна ціна, грн'), '210');
    await user.click(within(dialog).getByRole('button', { name: 'Додати в прихід' }));
    expect(onAdd.mock.calls[0][0].placeholders).toEqual([
      { name: 'Світшот', attributes: { color: 'Сірий', size: '86' }, quantity: 4, price_cents: 50000, unit_cost_cents: 21000, unit: 'шт' },
    ]);
    expect(onAdd.mock.calls[0][0].existing).toEqual([]);
  });

  it('says so when the cards could not be loaded, and still offers a new product', async () => {
    const user = userEvent.setup();
    getProducts.mockRejectedValue(new Error('boom'));
    open();
    await waitFor(() => expect(screen.getByText(/Картки не завантажились/)).toBeInTheDocument());
    await user.type(screen.getByLabelText('Назва товару'), 'Шапка');
    expect(screen.getByRole('button', { name: 'Новий товар «Шапка»' })).toBeInTheDocument();
  });

  it('«Назад» returns to the name without adding anything', async () => {
    const user = userEvent.setup();
    const { onAdd, onClose } = open();
    await user.type(await screen.findByLabelText('Назва товару'), 'бод');
    await user.click(await screen.findByRole('button', { name: /Боді/ }));
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByLabelText('Назва товару')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
