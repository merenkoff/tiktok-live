// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A weighed line as both carts draw it (TechDocs/grocery/G4_WEIGHED.md):
// «0,350 кг × 189,90 ₴/кг» at the server's sum, the hand-typed mark under it,
// and «Змінити вагу» on the pad where a piece has − and +.

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CartLine } from '@pos/platform';
import { MobileCartSheet } from './MobileCartSheet';
import { SaleSidebar } from './SaleSidebar';
import { cartLineView } from './cartLineView';

const cheese: CartLine = {
  uid: 'weighed:1',
  variant_id: 70,
  product_name: 'Сир твердий',
  variant_label: 'Гауда',
  unit: 'г',
  unit_price_cents: 18990,
  price_per: 1000,
  quantity: 350,
  max_quantity: 999_999,
  weight_source: 'manual',
};

const bread: CartLine = {
  uid: '71',
  variant_id: 71,
  product_name: 'Хліб',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: 4590,
  quantity: 2,
  max_quantity: 10,
};

describe('cartLineView', () => {
  it('reads a weighed line as kilograms at the price per kilogram, summed by the server’s rule', () => {
    expect(cartLineView(cheese)).toEqual({
      total: 6647,
      compareTotal: null,
      caption: 'Гауда · 0,350 кг × 189,90 ₴/кг',
      weighed: true,
      manual: true,
    });
  });

  it('prices the old price of a marked-down weighing the same way', () => {
    expect(cartLineView({ ...cheese, compare_at_cents: 21990 }).compareTotal).toBe(7697);
  });

  it('leaves a piece as it was', () => {
    expect(cartLineView(bread)).toMatchObject({ total: 9180, caption: '2 × 45,90 ₴', weighed: false, manual: false });
  });
});

function sidebar(onSetQty = vi.fn()) {
  render(
    <SaleSidebar
      staffName="Олена"
      lines={[cheese, bread]}
      customer={null}
      cartDiscount={null}
      onSetCustomer={vi.fn()}
      onSetCartDiscount={vi.fn()}
      onSetQty={onSetQty}
      onRemove={vi.fn()}
      onClear={vi.fn()}
      onCharge={vi.fn()}
    />
  );
  return onSetQty;
}

describe('SaleSidebar with a weighed line', () => {
  it('shows the weighing, its sum and the hand-typed mark, and totals by the server’s rule', () => {
    sidebar();
    const aside = within(screen.getByTestId('sale-sidebar'));
    expect(aside.getByText('Гауда · 0,350 кг × 189,90 ₴/кг')).toBeInTheDocument();
    expect(aside.getByTestId('cart-line-manual')).toHaveTextContent('вагу введено вручну');
    expect(aside.getByText('66,47 ₴')).toBeInTheDocument();
    // 66,47 + 91,80 — never 350 × 189,90.
    expect(aside.getByRole('button', { name: 'Оплатити 158,27 ₴' })).toBeInTheDocument();
  });

  it('changes a weight on the pad instead of «+1 г»', async () => {
    const user = userEvent.setup();
    const onSetQty = sidebar();
    await user.click(screen.getByText('Сир твердий'));
    expect(screen.queryByRole('button', { name: 'Більше' })).toBeNull();
    await user.click(screen.getByTestId('cart-line-reweigh'));
    expect(screen.getByTestId('weight-pad-input')).toHaveValue('0,350');
    for (const k of ['0', 'comma', '5']) await user.click(screen.getByTestId(`weight-pad-key-${k}`));
    await user.click(screen.getByTestId('weight-pad-confirm'));
    expect(onSetQty).toHaveBeenCalledWith('weighed:1', 500);
    expect(screen.queryByTestId('weight-pad')).toBeNull();
  });
});

describe('MobileCartSheet with a weighed line', () => {
  it('counts a weighing as one item and offers the pad', () => {
    render(
      <MobileCartSheet
        lines={[cheese, bread]}
        customer={null}
        cartDiscount={null}
        onSetCustomer={vi.fn()}
        onSetCartDiscount={vi.fn()}
        onSetQty={vi.fn()}
        onRemove={vi.fn()}
        onCharge={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // One weighing and two loaves — not 352 goods.
    expect(screen.getByText('3 товари')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оплатити 158,27 ₴' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Сир твердий'));
    expect(screen.getByTestId('cart-line-reweigh')).toBeInTheDocument();
  });
});
