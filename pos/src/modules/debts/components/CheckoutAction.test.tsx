// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Під запис» beside «Оплатити»: what it says before the tap, what it sends,
// and that the host is told the cart is finished only once the goods are on
// the tab — whichever way the cashier leaves the success pane.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartLine, PosCustomer } from '@pos/platform';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { default: CheckoutAction } = await import('./CheckoutAction');
const { formatUah, useOfflineStatus } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { resetUnanswered } = await import('../lib/pendingKeys');
const { renderWithProviders } = await import('../../../test/utils');

const customer: PosCustomer = {
  id: 7,
  store_id: 1,
  name: 'Оксана',
  phone: '+380671234567',
  email: null,
  children_birthdays: [],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const bread: CartLine = {
  uid: '10',
  variant_id: 10,
  product_name: 'Хліб',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: 3200,
  quantity: 2,
  max_quantity: 99,
};

const credit = (over: Record<string, unknown> = {}) => ({
  customer_id: 7,
  limit_cents: 100000,
  locked: false,
  balance_cents: 20000,
  available_cents: 80000,
  set_at: null,
  set_by_name: null,
  ...over,
});

function writeResult() {
  return {
    entry: { id: 1, kind: 'issue', amount_cents: 6400, created_at: '', staff_name: null, reason: null, sale_id: null, receipt_number: null },
    lines: [],
    credit: credit({ balance_cents: 26400, available_cents: 73600 }),
    open_lines: [],
    replay: false,
  };
}

function draw(over: Partial<Parameters<typeof CheckoutAction>[0]> = {}) {
  const onCompleted = vi.fn();
  renderWithProviders(
    <CheckoutAction
      lines={[bread]}
      customer={customer}
      cartDiscount={{ type: 'percent', value: 10 }}
      totalCents={6400}
      onCompleted={onCompleted}
      {...over}
    />
  );
  return { onCompleted };
}

let balance: ReturnType<typeof credit>;
let issue: (body: Record<string, unknown>) => unknown;

beforeEach(() => {
  resetCreditCache();
  resetUnanswered();
  useOfflineStatus.setState({ online: true });
  balance = credit();
  issue = () => writeResult();
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'get' && path === '/debts/customers/7/balance') return balance;
    if (method === 'post' && path === '/debts/issue') return issue(body ?? {});
    throw new Error(`unexpected ${method} ${path}`);
  });
});

const button = () => screen.getByRole('button', { name: /Під запис/ });

