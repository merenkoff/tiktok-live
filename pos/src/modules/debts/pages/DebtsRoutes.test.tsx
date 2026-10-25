// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The notebook end to end inside the module: who owes, one customer's page,
// what a cashier and what the owner may do there, and «Потрібна мережа» when
// there is none.

import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { DebtsRoutes } = await import('./DebtsRoutes');
const { formatUah, useAuthStore, useOfflineStatus } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { resetUnanswered } = await import('../lib/pendingKeys');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

const CREDIT = {
  customer_id: 7,
  limit_cents: 300000,
  locked: false,
  balance_cents: 13700,
  available_cents: 286300,
  set_at: null,
  set_by_name: null,
};

function line(id: number, name: string, owed: number, over: Record<string, unknown> = {}) {
  return {
    id,
    entry_id: id,
    created_at: `2026-10-${10 + id}T10:00:00.000Z`,
    product_name: name,
    variant_label: '',
    unit: 'шт',
    quantity: 2,
    returned_quantity: 0,
    remaining_quantity: 2,
    unit_price_cents: owed / 2,
    line_discount_cents: 0,
    line_total_cents: owed,
    owed_cents: owed,
    status: 'open',
    sale_id: null,
    receipt_number: null,
    note: '',
    ...over,
  };
}

let statement: Record<string, unknown>;

function signIn(role: 'owner' | 'seller') {
  useAuthStore.setState({ auth: makeAuthResponse({ staff: { role } }), isAuthenticated: true, bootstrapped: true });
}

