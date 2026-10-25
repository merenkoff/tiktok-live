// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Price tags from a posted receipt (clothing L4): the one button that prints
// tags for what ARRIVED rather than for the whole rail, and the lines folded
// into what the dialog reads.

import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, renderWithProviders } from '../../../test/utils';
import { useAuthStore } from '../../../hooks/useAuth';
import type { StockDocument, StockDocumentLine } from '../../../types';

const getStockDocument = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      getStockDocument: (...a: unknown[]) => getStockDocument(...a),
      postStockDocument: vi.fn(),
      reverseStockDocument: vi.fn(),
    },
  };
});

const { StockDocumentDetailPage } = await import('./StockDocumentDetailPage');
const { receivedTagSources } = await import('../lib/receivedTags');

function line(over: Partial<StockDocumentLine>): StockDocumentLine {
  return {
    id: 1,
    document_id: 12,
    store_id: 1,
    variant_id: 10,
    quantity: 3,
    unit_cost_cents: 20000,
    system_qty: null,
    counted_qty: null,
    line_note: null,
    is_placeholder: false,
    product_name: 'Піжама',
    label: 'Рожевий · 98/104',
    unit: 'шт',
    product_id: 1,
    price_cents: 45000,
    compare_at_cents: null,
    sku: '068-130',
    barcode: '4820270362877',
    is_active: true,
    ...over,
  };
}

function document(over: Partial<StockDocument> = {}): StockDocument {
  return {
    id: 12,
    store_id: 1,
    type: 'receipt',
    status: 'posted',
    doc_number: 'ПР-000012',
    occurred_at: '2026-10-05T09:00:00.000Z',
    supplier_id: null,
    reason_code: null,
    note: null,
    created_by: 1,
    posted_by: 1,
    posted_at: '2026-10-05T09:01:00.000Z',
    reversed_at: null,
    reversal_of_id: null,
    created_at: '2026-10-05T09:00:00.000Z',
    updated_at: '2026-10-05T09:01:00.000Z',
    lines: [line({}), line({ id: 2, variant_id: 11, label: 'Рожевий · 110', quantity: 2, sku: '068-131', barcode: null })],
    ...over,
  };
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/stock/documents/:id" element={<StockDocumentDetailPage />} />
    </Routes>,
    { route: '/admin/stock/documents/12' }
  );
}

beforeEach(() => {
  getStockDocument.mockReset();
  useAuthStore.setState({ auth: makeAuthResponse({ store: { name: 'Evelin' } }), isAuthenticated: true });
});

describe('StockDocumentDetailPage — «Друк цінників»', () => {
  it('offers tags on a posted receipt and opens the dialog with one tag per unit received', async () => {
    const user = userEvent.setup();
    getStockDocument.mockResolvedValue(document());
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Друк цінників' }));

    const dialog = await screen.findByRole('dialog', { name: 'Друк цінників' });
    expect(within(dialog).getByText(/за приходом ПР-000012/)).toBeInTheDocument();
    expect((within(dialog).getByRole('spinbutton', { name: 'Цінників: Піжама · Рожевий · 98/104' }) as HTMLInputElement).value).toBe('3');
    expect((within(dialog).getByRole('spinbutton', { name: 'Цінників: Піжама · Рожевий · 110' }) as HTMLInputElement).value).toBe('2');
    expect(within(dialog).getByText('Усього цінників: 5')).toBeInTheDocument();
    // The sale price the tag will carry is on the line too.
    expect(screen.getAllByText(/Ціна 450,00/).length).toBeGreaterThan(0);
  });

  it.each([
    ['a draft — its stubs have no variant yet', document({ status: 'draft', lines: [line({ variant_id: null, is_placeholder: true, price_cents: null })] })],
    ['a reversal — type receipt, but of the other sign', document({ reversal_of_id: 11 })],
    ['a write-off', document({ type: 'writeoff' })],
    ['a receipt loaded without prices — nothing to put on a tag', document({ lines: [line({ price_cents: undefined })] })],
  ])('shows no button on %s', async (_what, doc) => {
    getStockDocument.mockResolvedValue(doc);
    renderPage();
    await screen.findByText('ПР-000012');
    expect(screen.queryByRole('button', { name: 'Друк цінників' })).toBeNull();
  });
});

