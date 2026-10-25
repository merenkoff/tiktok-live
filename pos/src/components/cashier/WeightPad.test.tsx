// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The weight pad (TechDocs/grocery/G4_WEIGHED.md): the cashier types what a
// plain scale shows, sees the line's sum at the server's own rounding before
// it goes into the cart, and the weight leaves marked as typed by hand.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WeightPad } from './WeightPad';

function setup(props: Partial<Parameters<typeof WeightPad>[0]> = {}) {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <WeightPad
      productName="Сир твердий"
      variantLabel="Гауда"
      unit="г"
      pricePer={1000}
      priceCents={18990}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />
  );
  const key = (k: string) => screen.getByTestId(`weight-pad-key-${k === ',' ? 'comma' : k}`);
  return { user, onConfirm, onClose, key };
}

describe('WeightPad', () => {
  it('says the price per kilogram and that the weight is typed by hand', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Вага: Сир твердий' })).toBeInTheDocument();
    expect(screen.getByText('Гауда · 189,90 ₴/кг')).toBeInTheDocument();
    expect(screen.getByText('вручну')).toBeInTheDocument();
    expect(screen.getByText(/вагу введено вручну/)).toBeInTheDocument();
  });

  it('types kilograms on the pad and shows the sum the server will file', async () => {
    const { user, onConfirm, key } = setup();
    for (const k of ['0', ',', '3', '5']) await user.click(key(k));
    expect(screen.getByTestId('weight-pad-input')).toHaveValue('0,35');
    // 0,350 кг × 189,90 = 66,465 → 66,47, half a kopeck up.
    expect(screen.getByTestId('weight-pad-sum')).toHaveTextContent('66,47 ₴');
    const confirm = screen.getByTestId('weight-pad-confirm');
    expect(confirm).toHaveTextContent('Додати · 0,350 кг · 66,47 ₴');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(350, 'manual');
  });

  it('takes a weight typed on a keyboard and submits on Enter', async () => {
    const { user, onConfirm } = setup();
    const input = screen.getByTestId('weight-pad-input');
    await user.type(input, '1.457{Enter}');
    expect(input).toHaveValue('1,457');
    expect(onConfirm).toHaveBeenCalledWith(1457, 'manual');
  });

  it('will not confirm nothing, and names a weight too small to cost a kopeck', async () => {
    const { user, onConfirm, key } = setup({ priceCents: 499 });
    expect(screen.getByTestId('weight-pad-confirm')).toBeDisabled();
    for (const k of ['0', ',', '0', '0', '1']) await user.click(key(k));
    expect(screen.getByTestId('weight-pad-problem')).toHaveTextContent('Сума рядка 0,00 ₴');
    await user.click(screen.getByTestId('weight-pad-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('opens on a line’s weight to change it — the first key replaces it', async () => {
    const { user, onConfirm, key } = setup({ initialQuantity: 350, confirmLabel: 'Зберегти' });
    expect(screen.getByTestId('weight-pad-input')).toHaveValue('0,350');
    for (const k of ['0', ',', '5']) await user.click(key(k));
    await user.click(screen.getByTestId('weight-pad-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(500, 'manual');
  });

  it('shows what the books say is on the shelf without stopping the sale', () => {
    setup({ stock: 2350 });
    expect(screen.getByText('за обліком 2,350 кг')).toBeInTheDocument();
  });

  it('closes on Escape and on the cross', async () => {
    const { user, onClose } = setup();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