describe('CheckoutAction', () => {
  it('draws nothing for an empty cart', () => {
    const { onCompleted } = draw({ lines: [] });
    expect(screen.queryByTestId('debts-checkout-action')).toBeNull();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('asks for a customer first — a debt is written to a person', () => {
    draw({ customer: null });
    expect(button()).toBeDisabled();
    expect(screen.getByTestId('debts-checkout-hint')).toHaveTextContent('Оберіть покупця');
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('says nothing under a button that works — the strip under the customer already does', async () => {
    draw();
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/debts/customers/7/balance', undefined));
    await new Promise((r) => setTimeout(r, 0));
    expect(button()).toBeEnabled();
    expect(screen.queryByTestId('debts-checkout-hint')).toBeNull();
  });

  it('refuses a cart above what is still allowed, in figures, before anyone taps (Д3)', async () => {
    balance = credit({ balance_cents: 95000, available_cents: 5000 });
    draw();
    await waitFor(() => expect(button()).toBeDisabled());
    expect(screen.getByTestId('debts-checkout-hint')).toHaveTextContent('Понад ліміт');
  });

  it('greys out for a customer the owner gave no limit', async () => {
    balance = credit({ limit_cents: null, available_cents: null, balance_cents: 0 });
    draw();
    await waitFor(() => expect(button()).toBeDisabled());
    expect(screen.getByTestId('debts-checkout-hint')).toHaveTextContent('не дозволено');
  });

  it('needs the network in this release', async () => {
    useOfflineStatus.setState({ online: false });
    draw();
    expect(button()).toBeDisabled();
    expect(screen.getByTestId('debts-checkout-hint')).toHaveTextContent('лише з мережею');
  });

  it('writes the cart to the tab and tells the host only when the cashier is done', async () => {
    const user = userEvent.setup();
    const { onCompleted } = draw();
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    await user.type(screen.getByPlaceholderText(/до зарплати/), 'до пʼятниці');
    await user.click(screen.getByRole('button', { name: /Записати/ }));

    await screen.findByTestId('debts-issue-after');
    const call = posRequest.mock.calls.find((c) => c[1] === '/debts/issue')!;
    expect(call[2]).toMatchObject({
      customer_id: 7,
      items: [{ variant_id: 10, quantity: 2 }],
      cart_discount: { type: 'percent', value: 10 },
      note: 'до пʼятниці',
    });
    expect(String(call[2].client_uuid)).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByTestId('debts-issue-after')).toHaveTextContent(`ще можна ${formatUah(73600)}`);
    // Not yet: the success pane is still up.
    expect(onCompleted).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('counts closing the success pane any other way as done too', async () => {
    const user = userEvent.setup();
    const { onCompleted } = draw();
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    await user.click(screen.getByRole('button', { name: /Записати/ }));
    await screen.findByTestId('debts-issue-after');
    await user.keyboard('{Escape}');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('prints the server’s refusal, and does not finish the cart', async () => {
    issue = () => {
      throw {
        response: {
          status: 409,
          data: { error: 'Власник заблокував записи під запис для цього покупця.', code: 'credit_locked' },
        },
      };
    };
    const user = userEvent.setup();
    const { onCompleted } = draw();
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    await user.click(screen.getByRole('button', { name: /Записати/ }));
    expect(await screen.findByTestId('debts-issue-error')).toHaveTextContent('заблокував');
    await user.keyboard('{Escape}');
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('sends the same key again after no answer, and a new one after a refusal', async () => {
    let calls = 0;
    issue = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      if (calls === 2) throw { response: { status: 400, data: { error: 'Немає товарів для запису' } } };
      return writeResult();
    };
    const user = userEvent.setup();
    draw();
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    // After no answer the same button checks rather than writes.
    const write = () => user.click(screen.getByRole('button', { name: /Записати|Перевірити ще раз/ }));
    await write();
    await screen.findByTestId('debts-issue-error');
    await write();
    await waitFor(() => expect(calls).toBe(2));
    await write();
    await screen.findByTestId('debts-issue-after');

    const keys = posRequest.mock.calls.filter((c) => c[1] === '/debts/issue').map((c) => c[2].client_uuid);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('opened again on the same cart after no answer, checks with the same key — whatever the limit says now', async () => {
    let calls = 0;
    issue = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      return { ...writeResult(), replay: true, entry: { ...writeResult().entry, created_at: '2026-10-24T09:14:00.000Z' } };
    };
    const user = userEvent.setup();
    const { onCompleted } = draw();
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    await user.click(screen.getByRole('button', { name: /Записати/ }));
    expect(await screen.findByTestId('debts-issue-error')).toHaveTextContent('запис міг пройти');
    // The cashier gives up and closes the sheet: nothing is finished.
    await user.keyboard('{Escape}');
    expect(onCompleted).not.toHaveBeenCalled();

    // The write did land, so the balance now holds it and the cart reads as
    // over the limit — which must not stop checking that very write.
    balance = credit({ balance_cents: 95000, available_cents: 5000 });
    resetCreditCache();
    await user.click(button());
    expect(screen.getByTestId('debts-issue-error')).toHaveTextContent('Попередній запис цього кошика');
    await user.click(screen.getByRole('button', { name: 'Перевірити ще раз' }));
    expect(await screen.findByTestId('debts-issue-replay')).toHaveTextContent('удруге борг не записано');

    const keys = posRequest.mock.calls.filter((c) => c[1] === '/debts/issue').map((c) => c[2].client_uuid);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('a different cart never replays an unanswered write', async () => {
    let calls = 0;
    issue = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      return writeResult();
    };
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      <CheckoutAction lines={[bread]} customer={customer} cartDiscount={null} totalCents={6400} onCompleted={vi.fn()} />
    );
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    await user.click(screen.getByRole('button', { name: /Записати/ }));
    await screen.findByTestId('debts-issue-error');
    await user.keyboard('{Escape}');
    unmount();

    draw({ lines: [{ ...bread, quantity: 3 }], cartDiscount: null, totalCents: 9600 });
    await waitFor(() => expect(button()).toBeEnabled());
    await user.click(button());
    expect(screen.queryByTestId('debts-issue-error')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Записати/ }));
    await screen.findByTestId('debts-issue-after');
    const keys = posRequest.mock.calls.filter((c) => c[1] === '/debts/issue').map((c) => c[2].client_uuid);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
