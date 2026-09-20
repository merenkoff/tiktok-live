// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PriceTagsDialog } from './PriceTagsDialog';
import type { Product } from '@pos/platform';

function product(over: Partial<Product['variants'][number]> = {}): Product {
  return {
    id: 1,
    name: 'Піжама',
    kind: 'simple',
    stock_mode: 'own',
    one_off: false,
    sellable: true,
    image_url: null,
    needs_review: false,
    tags: [],
    modifier_groups: [],
    variants: [
      {
        id: 10,
        product_id: 1,
        label: 'Рожевий · 98/104',
        attributes: {},
        unit: 'шт',
        price_cents: 45000,
        compare_at_cents: null,
        cost_cents: null,
        sku: '068-130',
        barcode: '4820270362877',
        quantity: 2,
        is_active: true,
        components: [],
        ...over,
      },
    ],
  } as unknown as Product;
}

function open(over: Partial<Product['variants'][number]> = {}) {
  return render(
    <div data-testid="page">
      <PriceTagsDialog
        products={[product(over)]}
        storeName="Demo Boutique"
        onClose={vi.fn()}
        onBarcodeGenerated={vi.fn()}
      />
    </div>
  );
}

describe('where the dialog opens', () => {
  it('hangs off the body, not off the product list', () => {
    // The bug this covers: a page wrapper whose `animate-fade-up` had finished
    // still carried a transform, and a transformed ancestor is the containing
    // block for `position: fixed`. The overlay therefore centred itself on the
    // list — on a long catalogue, a screen or two below the fold. Rendering
    // into `document.body` puts it back on the window whatever a page above it
    // is doing.
    const { getByTestId } = open();
    // By test id, not by the utility classes the overlay happens to wear:
    // `check-module-css-coverage.mjs` reads the module's source as text, and
    // `.fixed.inset-0.z-50` reads to it as a class `inset-0.z-50` that no CSS
    // can contain — it turned the release gate for `products` red.
    const overlay = getByTestId('price-tags-overlay');
    expect(getByTestId('page').contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
  });
});

describe('what the dialog says about a barcode', () => {
  it('shows a usable code as it is', () => {
    open();
    expect(screen.getByText('4820270362877')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Згенерувати' })).toBeNull();
  });

  it('calls out a code whose check digit is wrong instead of printing it', () => {
    // Thirteen digits, so it used to print a symbol nothing could read. The
    // shop's conclusion was "the scanner is broken", which is the expensive
    // way to find out.
    open({ barcode: '4820270362870' });
    expect(screen.getByText(/хибною контрольною цифрою/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Згенерувати' })).toBeInTheDocument();
  });

  it('treats an article number in the barcode column as no barcode at all', () => {
    open({ barcode: '068-130' });
    expect(screen.getByText(/Без придатного штрихкоду: 1/)).toBeInTheDocument();
    expect(screen.queryByText(/хибною контрольною цифрою/)).toBeNull();
  });
});

describe('the roll', () => {
  it('shows how wide a tag will come out', () => {
    open();
    expect(screen.getByText('Ширина цінника: 43.5 мм')).toBeInTheDocument();
  });
});
