// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The receiving and write-off pages for goods sold by weight (migration 075):
// the clerk reads «20,5 кг» on the delivery note and types it, prices per
// kilogram, and the document still gets grams and a cost per gram — the one
// contract the server has always had.

import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { OnHandRow, VerticalPublicConfig } from '../../../types';

const grocery: VerticalPublicConfig = {
  id: 'grocery',
  title: 'Продукти',
  attributes: [{ key: 'variety', label: 'Сорт', type: 'text', inLabel: true }],
  units: ['шт', 'г', 'мл'],
  weighedUnits: ['г', 'мл'],
  defaultUnit: 'шт',
};

const api = {
  stockOnHand: vi.fn(),
  listSuppliers: vi.fn(),
  createStockDocument: vi.fn(),
  addStockDocumentLine: vi.fn(),
  addStockDocumentPlaceholderLine: vi.fn(),
  postStockDocument: vi.fn(),
};

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, useVertical: () => grocery, api };
});

const { StockActionPage } = await import('./StockActionPage');

const potatoes: OnHandRow = {
  variant_id: 21,
  product_id: 5,
  product_name: 'Картопля',
  label: '',
  unit: 'г',
  sku: null,
  barcode: null,
  quantity: 12500,
  cost_cents: 1,
  price_cents: 2490,
  price_per: 1000,
};

const bread: OnHandRow = {
  variant_id: 22,
  product_id: 6,
  product_name: 'Хліб',
  label: '',
  unit: 'шт',
  sku: null,
  barcode: null,
  quantity: 14,
  cost_cents: 2800,
  price_cents: 4590,
  price_per: 1,
};

