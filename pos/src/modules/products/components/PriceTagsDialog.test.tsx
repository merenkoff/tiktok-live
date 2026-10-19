// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriceTagsDialog } from './PriceTagsDialog';
import type { Product } from '@pos/platform';

// The OS print dialog is the one thing a test cannot open; what matters is
// what the print area holds when it would have.
vi.mock('../../../lib/triggerPrint', () => ({ triggerPrint: vi.fn() }));

afterEach(() => localStorage.clear());

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

describe('how many copies', () => {
  function copiesOf(label: RegExp | string): number {
    return Number((screen.getByRole('spinbutton', { name: label }) as HTMLInputElement).value);
  }

  it('starts from the stock on hand — one tag per unit on the shelf', () => {
    open({ quantity: 2 });
    expect(copiesOf(/Цінників: Піжама/)).toBe(2);
    expect(screen.getByText(/Кількість — за залишком на складі/)).toBeInTheDocument();
  });

  it('from a receiving document, starts from what was RECEIVED, and names the document', () => {
    // The bug this covers (clothing L4): topping up two sizes used to print a
    // tag for every unit on the rail.
    render(
      <PriceTagsDialog
        products={[product({ quantity: 12 })]}
        storeName="Demo Boutique"
        received={{ docNumber: 'ПР-000012', byVariant: new Map([[10, 3]]) }}
        onClose={vi.fn()}
        onBarcodeGenerated={vi.fn()}
      />
    );
    expect(copiesOf(/Цінників: Піжама/)).toBe(3);
    expect(screen.getByText(/за приходом ПР-000012/)).toBeInTheDocument();
    expect(screen.getByText('Усього цінників: 3')).toBeInTheDocument();
  });

  it('from a receiving document, prints only the variants it brought — an archived one included, a weighed one once', () => {
    const p = product();
    p.variants = [
      { ...p.variants[0], id: 10, label: 'Рожевий · 98/104', quantity: 12, is_active: true },
      { ...p.variants[0], id: 11, label: 'Рожевий · 110', quantity: 4, is_active: true },
      // Archived after it was received: the goods still hang on the rail.
      { ...p.variants[0], id: 12, label: 'Рожевий · 116', quantity: 0, is_active: false },
      { ...p.variants[0], id: 13, label: 'Стрічка', unit: 'м', quantity: 50, is_active: true },
    ];
    render(
      <PriceTagsDialog
        products={[p]}
        storeName="Demo Boutique"
        received={{
          docNumber: 'ПР-000013',
          byVariant: new Map([
            [10, 5],
            [12, 2],
            [13, 30],
          ]),
        }}
        onClose={vi.fn()}
        onBarcodeGenerated={vi.fn()}
      />
    );
    expect(copiesOf('Цінників: Піжама · Рожевий · 98/104')).toBe(5);
    expect(screen.queryByRole('spinbutton', { name: 'Цінників: Піжама · Рожевий · 110' })).toBeNull();
    expect(copiesOf('Цінників: Піжама · Рожевий · 116')).toBe(2);
    expect(copiesOf('Цінників: Піжама · Стрічка')).toBe(1);
    expect(screen.getByText('Усього цінників: 8')).toBeInTheDocument();
  });
});

describe('a marked-down item', () => {
  it('says what it used to cost under the price, so the owner knows the tag will carry it', () => {
    open({ compare_at_cents: 59000 });
    expect(screen.getByText(/^було 590,00/)).toBeInTheDocument();
  });

  it('says nothing of the kind when there is no markdown', () => {
    open();
    expect(screen.queryByText(/^було/)).toBeNull();
  });
});

