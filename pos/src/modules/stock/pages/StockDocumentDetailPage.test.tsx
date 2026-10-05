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
