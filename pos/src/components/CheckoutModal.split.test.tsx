// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The payment screen for a cart of two ФОП (track ДК, TechDocs/POS_DUAL_REGISTER.md):
// the sums are the server's quote, the method is one (Д8), and a card goes
// through the terminals one by one before anything is sent (Д14).

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SplitQuote } from '../types';
import { CheckoutModal, type CheckoutSplit } from './CheckoutModal';

function quoteOf(dues: [number, number]): SplitQuote {
  return {
    parts: [
      { register_no: 1, label: null, item_indexes: [0], total_cents: dues[0], rounding_cents: 0, due_cents: dues[0] },
      { register_no: 2, label: 'Бар', item_indexes: [1], total_cents: dues[1], rounding_cents: 0, due_cents: dues[1] },
    ],
    due_cents: dues[0] + dues[1],
  };
}

async function renderSplit(quote: CheckoutSplit['quote']) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  await act(async () => {
    render(
      <CheckoutModal
        totalCents={118_000}
        itemCount={2}
        loading={false}
        onClose={onClose}
        onConfirm={onConfirm}
        split={{ quote }}
      />
    );
  });
  return { onConfirm };
}

describe('CheckoutModal — two receipts', () => {
  it('offers only cash and card, and shows each receipt from the quote', async () => {
    const quote = vi.fn(async () => quoteOf([82_000, 36_000]));
    await renderSplit(quote);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    });

    expect(screen.queryByRole('button', { name: 'Змішана' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'QR-код' })).not.toBeInTheDocument();
    expect(quote).toHaveBeenCalledWith('cash');
    expect(await screen.findByTestId('checkout-split-2')).toHaveTextContent('Каса 2 · Бар · 360,00 ₴');
    expect(screen.getByTestId('checkout-split-1')).toHaveTextContent('Каса 1 · 820,00 ₴');
  });

  it('takes cash once, with the change, for the sum of both receipts', async () => {
    const { onConfirm } = await renderSplit(async () => quoteOf([82_000, 36_000]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    });
    await screen.findByTestId('checkout-split-2');
    expect(screen.getByTestId('checkout-cash-input')).toHaveValue('1180');

    fireEvent.click(screen.getByTestId('checkout-cash-submit'));
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount_cents: 118_000 }], { cashRounding: 0 });
  });

  it('walks the card through each terminal and sends one request after the last', async () => {
    const { onConfirm } = await renderSplit(async () => quoteOf([82_000, 36_000]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Картка' }));
    });
    const done = await screen.findByTestId('checkout-terminal-done');
    expect(done).toHaveTextContent('Пройшла на терміналі «Каса 1» · 820,00 ₴');

    fireEvent.click(done);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('checkout-terminal-done')).toHaveTextContent('«Каса 2 · Бар» · 360,00 ₴');
    expect(screen.getByTestId('checkout-card-taken-hint')).toHaveTextContent('820,00 ₴ на терміналі «Каса 1»');

    fireEvent.click(screen.getByTestId('checkout-terminal-done'));
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'card', amount_cents: 118_000 }], { cashRounding: 0 });
  });

  it('warns that a terminal already took money when the cashier turns to cash', async () => {
    await renderSplit(async () => quoteOf([82_000, 36_000]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Картка' }));
    });
    fireEvent.click(await screen.findByTestId('checkout-terminal-done'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    });
    expect(screen.getByTestId('checkout-card-taken')).toHaveTextContent('поверніть ці гроші на терміналі');
  });

  it('says the server’s refusal and takes no cash without a quote', async () => {
    await renderSplit(async () => {
      throw Object.assign(new Error('409'), {
        response: { data: { error: 'stop_listed', message: 'Борщ на стоп-листі' } },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Готівка' }));
    });
    expect(await screen.findByTestId('checkout-split-error')).toHaveTextContent('Борщ на стоп-листі');
    expect((screen.getByTestId('checkout-cash-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});
