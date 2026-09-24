// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The payment screen: cash is typed on the till's own pad or picked from the
// notes a customer is likely to hand over, and the change is on the button
// before it is pressed.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutModal } from './CheckoutModal';

function renderModal(totalCents = 22_000) {
  const onConfirm = vi.fn();
  render(
    <CheckoutModal totalCents={totalCents} itemCount={3} loading={false} onClose={vi.fn()} onConfirm={onConfirm} />
  );
  return { onConfirm };
}

const submit = () => screen.getByTestId('checkout-cash-submit') as HTMLButtonElement;

describe('CheckoutModal', () => {
  it('lists the methods with the total and the number of lines', () => {
    renderModal();
    expect(screen.getByText('До сплати · 3 позиції')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('220,00 ₴');
    for (const name of ['Готівка', 'Картка', 'Змішана']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('takes the exact sum by default, and a quick note with the change on the button', () => {
    const { onConfirm } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    expect(submit()).toHaveTextContent('Прийняти 220,00 ₴');

    fireEvent.click(screen.getByTestId('checkout-quick-50000'));
    expect(screen.getByTestId('checkout-change')).toHaveTextContent('Решта280,00 ₴');
    expect(submit()).toHaveTextContent('Прийняти 500,00 ₴ · решта 280,00 ₴');
    fireEvent.click(submit());
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount_cents: 50_000 }]);
  });

  it('types over the suggested sum on the pad and refuses too little', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(screen.getByTestId('checkout-cash-input')).toHaveValue('200');
    expect(screen.getByTestId('checkout-change')).toHaveTextContent('Не вистачає20,00 ₴');
    expect(submit().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Стерти' }));
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(screen.getByTestId('checkout-cash-input')).toHaveValue('2050');
    expect(submit().disabled).toBe(false);
  });

  it('asks the card terminal first and pays the total on confirmation', () => {
    const { onConfirm } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Картка' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Оплата карткою пройшла/ }));
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'card', amount_cents: 22_000 }]);
  });
});
