// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Матрицею» on the receiving page (clothing S1): where the button is, how the
// grid's lines land in the document, what the document sends — a stub on a
// card carries `product_id` — and how the confirm counts cards, not lines.

import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { OnHandRow, Product, VerticalPublicConfig } from '../../../types';

const clothing: VerticalPublicConfig = {
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
const flowers: VerticalPublicConfig = {
  id: 'flowers',
  title: 'Квіти',
  attributes: [{ key: 'color', label: 'Колір', type: 'text', inLabel: true }],
  units: ['шт'],
  defaultUnit: 'шт',
};
let vertical = clothing;

const api = {
  stockOnHand: vi.fn(),
  listSuppliers: vi.fn(),
  getProducts: vi.fn(),
  createStockDocument: vi.fn(),
  addStockDocumentLine: vi.fn(),
  addStockDocumentPlaceholderLine: vi.fn(),
  postStockDocument: vi.fn(),
  generateInternalBarcode: vi.fn(),
};

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, useVertical: () => vertical, api };
});

const { StockActionPage } = await import('./StockActionPage');

const onHand: OnHandRow = {
  variant_id: 10,
  product_id: 1,
  product_name: 'Боді',
  label: 'Синій · 86',
  unit: 'шт',
  sku: null,
  barcode: null,
  quantity: 3,
  cost_cents: 15000,
  price_cents: 39000,
} as OnHandRow;

const body: Product = {
  id: 1,
  name: 'Боді',
  description: null,
  image_url: null,
  is_active: true,
  tag_ids: [],
  variants: [
    {
      id: 10,
      product_id: 1,
      attributes: { color: 'Синій', size: '86' },
      label: 'Синій · 86',
      unit: 'шт',
      sku: null,
      barcode: null,
      price_cents: 39000,
      cost_cents: 15000,
      compare_at_cents: null,
      is_active: true,
      quantity: 3,
    },
  ],
};

function renderReceipt(type: 'receipt' | 'writeoff' = 'receipt') {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/stock/:type" element={<StockActionPage type={type} />} />
      <Route path="/admin/stock/documents/:id" element={<div>DOCUMENT PAGE</div>} />
    </Routes>,
    { route: `/admin/stock/${type}` }
  );
}

beforeEach(() => {
  vertical = clothing;
  for (const fn of Object.values(api)) fn.mockReset();
  api.stockOnHand.mockResolvedValue([onHand]);
  api.listSuppliers.mockResolvedValue([]);
  api.getProducts.mockResolvedValue([body]);
  api.createStockDocument.mockResolvedValue({ id: 77 });
  api.addStockDocumentLine.mockResolvedValue({});
  api.addStockDocumentPlaceholderLine.mockResolvedValue({});
  api.postStockDocument.mockResolvedValue({ id: 77 });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StockActionPage — «Матрицею»', () => {
  it('is offered on a receipt in a store whose vertical has colour and size, and nowhere else', async () => {
    const { unmount } = renderReceipt();
    expect(await screen.findByRole('button', { name: 'Матрицею' })).toBeInTheDocument();
    unmount();

    renderReceipt('writeoff');
    await screen.findByText(/Списання/);
    expect(screen.queryByRole('button', { name: 'Матрицею' })).toBeNull();
  });

  it('is not offered where the vertical has no size axis', async () => {
    vertical = flowers;
    renderReceipt();
    await screen.findByText('Прихід товару');
    await waitFor(() => expect(api.stockOnHand).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Матрицею' })).toBeNull();
  });

  it('puts the grid’s lines into the document and sends a stub on the card with its product_id', async () => {
    const user = userEvent.setup();
    renderReceipt();
    await user.click(await screen.findByRole('button', { name: 'Матрицею' }));
    const picker = await screen.findByRole('dialog', { name: 'Прихід матрицею' });
    await user.type(within(picker).getByLabelText('Назва товару'), 'бод');
    await user.click(await within(picker).findByRole('button', { name: /Боді/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Боді' });
    await user.type(within(dialog).getByLabelText('К-сть: Синій · 86'), '2');
    await user.type(within(dialog).getByLabelText('Свій розмір'), '98{Enter}');
    await user.type(within(dialog).getByLabelText('К-сть: Синій · 98'), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Додати в прихід' }));

    // The dialog is gone and both lines are on the page: the existing size as
    // an ordinary row, the new one as a stub that names the card.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The grid's own submit must not reach the page's form: nothing was posted
    // and no «add a product first» complaint appeared.
    expect(api.createStockDocument).not.toHaveBeenCalled();
    expect(screen.queryByText(/Додайте хоча б один товар/)).toBeNull();
    expect(screen.getByText('Боді Синій · 86')).toBeInTheDocument();
    expect(screen.getByText('Новий розмір')).toBeInTheDocument();
    expect(screen.getByText('Додасться до картки при проведенні')).toBeInTheDocument();
    expect(screen.getByText(/нових розмірів: 1/)).toBeInTheDocument();
    expect(screen.queryByText(/нових товарів/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(api.postStockDocument).toHaveBeenCalledWith(77, expect.any(String)));
    expect(api.createStockDocument).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledWith('Буде створено 1 новий розмір на наявних картках у каталозі. Продовжити?');
    expect(api.addStockDocumentLine).toHaveBeenCalledWith(77, { variant_id: 10, quantity: 2, unit_cost_cents: 15000 });
    expect(api.addStockDocumentPlaceholderLine).toHaveBeenCalledWith(77, {
      name: 'Боді',
      quantity: 1,
      price_cents: 39000,
      unit_cost_cents: null,
      attributes: { color: 'Синій', size: '98' },
      unit: 'шт',
      sku: null,
      barcode: null,
      product_id: 1,
    });
    expect(await screen.findByText('DOCUMENT PAGE')).toBeInTheDocument();
  });

  it('adds a second count of the same size to the row it already has, rather than a twin', async () => {
    const user = userEvent.setup();
    renderReceipt();
    for (let round = 0; round < 2; round++) {
      await user.click(await screen.findByRole('button', { name: 'Матрицею' }));
      const picker = await screen.findByRole('dialog', { name: 'Прихід матрицею' });
      await user.type(within(picker).getByLabelText('Назва товару'), 'бод');
      await user.click(await within(picker).findByRole('button', { name: /Боді/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Боді' });
      await user.type(within(dialog).getByLabelText('К-сть: Синій · 86'), '2');
      await user.click(within(dialog).getByRole('button', { name: 'Додати в прихід' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(screen.getAllByText('Боді Синій · 86')).toHaveLength(1);
    expect(screen.getByLabelText(/К-сть/)).toHaveValue(4);
  });
});