describe('labels', () => {
  function printed(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.price-tag-print-area .price-label')];
  }

  function toLabels() {
    fireEvent.click(screen.getByRole('button', { name: 'Наліпки' }));
  }

  it('switches from the roll to labels, says which paper to choose and remembers it', () => {
    open();
    expect(screen.queryByTestId('label-preview')).toBeNull();
    toLabels();
    expect(screen.getByTestId('label-preview')).toBeInTheDocument();
    expect(screen.getByText(/папір 58 × 40 мм/)).toBeInTheDocument();
    expect(screen.queryByText(/Ширина цінника/)).toBeNull();
    expect(JSON.parse(localStorage.getItem('pos.priceTagMedia')!).kind).toBe('label');
  });

  it('opens on labels at a station that chose them last time', () => {
    localStorage.setItem(
      'pos.priceTagMedia',
      JSON.stringify({ kind: 'label', paper: 58, label: { widthMm: 43, heightMm: 25, rotate: 90 } })
    );
    open();
    expect(screen.getByText(/Наліпка 43 × 25 мм, поворот 90°/)).toBeInTheDocument();
    // Set once, so folded away: the list is what the dialog was opened for.
    expect(screen.queryByTestId('label-preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Змінити' }));
    expect(screen.getByTestId('label-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByTestId('label-preview')).toBeNull();
  });

  it('takes a size from the presets, a typed one, or the two swapped', () => {
    open();
    toLabels();
    fireEvent.click(screen.getByRole('button', { name: '40×30' }));
    expect(screen.getByText('Наліпка 40 × 30 мм')).toBeInTheDocument();

    const width = screen.getByRole('textbox', { name: 'Ширина наліпки, мм' });
    // On the way to «45» the box holds «4» — which must not snap to the floor.
    fireEvent.change(width, { target: { value: '4' } });
    expect(width).toHaveValue('4');
    fireEvent.change(width, { target: { value: '45' } });
    expect(screen.getByText('Наліпка 45 × 30 мм')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Поміняти ширину й висоту' }));
    expect(screen.getByText('Наліпка 30 × 45 мм')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Висота наліпки, мм' })).toHaveValue('45');
  });

  it('pulls a size typed out of range back in when the box is left', () => {
    open();
    toLabels();
    const height = screen.getByRole('textbox', { name: 'Висота наліпки, мм' });
    fireEvent.change(height, { target: { value: '5' } });
    fireEvent.blur(height);
    expect(height).toHaveValue('15');
    expect(screen.getByText('Наліпка 58 × 15 мм')).toBeInTheDocument();
  });

  it('turns the text in the preview exactly as it will be printed', () => {
    open();
    toLabels();
    fireEvent.click(screen.getByRole('button', { name: '90°' }));
    const body = within(screen.getByTestId('label-preview')).getByText('Піжама').closest<HTMLElement>(
      '.price-label-body'
    )!;
    expect(body.style.transform).toBe('translateX(58mm) rotate(90deg)');
    expect(screen.getByText(/поворот 90°/)).toBeInTheDocument();
  });

  it('warns when the label is too narrow for a barcode a scanner will take', () => {
    open();
    toLabels();
    const width = screen.getByRole('textbox', { name: 'Ширина наліпки, мм' });
    fireEvent.change(width, { target: { value: '25' } });
    expect(screen.getByText(/Штрихкод на наліпці такої ширини/)).toBeInTheDocument();
  });

  it('prints one label as a test, and every copy when asked for all', async () => {
    open({ quantity: 2 });
    toLabels();
    fireEvent.click(screen.getByRole('button', { name: /Пробний друк/ }));
    await act(async () => {});
    expect(printed()).toHaveLength(1);
    expect(printed()[0]!.style.width).toBe('58mm');

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(printed()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Друкувати 2' }));
    await act(async () => {});
    expect(printed()).toHaveLength(2);
  });

  it('still prints on the roll when the roll is chosen', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Друкувати 2' }));
    await act(async () => {});
    expect(printed()).toHaveLength(0);
    expect(document.querySelectorAll('.price-tag-print-area .price-tag')).toHaveLength(2);
  });
});
