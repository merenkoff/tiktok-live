// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paying a debt off: the oldest lines first and whole (Д4), the lines named to
// the server one by one, cash rounded the store's way — and the three ПРРО
// outcomes, which decide whether the next tap is the same receipt or a new one.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtLine } from '../lib/types';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { PaySheet } = await import('./PaySheet');
const { formatUah, useAuthStore } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { resetUnanswered } = await import('../lib/pendingKeys');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

function line(id: number, owed: number, name: string): DebtLine {
  return {
    id,
    entry_id: id,
    created_at: `2026-10-${10 + id}T10:00:00.000Z`,
    product_name: name,
    variant_label: '',
    unit: 'шт',
    quantity: 1,
    returned_quantity: 0,
    remaining_quantity: 1,
    unit_price_cents: owed,
    line_discount_cents: 0,
    line_total_cents: owed,
    owed_cents: owed,
    status: 'open',
    sale_id: null,
    receipt_number: null,
    note: '',
  };
}

const LINES = [line(1, 3200, 'Хліб'), line(2, 4500, 'Молоко'), line(3, 6000, 'Сир')];

function paid(over: Record<string, unknown> = {}) {
  return {
    sale: {
      id: 55,
      receipt_number: 'R-0000055',
      status: 'completed',
      subtotal_cents: 7700,
      total_cents: 7700,
      rounding_cents: 0,
      items: [],
      payments: [],
      refunds: [],
      created_at: '2026-10-24T10:00:00Z',
      staff_name: 'Олена',
      fiscal_status: 'none',
      fiscal: null,
    },
    fiscal: null,
    warning: null,
    credit: { customer_id: 7, limit_cents: 100000, locked: false, balance_cents: 6000, available_cents: 94000, set_at: null, set_by_name: null },
    open_lines: [LINES[2]],
    ...over,
  };
}

let pay: (body: Record<string, unknown>) => unknown;

function draw(lines = LINES) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  const { unmount } = renderWithProviders(
    <PaySheet customerId={7} customerName="Оксана" openLines={lines} onClose={onClose} onChanged={onChanged} />
  );
  return { onChanged, onClose, unmount };
}

beforeEach(() => {
  resetCreditCache();
  resetUnanswered();
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true, bootstrapped: true });
  pay = () => paid();
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'post' && path === '/debts/customers/7/pay') return pay(body ?? {});
    throw new Error(`unexpected ${method} ${path}`);
  });
});

const due = () => screen.getByTestId('debts-pay-due');
const lineButton = (name: string) =>
  within(screen.getByTestId('debts-pay-lines')).getByRole('button', { name: new RegExp(name) });

describe('PaySheet', () => {
  it('starts with everything owed, and takes a line with every older one', async () => {
    const user = userEvent.setup();
    draw();
    expect(due()).toHaveTextContent(uah(13700));
    await user.click(lineButton('Хліб'));
    expect(due()).toHaveTextContent(uah(3200));
    expect(lineButton('Молоко')).toHaveAttribute('aria-pressed', 'false');
    await user.click(lineButton('Молоко'));
    expect(lineButton('Хліб')).toHaveAttribute('aria-pressed', 'true');
    expect(due()).toHaveTextContent(uah(7700));
  });

  it('turns what the customer holds out into the whole lines it closes', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '100');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent(`Закриває 2 товари на ${uah(7700)}`);
    await user.click(screen.getByRole('button', { name: 'Взяти' }));
    expect(due()).toHaveTextContent(uah(7700));

    await user.clear(screen.getByPlaceholderText('Наприклад: 500'));
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '20');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent('Не вистачає навіть на найстаріший товар');
  });

  it('names the lines to the server one by one and rounds the cash the store’s way', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { cash_rounding: 50 } }),
      isAuthenticated: true,
      bootstrapped: true,
    });
    const user = userEvent.setup();
    const { onChanged } = draw([line(1, 3183, 'Хліб'), line(2, 4500, 'Молоко')]);
    await user.click(lineButton('Хліб'));
    expect(screen.getByText('Заокруглення готівки')).toBeInTheDocument();
    expect(due()).toHaveTextContent(uah(3200));
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));

    await screen.findByTestId('debts-pay-done');
    const body = posRequest.mock.calls[0][2];
    expect(body).toMatchObject({
      line_ids: [1],
      payments: [{ method: 'cash', amount_cents: 3200 }],
      cash_rounding: 50,
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('never rounds a card', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { cash_rounding: 50 } }),
      isAuthenticated: true,
      bootstrapped: true,
    });
    const user = userEvent.setup();
    draw([line(1, 3183, 'Хліб')]);
    await user.click(screen.getByRole('button', { name: /Картка/ }));
    expect(screen.queryByText('Заокруглення готівки')).toBeNull();
    expect(due()).toHaveTextContent(uah(3183));
  });

  it('says the money is taken and the receipt will follow, when ПРРО did not answer', async () => {
    pay = () =>
      paid({ warning: 'Оплату прийнято, але чек ще не зареєстровано в ПРРО. Не пробивайте його вдруге.' });
    const user = userEvent.setup();
    draw();
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    const done = await screen.findByTestId('debts-pay-done');
    expect(done).toHaveTextContent('R-0000055');
    expect(done).toHaveTextContent('Не пробивайте його вдруге');
  });

  it('starts a new receipt after ПРРО undid one, and asks again with the same after no answer', async () => {
    let calls = 0;
    pay = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      if (calls === 2) {
        throw {
          response: {
            status: 502,
            data: {
              error: 'ПРРО відхилило чек — перевірте товари та ціни. Чек погашення скасовано, товари знову в борг.',
              code: 'rejected',
              sale_voided: true,
              credit: paid().credit,
              open_lines: LINES,
            },
          },
        };
      }
      return paid();
    };
    const user = userEvent.setup();
    const { onChanged } = draw();
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    // Nothing came back: the button now checks rather than charges.
    await user.click(await screen.findByRole('button', { name: 'Перевірити ще раз' }));
    expect(await screen.findByTestId('debts-pay-error')).toHaveTextContent('товари знову в борг');
    expect(onChanged).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    await screen.findByTestId('debts-pay-done');

    const keys = posRequest.mock.calls.map((c) => c[2].client_uuid);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    await waitFor(() => expect(calls).toBe(3));
  });

  it('opened again after a payment that got no answer, checks with the same key first', async () => {
    let calls = 0;
    pay = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      return paid();
    };
    const user = userEvent.setup();
    const first = draw();
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    expect(await screen.findByTestId('debts-pay-error')).toHaveTextContent('оплата могла пройти');
    first.unmount();

    draw();
    expect(screen.getByTestId('debts-pay-error')).toHaveTextContent('Попередня оплата');
    await user.click(screen.getByRole('button', { name: 'Перевірити ще раз' }));
    await screen.findByTestId('debts-pay-done');
    const keys = posRequest.mock.calls.map((c) => c[2].client_uuid);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
