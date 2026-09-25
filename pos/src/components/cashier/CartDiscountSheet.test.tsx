// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Знижка на чек»: per cent or a sum, capped and never zero, and «Скинути»
// takes it off — the one sheet both the till's receipt and the phone's cart open.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartDiscountSheet } from './CartDiscountSheet';

function renderSheet(current: Parameters<typeof CartDiscountSheet>[0]['current'] = null) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<CartDiscountSheet current={current} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose, field: () => screen.getByTestId('cart-discount-value') };
}

describe('CartDiscountSheet', () => {
  it('applies a percentage, capped at 100', () => {
    const { onApply, onClose, field } = renderSheet();
    fireEvent.change(field(), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Застосувати' }));
    expect(onApply).toHaveBeenCalledWith({ type: 'percent', value: 100 });
    expect(onClose).toHaveBeenCalled();
  });

  it('applies a sum typed the way the screen writes it', () => {
    const { onApply, field } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Сума, ₴' }));
    fireEvent.change(field(), { target: { value: '1 250,50' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith({ type: 'fixed', value: 125_050 });
  });

  it('ignores an empty or zero value instead of applying nothing', () => {
    const { onApply, onClose, field } = renderSheet();
    fireEvent.change(field(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Застосувати' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens on the discount already there, and «Скинути» takes it off', () => {
    const { onApply, field } = renderSheet({ type: 'fixed', value: 5000 });
    expect(field()).toHaveValue('50,00');
    expect(screen.getByRole('button', { name: 'Сума, ₴' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Скинути' }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
});