function renderPage(type: 'receipt' | 'writeoff') {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/stock/:type" element={<StockActionPage type={type} />} />
      <Route path="/admin/stock/documents/:id" element={<div>DOCUMENT PAGE</div>} />
    </Routes>,
    { route: `/admin/stock/${type}` }
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.stockOnHand.mockResolvedValue([potatoes, bread]);
  api.listSuppliers.mockResolvedValue([]);
  api.createStockDocument.mockResolvedValue({ id: 91 });
  api.addStockDocumentLine.mockResolvedValue({});
  api.addStockDocumentPlaceholderLine.mockResolvedValue({});
  api.postStockDocument.mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('receiving goods sold by weight', () => {
  it('lists what is on the shelf in kilograms, and pieces as pieces', async () => {
    renderPage('receipt');
    expect(await screen.findByRole('button', { name: /Картопля.*12,500 кг/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Хліб.*14 шт/ })).toBeInTheDocument();
  });

  it('takes kilograms and a price per kilogram, and sends grams and a price per gram', async () => {
    renderPage('receipt');
    await userEvent.click(await screen.findByRole('button', { name: /Картопля/ }));

    // A new line is one kilogram, not one gram — in a text box, so a comma survives.
    const qty = screen.getByRole('textbox', { name: 'К-сть, кг' });
    expect(qty).toHaveValue('1');
    expect(screen.getByText('Зараз на складі: 12,500 кг')).toBeInTheDocument();
    await userEvent.clear(qty);
    await userEvent.type(qty, '20,5');
    // The box keeps what was typed, comma and all.
    expect(qty).toHaveValue('20,5');

    const cost = screen.getByRole('textbox', { name: 'Закупка за кг ₴' });
    // 1 kopeck a gram on the variant is 10 ₴ a kilogram.
    expect(cost).toHaveValue('10.00');
    fireEvent.change(cost, { target: { value: '14,50' } });
    // 14,50 ₴ a kilogram is 1.45 kopecks a gram: the document will hold 1.
    expect(screen.getByTestId('stock-cost-step')).toHaveTextContent(/запишеться 10,00 ₴ за кг/);
    expect(screen.getByText(/Сума закупки: 297,25 ₴ · запишеться 205,00 ₴/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(api.addStockDocumentLine).toHaveBeenCalled());
    expect(api.addStockDocumentLine.mock.calls[0]).toEqual([
      91,
      { variant_id: 21, quantity: 20500, unit_cost_cents: 1 },
    ]);
  });

  it('says nothing about a step when the price per kilogram is a whole 10 ₴', async () => {
    renderPage('receipt');
    await userEvent.click(await screen.findByRole('button', { name: /Картопля/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Закупка за кг ₴' }), { target: { value: '120' } });
    expect(screen.queryByTestId('stock-cost-step')).not.toBeInTheDocument();
    expect(screen.getByText(/Сума закупки: 120,00 ₴/)).not.toHaveTextContent('запишеться');
  });

  it('keeps a piece-goods row exactly as it was', async () => {
    renderPage('receipt');
    await userEvent.click(await screen.findByRole('button', { name: /Хліб/ }));
    expect(screen.getByRole('spinbutton', { name: 'К-сть' })).toHaveValue(1);
    expect(screen.getByRole('textbox', { name: 'Закупка за шт ₴' })).toHaveValue('28.00');
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(api.addStockDocumentLine).toHaveBeenCalled());
    expect(api.addStockDocumentLine.mock.calls[0][1]).toEqual({ variant_id: 22, quantity: 1, unit_cost_cents: 2800 });
  });

  it('creates a new product sold by weight from kilograms and a price per kilogram', async () => {
    renderPage('receipt');
    await screen.findByRole('button', { name: /Картопля/ });
    await userEvent.type(screen.getByPlaceholderText(/Пошук назви/), 'Цибуля');
    await userEvent.click(await screen.findByRole('button', { name: /Створити новий товар/ }));

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Одиниця/ }), 'г');
    const stubQty = screen.getByRole('textbox', { name: 'Кількість, кг *' });
    await userEvent.clear(stubQty);
    await userEvent.type(stubQty, '15,25');
    fireEvent.change(screen.getByRole('textbox', { name: 'Ціна продажу за 1 кг *' }), { target: { value: '29,90' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Закупка за 1 кг' }), { target: { value: '18' } });
    await userEvent.click(screen.getByRole('button', { name: 'Додати в прихід' }));

    expect(screen.getByRole('textbox', { name: 'К-сть, кг' })).toHaveValue('15,25');
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(api.addStockDocumentPlaceholderLine).toHaveBeenCalled());
    expect(api.addStockDocumentPlaceholderLine.mock.calls[0][1]).toMatchObject({
      name: 'Цибуля',
      unit: 'г',
      quantity: 15250,
      // The new variant's price is per kilogram from its first save…
      price_cents: 2990,
      // …and its cost per gram: 18 ₴ a kilogram is 1.8 kopecks, kept as 2.
      unit_cost_cents: 2,
    });
  });
});

describe('writing off goods sold by weight', () => {
  it('refuses more than is on the shelf, in kilograms', async () => {
    renderPage('writeoff');
    await userEvent.click(await screen.findByRole('button', { name: /Картопля/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'К-сть, кг' }), { target: { value: '13' } });
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    expect(await screen.findByText('На складі лише 12,500 кг: Картопля')).toBeInTheDocument();
    expect(api.createStockDocument).not.toHaveBeenCalled();
  });

  it('refuses a weight finer than a gram', async () => {
    renderPage('writeoff');
    await userEvent.click(await screen.findByRole('button', { name: /Картопля/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'К-сть, кг' }), { target: { value: '0,2345' } });
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    expect(await screen.findByText(/з точністю до грама/)).toBeInTheDocument();
    expect(api.createStockDocument).not.toHaveBeenCalled();
  });

  it('writes off grams for what was typed in kilograms', async () => {
    renderPage('writeoff');
    await userEvent.click(await screen.findByRole('button', { name: /Картопля/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'К-сть, кг' }), { target: { value: '0.35' } });
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(api.addStockDocumentLine).toHaveBeenCalled());
    expect(api.addStockDocumentLine.mock.calls[0][1]).toEqual({ variant_id: 21, quantity: 350, unit_cost_cents: null });
  });
});
