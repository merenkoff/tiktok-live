// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The phone's cart is the only cart on a phone, so a picked-up pre-order must
// read there exactly as it does in the sidebar: its lines are the shop's
// promise — no quantity, no delete, no cart discount — and «Повернути» puts it
// back to waiting.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartLine } from '@pos/platform';
import { MobileCartSheet } from './MobileCartSheet';

const line: CartLine = {
  uid: '7',
  variant_id: 7,
  product_name: 'Букет «Ніжність»',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: 115_000,
  quantity: 1,
  max_quantity: 5,
};

function renderSheet(locked: boolean) {
  const handlers = {
    onSetQty: vi.fn(),
    onRemove: vi.fn(),
    onCancelPreorder: vi.fn(),
  };
  render(
    <MobileCartSheet
      lines={[line]}
      customer={null}
      cartDiscount={null}
      onSetCustomer={vi.fn()}
      onSetCartDiscount={vi.fn()}
      onCharge={vi.fn()}
      onClose={vi.fn()}
      onSaveBasket={vi.fn()}
      locked={locked}
      {...handlers}
    />
  );
  fireEvent.click(screen.getByText('Букет «Ніжність»'));
  return handlers;
}

describe('MobileCartSheet — a pre-order on the phone', () => {
  it('offers no quantity, delete or cart discount on a promised line, and puts it back', () => {
    const { onCancelPreorder } = renderSheet(true);
    expect(screen.queryByRole('button', { name: 'Менше' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Більше' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Видалити/ })).toBeNull();
    expect(screen.queryByText('Знижка на чек')).toBeNull();
    expect(screen.queryByTestId('park-cart-mobile')).toBeNull();

    fireEvent.click(screen.getByTestId('preorder-put-back-mobile'));
    expect(onCancelPreorder).toHaveBeenCalledTimes(1);
  });

  it('keeps the controls on an ordinary line', () => {
    const { onSetQty, onRemove } = renderSheet(false);
    fireEvent.click(screen.getByRole('button', { name: 'Більше' }));
    expect(onSetQty).toHaveBeenCalledWith('7', 2);
    fireEvent.click(screen.getByRole('button', { name: /Видалити/ }));
    expect(onRemove).toHaveBeenCalledWith('7');
    expect(screen.getByText('Знижка на чек')).toBeInTheDocument();
    expect(screen.queryByTestId('preorder-put-back-mobile')).toBeNull();
  });
});
