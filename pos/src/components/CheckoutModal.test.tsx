// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The payment screen: cash is typed on the till's own pad or picked from the
// notes a customer is likely to hand over, and the change is on the button
// before it is pressed.

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@pos/platform';
import { makeAuthResponse } from '../test/utils';
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
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount_cents: 50_000 }], {
      cashRounding: 0,
    });
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
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'card', amount_cents: 22_000 }], {
      cashRounding: 0,
    });
  });
});

// НБУ № 25 (TechDocs/POS_CASH_ROUNDING.md): with the store's rounding on, the
// cash part is due rounded, the change comes off the rounded sum, and the card
// is never rounded.
describe('CheckoutModal — cash rounding', () => {
  afterEach(() => {
    useAuthStore.setState({ auth: null, isAuthenticated: false });
  });

  function roundTo(step: number) {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { cash_rounding: step } }),
      isAuthenticated: true,
    });
  }

  it('asks for the rounded sum in cash and says by how much', () => {
    roundTo(50);
    const { onConfirm } = renderModal(22_123);
    fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    expect(screen.getByTestId('checkout-cash-due')).toHaveTextContent(
      'Готівкою до сплати 221,00 ₴ · заокруглення −0,23 ₴'
    );
    // The pad starts on the rounded sum, which is enough on its own.
    expect(screen.getByTestId('checkout-cash-input')).toHaveValue('221');
    expect(submit().disabled).toBe(false);
    fireEvent.click(screen.getByTestId('checkout-quick-50000'));
    expect(submit()).toHaveTextContent('Прийняти 500,00 ₴ · решта 279,00 ₴');
    fireEvent.click(submit());
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount_cents: 50_000 }], {
      cashRounding: 50,
    });
  });

  it('rounds up as well, and then wants the rounded-up sum', () => {
    roundTo(50);
    renderModal(22_130);
    fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    expect(screen.getByTestId('checkout-cash-due')).toHaveTextContent('221,50 ₴ · заокруглення +0,20 ₴');
    expect(screen.getByTestId('checkout-cash-input')).toHaveValue('221,5');
  });

  it('shows nothing extra when the sum is already round', () => {
    roundTo(10);
    renderModal(22_000);
    fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    expect(screen.queryByTestId('checkout-cash-due')).not.toBeInTheDocument();
  });

  it('never rounds the card', () => {
    roundTo(50);
    const { onConfirm } = renderModal(22_123);
    fireEvent.click(screen.getByRole('button', { name: 'Картка' }));
    fireEvent.click(screen.getByRole('button', { name: /Оплата карткою пройшла/ }));
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'card', amount_cents: 22_123 }], {
      cashRounding: 50,
    });
  });

  it('rounds only the cash part of a mixed payment', () => {
    roundTo(50);
    const { onConfirm } = renderModal(22_123);
    fireEvent.click(screen.getByRole('button', { name: 'Змішана' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Картка' }), { target: { value: '100' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Готівка' }), { target: { value: '121' } });
    expect(screen.getByTestId('checkout-mixed-rounding')).toHaveTextContent(
      'Готівкову частину заокруглено на −0,23 ₴ — до сплати 221,00 ₴'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Прийняти' }));
    expect(onConfirm).toHaveBeenCalledWith(
      [
        { method: 'cash', amount_cents: 12_100 },
        { method: 'card', amount_cents: 10_000 },
      ],
      { cashRounding: 50 }
    );
  });
});