function draw(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/debts/*" element={<DebtsRoutes frame="till" />} />
    </Routes>,
    { route }
  );
}

let returned: (body: Record<string, unknown>) => unknown;

beforeEach(() => {
  resetCreditCache();
  resetUnanswered();
  signIn('seller');
  returned = (body) => ({ entry: {}, lines: [], credit: { ...CREDIT, balance_cents: 10500 }, open_lines: [], replay: false, body });
  useOfflineStatus.setState({ online: true });
  statement = {
    customer: { id: 7, name: 'Оксана', phone: '+380671234567' },
    credit: CREDIT,
    open_lines: [line(1, 'Хліб', 6400), line(2, 'Молоко', 7300)],
    entries: [
      { id: 2, kind: 'issue', amount_cents: 7300, created_at: '2026-10-12T10:00:00Z', staff_name: 'Олена', reason: 'до зарплати', sale_id: null, receipt_number: null },
      { id: 1, kind: 'issue', amount_cents: 6400, created_at: '2026-10-11T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: null, receipt_number: null },
    ],
    oldest_open_at: '2026-10-11T10:00:00.000Z',
  };
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'get' && path === '/debts') {
      return {
        debtors: [
          { customer_id: 7, name: 'Оксана', phone: '+380671234567', balance_cents: 13700, limit_cents: 300000, locked: false, open_lines: 2, oldest_open_at: '2026-10-11T10:00:00.000Z' },
          { customer_id: 8, name: 'Марія', phone: '+380509876543', balance_cents: 4500, limit_cents: 100000, locked: true, open_lines: 1, oldest_open_at: '2026-10-20T10:00:00.000Z' },
        ],
      };
    }
    if (method === 'get' && path === '/debts?all=1') return { debtors: [] };
    if (method === 'get' && path === '/debts/customers/7') return statement;
    if (method === 'post' && path === '/debts/customers/7/return') return returned(body ?? {});
    if (method === 'post' && path === '/debts/customers/7/writeoff') {
      return { entry: {}, lines: [], credit: { ...CREDIT, balance_cents: 0 }, open_lines: [], replay: false };
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
});

describe('the debtors', () => {
  it('lists who owes, the total, and finds a customer by name or phone', async () => {
    const user = userEvent.setup();
    draw('/debts');
    const list = await screen.findByTestId('debtors');
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByTestId('debts-total')).toHaveTextContent(`Разом винні ${uah(18200)} · 2 покупці`);
    expect(within(list).getByText('Марія').closest('a')).toHaveTextContent('записи заблоковано');

    await user.type(screen.getByLabelText('Пошук покупця'), '050 98');
    expect(within(screen.getByTestId('debtors')).getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('debtors')).toHaveTextContent('Марія');
  });

  it('asks the server for everyone with a limit on «Усі з лімітом»', async () => {
    const user = userEvent.setup();
    draw('/debts');
    await screen.findByTestId('debtors');
    await user.click(screen.getByRole('button', { name: 'Усі з лімітом' }));
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/debts?all=1', undefined));
    expect(await screen.findByText(/Ще нікому не дозволено/)).toBeInTheDocument();
  });

  it('says it needs the network rather than showing an empty notebook', () => {
    useOfflineStatus.setState({ online: false });
    draw('/debts');
    expect(screen.getByText('Потрібна мережа')).toBeInTheDocument();
    expect(posRequest).not.toHaveBeenCalled();
  });
});

describe('one customer’s statement', () => {
  it('shows what is owed oldest first and the journal newest first', async () => {
    draw('/debts/7');
    expect(await screen.findByRole('heading', { name: 'Оксана' })).toBeInTheDocument();
    expect(screen.getByTestId('debts-statement-credit')).toHaveTextContent(`Борг ${uah(13700)}`);
    const lines = within(screen.getByTestId('debts-open-lines')).getAllByRole('listitem');
    expect(lines[0]).toHaveTextContent('Хліб');
    expect(lines[1]).toHaveTextContent('Молоко');
    const journal = screen.getByTestId('debts-journal');
    expect(journal).toHaveTextContent('до зарплати');
    expect(journal).toHaveTextContent(`+${uah(7300)}`);
  });

  it('gives the cashier money and returns, never the write-off or the limit', async () => {
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    expect(screen.getByRole('button', { name: 'Прийняти оплату' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повернути товар' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Списати' })).toBeNull();
    expect(screen.queryByTestId('debts-limit-editor')).toBeNull();
  });

  it('gives the owner the write-off, which needs a reason', async () => {
    signIn('owner');
    const user = userEvent.setup();
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    expect(screen.getByTestId('debts-limit-editor')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Списати' }));
    const sheet = screen.getByTestId('debts-writeoff-sheet');
    const submit = within(sheet).getByRole('button', { name: /Списати/ });
    expect(submit).toBeDisabled();
    await user.type(within(sheet).getByPlaceholderText(/безнадійний/), 'виїхала');
    expect(submit).toHaveTextContent(uah(13700));
    await user.click(submit);
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith(
        'post',
        '/debts/customers/7/writeoff',
        expect.objectContaining({ line_ids: [1, 2], reason: 'виїхала' })
      )
    );
  });

  it('takes goods back by the unit, priced the refund’s way', async () => {
    const user = userEvent.setup();
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    await user.click(screen.getByRole('button', { name: 'Повернути товар' }));
    const sheet = screen.getByTestId('debts-return-sheet');
    const breadRow = within(sheet).getByText('Хліб').closest('li')!;
    await user.click(within(breadRow).getByRole('button', { name: 'Більше' }));
    const submit = within(sheet).getByRole('button', { name: /Повернути на/ });
    expect(submit).toHaveTextContent(uah(3200));
    await user.click(submit);
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith(
        'post',
        '/debts/customers/7/return',
        expect.objectContaining({ lines: [{ line_id: 1, quantity: 1 }] })
      )
    );
  });

  it('says what was paid of a line and what was brought toward it, and names a «внесок» in the journal (078)', async () => {
    statement = {
      ...statement,
      open_lines: [
        line(1, 'Хліб', 3200, { quantity: 5, remaining_quantity: 3, paid_quantity: 2, prepaid_cents: 0, unit_price_cents: 1600 }),
        line(2, 'Кепка', 29000, { quantity: 1, remaining_quantity: 1, paid_quantity: 0, prepaid_cents: 30000, unit_price_cents: 59000 }),
      ],
      entries: [
        { id: 4, kind: 'payment', amount_cents: -30000, created_at: '2026-10-25T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: 56, receipt_number: 'R-0000056', prepayment: true },
        { id: 3, kind: 'payment', amount_cents: -3200, created_at: '2026-10-24T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: 55, receipt_number: 'R-0000055', prepayment: false },
      ],
    };
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    const lines = within(screen.getByTestId('debts-open-lines')).getAllByRole('listitem');
    expect(lines[0]).toHaveTextContent('3 шт (оплачено 2 шт)');
    expect(lines[1]).toHaveTextContent(`1 шт (внесено ${uah(30000)})`);
    const journal = within(screen.getByTestId('debts-journal')).getAllByRole('listitem');
    expect(journal[0]).toHaveTextContent('Внесок · № R-0000056');
    expect(journal[1]).toHaveTextContent('Погашено · чек R-0000055');
  });

  it('undoes a «внесок» toward goods still open, and offers nothing for one already undone or closed', async () => {
    statement = {
      ...statement,
      open_lines: [line(2, 'Кепка', 29000, { quantity: 1, remaining_quantity: 1, paid_quantity: 0, prepaid_cents: 30000 })],
      entries: [
        { id: 7, kind: 'payment', amount_cents: -30000, created_at: '2026-10-25T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: 56, receipt_number: 'R-0000056', prepayment: true, prepay_line_id: 2 },
        { id: 6, kind: 'payment_void', amount_cents: 5000, created_at: '2026-10-24T12:00:00Z', staff_name: 'Олена', reason: null, sale_id: 50, receipt_number: 'R-0000050', prepayment: true, prepay_line_id: 2 },
        { id: 5, kind: 'payment', amount_cents: -5000, created_at: '2026-10-24T11:00:00Z', staff_name: 'Олена', reason: null, sale_id: 50, receipt_number: 'R-0000050', prepayment: true, prepay_line_id: 2 },
        { id: 4, kind: 'payment', amount_cents: -2000, created_at: '2026-10-24T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: 49, receipt_number: 'R-0000049', prepayment: true, prepay_line_id: 1 },
      ],
    };
    const voided = vi.fn(() => ({ id: 56, status: 'voided' }));
    const base = posRequest.getMockImplementation()!;
    posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) =>
      method === 'post' && path === '/sales/56/void' ? voided() : base(method, path, body)
    );
    const user = userEvent.setup();
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    const journal = within(screen.getByTestId('debts-journal')).getAllByRole('listitem');
    expect(within(journal[0]).getByRole('button', { name: 'Скасувати' })).toBeInTheDocument();
    // Undone already, and toward goods that are no longer open.
    expect(within(journal[2]).queryByRole('button', { name: 'Скасувати' })).toBeNull();
    expect(within(journal[3]).queryByRole('button', { name: 'Скасувати' })).toBeNull();

    await user.click(within(journal[0]).getByRole('button', { name: 'Скасувати' }));
    const sheet = screen.getByTestId('debts-undo-prepay');
    expect(sheet).toHaveTextContent(`Поверніть покупцеві ${uah(30000)} (внесок № R-0000056)`);
    expect(sheet).toHaveTextContent('знову стане боргом за «Кепка»');
    await user.click(within(sheet).getByRole('button', { name: 'Скасувати внесок' }));
    await waitFor(() => expect(voided).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('debts-undo-prepay')).toBeNull());
  });

  it('under ПРРО offers no undo of a «внесок» in its chain, and one ПРРО gave up on only to the owner, with a warning', async () => {
    const chain = { id: 'ls-1-000002-1', provider: 'checkbox', pending: true };
    statement = {
      ...statement,
      fiscal: { on: true, provider: 'checkbox', chains: true },
      open_lines: [line(2, 'Кепка', 19000, { quantity: 1, remaining_quantity: 1, paid_quantity: 0, prepaid_cents: 40000, chain })],
      entries: [
        { id: 8, kind: 'payment', amount_cents: -10000, created_at: '2026-10-25T11:00:00Z', staff_name: 'Олена', reason: null, sale_id: 57, receipt_number: 'R-0000057', prepayment: true, prepay_line_id: 2, fiscal_status: 'failed' },
        { id: 7, kind: 'payment', amount_cents: -30000, created_at: '2026-10-25T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: 56, receipt_number: 'R-0000056', prepayment: true, prepay_line_id: 2, fiscal_status: 'done' },
      ],
    };
    const user = userEvent.setup();
    const seller = draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    expect(within(screen.getByTestId('debts-open-lines')).getByText('внесок ще реєструється в ПРРО')).toBeInTheDocument();
    expect(within(screen.getByTestId('debts-journal')).queryByRole('button', { name: 'Скасувати' })).toBeNull();
    seller.unmount();

    signIn('owner');
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    const journal = within(screen.getByTestId('debts-journal')).getAllByRole('listitem');
    expect(within(journal[1]).queryByRole('button', { name: 'Скасувати' })).toBeNull();
    await user.click(within(journal[0]).getByRole('button', { name: 'Скасувати' }));
    expect(screen.getByTestId('debts-undo-unregistered')).toHaveTextContent('лише якщо в кабінеті Checkbox');
  });

  it('keeps the sheet up with the server’s words when the undo is refused', async () => {
    statement = {
      ...statement,
      open_lines: [line(2, 'Кепка', 29000, { quantity: 1, remaining_quantity: 1, paid_quantity: 0, prepaid_cents: 30000 })],
      entries: [
        { id: 7, kind: 'payment', amount_cents: -30000, created_at: '2026-10-25T10:00:00Z', staff_name: 'Олена', reason: null, sale_id: 56, receipt_number: 'R-0000056', prepayment: true, prepay_line_id: 2 },
      ],
    };
    const base = posRequest.getMockImplementation()!;
    posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
      if (method === 'post' && path === '/sales/56/void') {
        // Another till closed the cap meanwhile: the statement now has no open line for it.
        statement = { ...statement, open_lines: [] };
        throw { response: { status: 400, data: { error: '«Кепка» уже закрив чек R-0000057 — спершу скасуйте його' } } };
      }
      return base(method, path, body);
    });
    const user = userEvent.setup();
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    await user.click(within(screen.getByTestId('debts-journal')).getByRole('button', { name: 'Скасувати' }));
    const sheet = screen.getByTestId('debts-undo-prepay');
    await user.click(within(sheet).getByRole('button', { name: 'Скасувати внесок' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('уже закрив чек R-0000057');
    expect(await screen.findByText('Нічого не винно.')).toBeInTheDocument();
    expect(screen.getByTestId('debts-undo-prepay')).toBeInTheDocument();
  });

  it('does not take back goods money was brought toward — the «внески» go first', async () => {
    statement = {
      ...statement,
      open_lines: [
        line(1, 'Кепка', 29000, { quantity: 1, remaining_quantity: 1, paid_quantity: 0, prepaid_cents: 30000 }),
        line(2, 'Молоко', 7300),
      ],
    };
    const user = userEvent.setup();
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    await user.click(screen.getByRole('button', { name: 'Повернути товар' }));
    const sheet = screen.getByTestId('debts-return-sheet');
    const capRow = within(sheet).getByText('Кепка').closest('li')!;
    expect(within(capRow).getByTestId('debts-return-prepaid')).toHaveTextContent(`уже внесено ${uah(30000)}`);
    expect(within(capRow).queryByRole('button', { name: 'Усе' })).toBeNull();
    const milkRow = within(sheet).getByText('Молоко').closest('li')!;
    expect(within(milkRow).getByRole('button', { name: 'Усе' })).toBeInTheDocument();
  });

  it('opens nothing to pay when nothing is owed', async () => {
    statement = { ...statement, open_lines: [], credit: { ...CREDIT, balance_cents: 0 } };
    draw('/debts/7');
    expect(await screen.findByText('Нічого не винно.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Прийняти оплату' })).toBeNull();
  });

  it('after a return that got no answer, the next sheet sends the same key and says when it was already made', async () => {
    let calls = 0;
    returned = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      return { entry: {}, lines: [], credit: { ...CREDIT, balance_cents: 10500 }, open_lines: [], replay: true };
    };
    const user = userEvent.setup();
    draw('/debts/7');
    await screen.findByRole('heading', { name: 'Оксана' });
    const returnOne = async () => {
      const sheet = screen.getByTestId('debts-return-sheet');
      const breadRow = within(sheet).getByText('Хліб').closest('li')!;
      await user.click(within(breadRow).getByRole('button', { name: 'Більше' }));
      await user.click(within(sheet).getByRole('button', { name: /Повернути на/ }));
    };

    await user.click(screen.getByRole('button', { name: 'Повернути товар' }));
    await returnOne();
    expect(await within(screen.getByTestId('debts-return-sheet')).findByRole('alert')).toHaveTextContent(
      'повернення могло пройти'
    );
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Повернути товар' }));
    expect(within(screen.getByTestId('debts-return-sheet')).getByRole('alert')).toHaveTextContent('Попереднє повернення');
    await returnOne();
    // The replay answers with the return made the first time: the sheet says so and stays.
    expect(await within(screen.getByTestId('debts-return-sheet')).findByRole('alert')).toHaveTextContent(
      'вже було записано'
    );
    const keys = posRequest.mock.calls
      .filter((c) => c[1] === '/debts/customers/7/return')
      .map((c) => (c[2] as { client_uuid: string }).client_uuid);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