// Groceries (migration 075): a weighed line is grams on the server and
// kilograms on the screen, its cost per gram read back per kilogram.
describe('StockDocumentDetailPage — goods sold by weight', () => {
  const potatoes = line({
    id: 5,
    variant_id: 30,
    product_name: 'Картопля',
    label: '',
    unit: 'г',
    quantity: 20500,
    unit_cost_cents: 1,
    price_cents: 2490,
    price_per: 1000,
    sku: null,
    barcode: '2900000000302',
  });

  it('reads a receipt line in kilograms, its purchase price and price per kilogram', async () => {
    getStockDocument.mockResolvedValue(document({ lines: [potatoes] }));
    renderPage();
    expect(await screen.findByText('+20,500 кг')).toBeInTheDocument();
    expect(screen.getByText(/Закупка 10,00 ₴\/кг · Ціна 24,90 ₴\/кг/)).toBeInTheDocument();
  });

  it('reads a write-off and a count the same way', async () => {
    getStockDocument.mockResolvedValue(document({ type: 'writeoff', lines: [{ ...potatoes, quantity: 350, unit_cost_cents: null }] }));
    const { unmount } = renderPage();
    expect(await screen.findByText('−0,350 кг')).toBeInTheDocument();
    unmount();

    getStockDocument.mockResolvedValue(
      document({ type: 'inventory', lines: [{ ...potatoes, quantity: 0, unit_cost_cents: null, system_qty: 12500, counted_qty: 11750 }] })
    );
    renderPage();
    expect(await screen.findByText(/Облік 12,500 кг → пораховано 11,750 кг/)).toBeInTheDocument();
  });

  it('reads a stub for a new weighed product in kilograms too, before it has a variant', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({
        store: {
          name: 'Evelin',
          vertical: {
            id: 'grocery',
            title: 'Продукти',
            attributes: [],
            units: ['шт', 'г', 'мл'],
            weighedUnits: ['г', 'мл'],
            defaultUnit: 'шт',
          },
        },
      }),
      isAuthenticated: true,
    });
    getStockDocument.mockResolvedValue(
      document({
        status: 'draft',
        lines: [
          line({
            id: 6,
            variant_id: null,
            is_placeholder: true,
            placeholder_name: 'Цибуля',
            placeholder_unit: 'г',
            product_name: 'Цибуля',
            label: '',
            unit: 'г',
            quantity: 15000,
            unit_cost_cents: 2,
            placeholder_price_cents: 2990,
            price_cents: null,
            price_per: null,
          }),
        ],
      })
    );
    renderPage();
    expect(await screen.findByText('+15,000 кг')).toBeInTheDocument();
    expect(screen.getByText(/Закупка 20,00 ₴\/кг/)).toBeInTheDocument();
    expect(screen.getByText(/Ціна продажу 29,90 ₴\/кг/)).toBeInTheDocument();
  });
});

describe('receivedTagSources', () => {
  it('folds lines into products and counts what arrived per variant, skipping stubs', () => {
    const out = receivedTagSources([
      line({}),
      line({ id: 2, variant_id: 11, label: 'Рожевий · 110', quantity: 2 }),
      line({ id: 3, variant_id: 20, product_id: 2, product_name: 'Боді', label: '86', quantity: 4, price_cents: 30000 }),
      line({ id: 4, variant_id: null, is_placeholder: true, price_cents: null, quantity: 9 }),
    ]);
    expect(out.products.map((p) => [p.name, p.variants.map((v) => v.id)])).toEqual([
      ['Піжама', [10, 11]],
      ['Боді', [20]],
    ]);
    expect([...out.byVariant]).toEqual([
      [10, 3],
      [11, 2],
      [20, 4],
    ]);
    expect(out.products[0].variants[0]).toMatchObject({
      label: 'Рожевий · 98/104',
      price_cents: 45000,
      sku: '068-130',
      barcode: '4820270362877',
      quantity: 0,
    });
  });
});
