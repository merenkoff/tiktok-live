// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The exchange's payment screen (clothing R1): two receipts for their full
// amounts and one sentence about what crosses the counter. The cashier picks
// only how the NEW receipt is paid; the return half was locked by the dialog.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@pos/platform';
import { makeAuthResponse } from '../../test/utils';
import type { ExchangeDraft } from '../../types';
import { differenceSentence } from '../../lib/exchange';
import { ExchangeCheckout } from './ExchangeCheckout';

function draft(over: Partial<ExchangeDraft['refund']> = {}): ExchangeDraft {
  return {
    saleId: 7,
    saleClientUuid: 'u7',
    receiptNumber: 'R-00042',
    saleCreatedAt: '2026-10-04T10:00:00Z',
    refund: {
      items: [{ sale_item_id: 1, quantity: 1 }],
      method: 'card',
      reason_code: 'size',
      reason: null,
      buyer_name: null,
      buyer_document: null,
      client_uuid: 'rf-uuid',
      ...over,
    },
    returnedCents: 45000,
    returnedLines: [{ name: 'Пальто', label: 'Синій · M', quantity: 1, amount_cents: 45000 }],
  };
}

describe('ExchangeCheckout', () => {
  it('shows both receipts, starts from how they paid, and sends the full new amount', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ExchangeCheckout
        draft={draft()}
        newTotalCents={70000}
        itemCount={1}
        loading={false}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Обмін' })).toBeInTheDocument();
    const back = screen.getByTestId('exchange-return');
    expect(back.textContent).toContain('−450,00 ₴');
    expect(back.textContent).toContain('на картку');
    expect(back.textContent).toContain('Пальто');
    expect(screen.getByTestId('exchange-new-total').textContent).toBe('700,00 ₴');

    // Paid by card the first time → card is pressed; the sentence follows the method.
    expect(screen.getByRole('button', { name: 'Картка' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('exchange-difference').textContent).toContain('Клієнт доплачує 250,00 ₴ карткою');
    await user.click(screen.getByRole('button', { name: 'Готівка' }));
    expect(screen.getByTestId('exchange-difference').textContent).toContain('Клієнт доплачує 250,00 ₴ готівкою');

    await user.click(screen.getByRole('button', { name: 'Оформити обмін' }));
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount_cents: 70000 }], {
      cashRounding: 0,
    });
  });

  it('names what goes back when the new goods are cheaper, by the return receipt’s method', () => {
    render(
      <ExchangeCheckout
        draft={draft()}
        newTotalCents={30000}
        itemCount={1}
        loading={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId('exchange-difference').textContent).toContain('Повернути клієнту 150,00 ₴ на картку');
  });

  it('says so when the sums are equal, and cannot confirm an empty cart', () => {
    render(
      <ExchangeCheckout
        draft={draft({ method: 'cash' })}
        newTotalCents={45000}
        itemCount={0}
        loading={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId('exchange-difference').textContent).toContain('Без доплати — суми рівні');
    expect(screen.getByRole('button', { name: 'Готівка' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Оформити обмін' })).toBeDisabled();
  });

  it('shows the refusal it was handed, with its support code', () => {
    render(
      <ExchangeCheckout
        draft={draft()}
        newTotalCents={70000}
        itemCount={1}
        loading
        error={{ message: 'Немає звʼязку з ПРРО', supportCode: 'FS-DOWN' }}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Немає звʼязку з ПРРО')).toBeInTheDocument();
    expect(alert.textContent).toContain('FS-DOWN');
    expect(screen.getByRole('button', { name: 'Оформлення…' })).toBeDisabled();
  });

  it('differenceSentence: a QR-paid receipt pays back cashless', () => {
    expect(differenceSentence(-1000, draft({ method: 'qr' }), 'cash')).toBe('Повернути клієнту 10,00 ₴ безготівково');
    expect(differenceSentence(1000, draft(), 'card')).toBe('Клієнт доплачує 10,00 ₴ карткою');
    expect(differenceSentence(0, draft(), 'card')).toBe('Без доплати — суми рівні');
  });
});

// НБУ № 25 (TechDocs/POS_CASH_ROUNDING.md, Д9): two documents, each rounding
// its own cash — what goes back in cash and what the new receipt takes in cash.
describe('ExchangeCheckout — cash rounding', () => {
  afterEach(() => {
    useAuthStore.setState({ auth: null, isAuthenticated: false });
  });

  it('rounds each cash half and says what crosses the counter after both', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { cash_rounding: 50 } }),
      isAuthenticated: true,
    });
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const cashDraft = draft({ method: 'cash' });
    cashDraft.returnedCents = 22123;
    render(
      <ExchangeCheckout
        draft={cashDraft}
        newTotalCents={30075}
        itemCount={1}
        loading={false}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );
    // 221,23 back in cash → 221,00; 300,75 in cash → 301,00; 80,00 crosses.
    expect(screen.getByTestId('exchange-return').textContent).toContain('−221,00 ₴');
    expect(screen.getByTestId('exchange-return-rounding')).toHaveTextContent('221,23 ₴ · заокруглення −0,23 ₴');
    expect(screen.getByTestId('exchange-new-total').textContent).toBe('301,00 ₴');
    expect(screen.getByTestId('exchange-new-rounding')).toHaveTextContent('300,75 ₴ · заокруглення +0,25 ₴');
    expect(screen.getByTestId('exchange-difference').textContent).toContain('Клієнт доплачує 80,00 ₴ готівкою');

    await user.click(screen.getByRole('button', { name: 'Оформити обмін' }));
    expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount_cents: 30100 }], {
      cashRounding: 50,
    });
  });

  it('leaves the card half unrounded', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { cash_rounding: 50 } }),
      isAuthenticated: true,
    });
    const cardDraft = draft({ method: 'card' });
    cardDraft.returnedCents = 22123;
    render(
      <ExchangeCheckout
        draft={cardDraft}
        newTotalCents={30075}
        itemCount={1}
        loading={false}
        onClose={() => {}}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByTestId('exchange-return').textContent).toContain('−221,23 ₴');
    expect(screen.queryByTestId('exchange-return-rounding')).not.toBeInTheDocument();
    // The new receipt starts on card too (how they paid) — no rounding there either.
    expect(screen.getByTestId('exchange-new-total').textContent).toBe('300,75 ₴');
  });
});
