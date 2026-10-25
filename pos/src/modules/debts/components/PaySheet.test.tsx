// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Paying a debt off: the oldest lines first (Д4), the lines named to the
// server one by one, cash rounded the store's way — and the three ПРРО
// outcomes, which decide whether the next tap is the same receipt or a new
// one. Since Д4 was revised (G3_DEBTS.md §11) a typed sum is taken whole:
// whole lines, units of the next one, a «внесок» toward it.

// The desktop half writes the credit mirror (Dexie) on every answer.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtFiscal, DebtLine } from '../lib/types';

const posRequest = vi.fn();
const printSlip = vi.fn();
const resolveModuleStationPrinter = vi.fn();
let desktop = false;

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    isOfflinePosEnabled: () => desktop,
    api: {
      posRequest: (...a: unknown[]) => posRequest(...a),
      hasLiveJwt: () => true,
      loadAuth: () => ({ store: { id: 1 } }),
    },
    printSlip: (...a: unknown[]) => printSlip(...a),
    resolveModuleStationPrinter: (...a: unknown[]) => resolveModuleStationPrinter(...a),
  };
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

function draw(lines = LINES, fiscal?: DebtFiscal) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  const { unmount } = renderWithProviders(
    <PaySheet
      customerId={7}
      customerName="Оксана"
      customerPhone="+380671234567"
      openLines={lines}
      fiscal={fiscal}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
  return { onChanged, onClose, unmount };
}

/** A line from a backend with 078: it says how many of its units are paid. */
function partLine(id: number, name: string, quantity: number, unitCents: number, over: Partial<DebtLine> = {}): DebtLine {
  return {
    ...line(id, unitCents * quantity, name),
    quantity,
    remaining_quantity: quantity,
    unit_price_cents: unitCents,
    paid_quantity: 0,
    prepaid_cents: 0,
    ...over,
  };
}

const CAP = partLine(3, 'Кепка', 1, 59000);
const BREAD = partLine(1, 'Хліб', 1, 3200);
const BUNS = partLine(4, 'Булка', 5, 2500);

/** A «внесок» as `GET /sales/:id` gives it: no lines, the money as its payment. */
function prepaymentSale(id: number, cents: number, lineId: number, name: string) {
  return {
    ...paid().sale,
    id,
    receipt_number: `R-00000${id}`,
    subtotal_cents: cents,
    total_cents: cents,
    payments: [{ id: 1, method: 'cash', amount_cents: cents }],
    repays_debt: true,
    debt_prepayment: { line_id: lineId, product_name: name, variant_label: '', amount_cents: cents },
  };
}

beforeEach(() => {
  desktop = false;
  printSlip.mockReset();
  resolveModuleStationPrinter.mockReset();
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

let drawn: { unmount: () => void } | null = null;

/** Draw again in the same test — the previous sheet gone first. */
function cleanupAndDraw(lines: DebtLine[]) {
  drawn?.unmount();
  cleanup();
  drawn = draw(lines);
}

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

  it('on a backend older than 078, turns what the customer holds out into whole lines and change', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '100');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent(`Закриває 2 товари на ${uah(7700)}`);
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent(`Решта ${uah(2300)}`);
    expect(due()).toHaveTextContent(uah(7700));

    await user.clear(screen.getByPlaceholderText('Наприклад: 500'));
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '20');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent('Не вистачає навіть на найстаріший товар');
    expect(screen.getByRole('button', { name: /Прийняти/ })).toBeDisabled();
  });

  it('takes 300 against a 590 cap as a «внесок», with no receipt and nothing to print', async () => {
    pay = () => {
      const sale = prepaymentSale(56, 30000, 3, 'Кепка');
      return paid({ sale, prepayment: sale, open_lines: [{ ...CAP, prepaid_cents: 30000, owed_cents: 29000 }] });
    };
    const user = userEvent.setup();
    draw([CAP]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent(
      `Внесок ${uah(30000)} на «Кепка» — лишиться винно ${uah(29000)}`
    );
    expect(screen.getByTestId('debts-pay-part')).toHaveTextContent(`внесок ${uah(30000)}`);
    expect(lineButton('Кепка')).toHaveAttribute('aria-pressed', 'mixed');
    expect(due()).toHaveTextContent(uah(30000));
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));

    const done = await screen.findByTestId('debts-pay-done');
    const body = posRequest.mock.calls[0][2];
    expect(body).toMatchObject({ part: { line_id: 3, amount_cents: 30000, method: 'cash' }, payments: [] });
    expect(body).not.toHaveProperty('line_ids');
    expect(screen.getByTestId('debts-pay-done-text')).toHaveTextContent(
      `Оксана — прийнято ${uah(30000)} як внесок на «Кепка».`
    );
    expect(within(done).queryByRole('button', { name: /Друкувати чек/ })).toBeNull();
    // Not a desktop: no slip either.
    expect(printSlip).not.toHaveBeenCalled();
  });

  it('closes the oldest whole, takes units of the next and a «внесок» toward it — one tap, one request', async () => {
    pay = () =>
      paid({
        sale: { ...paid().sale, total_cents: 10700, subtotal_cents: 10700 },
        prepayment: prepaymentSale(56, 1300, 4, 'Булка'),
      });
    const user = userEvent.setup();
    draw([BREAD, BUNS]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '120');
    const words = screen.getByTestId('debts-pay-offer');
    expect(words).toHaveTextContent(`Закриває 1 товар на ${uah(3200)}`);
    expect(words).toHaveTextContent(`3 з 5 шт «Булка» на ${uah(7500)}`);
    expect(words).toHaveTextContent(`Внесок ${uah(1300)} на «Булка»`);
    expect(screen.getByTestId('debts-pay-part')).toHaveTextContent(`зараз 3 з 5 шт · внесок ${uah(1300)}`);
    expect(due()).toHaveTextContent(uah(12000));
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));

    await screen.findByTestId('debts-pay-done');
    expect(posRequest.mock.calls[0][2]).toMatchObject({
      line_ids: [1],
      part: { line_id: 4, quantity: 3, amount_cents: 1300, method: 'cash' },
      payments: [{ method: 'cash', amount_cents: 10700 }],
    });
    expect(screen.getByTestId('debts-pay-done-text')).toHaveTextContent(
      `Оксана — прийнято ${uah(12000)}: чек R-0000055 на ${uah(10700)} і внесок ${uah(1300)} на «Булка».`
    );
    expect(screen.getByRole('button', { name: /Друкувати чек/ })).toBeInTheDocument();
  });

  it('in a store with ПРРО takes the units on a receipt and says to hand the rest back', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { fiscal: { enabled: true, provider: 'checkbox' } } }),
      isAuthenticated: true,
      bootstrapped: true,
    });
    const user = userEvent.setup();
    draw([BUNS]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '80');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent(
      `Решту ${uah(500)} поверніть покупцеві: у магазині з ПРРО внесок за частину товару поки не приймається`
    );
    expect(due()).toHaveTextContent(uah(7500));
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    await screen.findByTestId('debts-pay-done');
    const body = posRequest.mock.calls[0][2];
    expect(body.part).toEqual({ line_id: 4, quantity: 3, method: 'cash' });
    expect(body.payments).toEqual([{ method: 'cash', amount_cents: 7500 }]);

    // Too little for a single unit of a one-piece line: nothing to take.
    cleanupAndDraw([CAP]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent('гроші поверніть покупцеві');
    expect(screen.getByRole('button', { name: /Прийняти/ })).toBeDisabled();
  });

  it('stops offering a «внесок» once the server says the store fiscalises after all', async () => {
    pay = () => {
      throw {
        response: {
          status: 409,
          data: {
            error:
              'У магазині з ПРРО внесок за частину товару поки не приймається — гасіть цілими товарами, а решту поверніть покупцеві',
            code: 'prepay_needs_chain',
          },
        },
      };
    };
    const user = userEvent.setup();
    draw([CAP]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    expect(await screen.findByTestId('debts-pay-error')).toHaveTextContent('решту поверніть покупцеві');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent('гроші поверніть покупцеві');
    expect(screen.getByRole('button', { name: /Прийняти/ })).toBeDisabled();
  });

  it('goes back to whole lines when a line is tapped after a typed sum', async () => {
    const user = userEvent.setup();
    draw([BREAD, CAP]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    expect(due()).toHaveTextContent(uah(30000));
    await user.click(lineButton('Хліб'));
    expect(screen.getByPlaceholderText('Наприклад: 500')).toHaveValue('');
    expect(screen.queryByTestId('debts-pay-offer')).toBeNull();
    expect(due()).toHaveTextContent(uah(3200));
  });

  it('prints the «ВНЕСОК» slip on a desktop with a printer for the station', async () => {
    desktop = true;
    resolveModuleStationPrinter.mockResolvedValue({ name: 'XP-58', paperWidth: 58 });
    printSlip.mockResolvedValue(undefined);
    pay = () => {
      const sale = prepaymentSale(56, 30000, 3, 'Кепка');
      return paid({ sale, prepayment: sale, open_lines: [{ ...CAP, prepaid_cents: 30000, owed_cents: 29000 }] });
    };
    const user = userEvent.setup();
    draw([CAP]);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    expect(await screen.findByTestId('debts-pay-slip')).toHaveTextContent('Квитанцію надруковано (XP-58)');
    const [printer, slip] = printSlip.mock.calls[0];
    expect(printer).toBe('XP-58');
    expect(slip.title).toBe('ВНЕСОК');
    expect(slip.lines).toEqual(expect.arrayContaining(['Покупець: Оксана', 'Телефон: +380671234567', 'Внесок № R-0000056']));
    expect(slip.totals).toEqual([
      { label: 'Внесок', amount_cents: 30000 },
      { label: 'Лишилося за товаром', amount_cents: 29000 },
      { label: 'Борг після', amount_cents: 6000 },
    ]);
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

describe('PaySheet in a store whose ПРРО keeps prepayment chains (G3_DEBTS.md §11 «Крок 2»)', () => {
  const CHAINS: DebtFiscal = { on: true, provider: 'checkbox', chains: true };
  const registered = { status: 'done', fiscal_code: 'FC-1', receipt_text: 'ЧЕК ПЕРЕДПЛАТИ' };
  // 300 ₴ already paid toward the cap through its chain: 290,23 ₴ left.
  const CHAINED_CAP = partLine(3, 'Кепка', 1, 59023, {
    prepaid_cents: 30000,
    owed_cents: 29023,
    chain: { id: 'ls-1-000003-1', provider: 'checkbox', pending: false },
  });
  const BREAD_ODD = partLine(1, 'Хліб', 1, 10010);

  beforeEach(() => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { cash_rounding: 50, fiscal: { enabled: true, provider: 'checkbox' } } }),
      isAuthenticated: true,
      bootstrapped: true,
    });
  });

  it('takes a «внесок» as a «чек передплати» and offers it for print', async () => {
    pay = () => {
      const sale = { ...prepaymentSale(56, 30000, 3, 'Кепка'), fiscal_status: 'done', fiscal: registered };
      return paid({
        sale,
        prepayment: sale,
        fiscal: registered,
        parts: [{ kind: 'prepayment', sale, fiscal: registered }],
        open_lines: [{ ...CAP, prepaid_cents: 30000, owed_cents: 29000 }],
      });
    };
    const user = userEvent.setup();
    draw([CAP], CHAINS);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent(
      `Внесок ${uah(30000)} на «Кепка» (чек передплати) — лишиться винно ${uah(29000)}`
    );
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));

    const done = await screen.findByTestId('debts-pay-done');
    expect(posRequest.mock.calls[0][2]).toMatchObject({ part: { line_id: 3, amount_cents: 30000 }, payments: [] });
    expect(screen.getByTestId('debts-pay-done-text')).toHaveTextContent(`прийнято ${uah(30000)} як внесок на «Кепка».`);
    expect(within(done).getByRole('button', { name: /Друкувати чек/ })).toBeInTheDocument();
  });

  it('closes a chained line on its own receipt, rounds each receipt by itself and lists both when done', async () => {
    pay = () =>
      paid({
        parts: [
          {
            kind: 'chain_close',
            sale: {
              ...paid().sale,
              total_cents: 29023,
              rounding_cents: -23,
              fiscal_chain_id: 'ls-1-000003-1',
              items: [{ id: 1, variant_id: 3, product_name: 'Кепка', variant_label: '', quantity: 1, unit_price_cents: 59023, line_total_cents: 29023, refunded_quantity: 0 }],
            },
            fiscal: registered,
          },
          {
            kind: 'receipt',
            sale: {
              ...paid().sale,
              id: 56,
              receipt_number: 'R-0000056',
              total_cents: 10010,
              rounding_cents: -10,
              items: [{ id: 2, variant_id: 1, product_name: 'Хліб', variant_label: '', quantity: 1, unit_price_cents: 10010, line_total_cents: 10010, refunded_quantity: 0 }],
            },
            fiscal: registered,
          },
        ],
      });
    const user = userEvent.setup();
    draw([CHAINED_CAP, BREAD_ODD], CHAINS);
    expect(lineButton('Кепка')).toHaveTextContent('окремим чеком');
    // 290,00 + 100,00 — not 390,50 for the sum rounded at once.
    expect(due()).toHaveTextContent(uah(39000));
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));

    await screen.findByTestId('debts-pay-done');
    expect(posRequest.mock.calls[0][2]).toMatchObject({
      line_ids: [3, 1],
      payments: [{ method: 'cash', amount_cents: 39000 }],
      cash_rounding: 50,
    });
    expect(screen.getByTestId('debts-pay-done-text')).toHaveTextContent(`прийнято ${uah(39000)}: 2 документи.`);
    const rows = within(screen.getByTestId('debts-pay-parts')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Чек R-0000055 · закриває «Кепка»');
    expect(rows[0]).toHaveTextContent(uah(29000));
    expect(rows[1]).toHaveTextContent('Чек R-0000056 · 1 товар');
    expect(within(rows[1]).getByRole('button', { name: /Друкувати/ })).toBeInTheDocument();
  });

  it('when one document of the sum stops, says what to hand back and offers the receipts that went through', async () => {
    let calls = 0;
    pay = () => {
      calls += 1;
      if (calls === 1) {
        throw {
          response: {
            status: 502,
            data: {
              error:
                'ПРРО відхилило чек. Внесок скасовано, сума знову в борг. Попередні чеки пройшли; решту поверніть покупцеві — 20,00 ₴.',
              code: 'rejected',
              part: 'prepayment',
              sale_ids: [55],
              not_taken_cents: 2000,
              sale_voided: true,
              credit: paid().credit,
              open_lines: [BREAD_ODD],
            },
          },
        };
      }
      return paid();
    };
    posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
      if (method === 'post' && path === '/debts/customers/7/pay') return pay(body ?? {});
      if (method === 'get' && path === '/sales/55') {
        return { ...paid().sale, total_cents: 29023, rounding_cents: -23, fiscal_chain_id: 'ls-1-000003-1', fiscal: registered, items: [{ id: 1, variant_id: 3, product_name: 'Кепка', variant_label: '', quantity: 1, unit_price_cents: 59023, line_total_cents: 29023, refunded_quantity: 0 }] };
      }
      throw new Error(`unexpected ${method} ${path}`);
    });
    const user = userEvent.setup();
    const { onChanged } = draw([CHAINED_CAP, BREAD_ODD, BUNS], CHAINS);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '410');
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));

    const error = await screen.findByTestId('debts-pay-error');
    expect(error).toHaveTextContent('решту поверніть покупцеві — 20,00 ₴');
    const through = await screen.findByTestId('debts-pay-through');
    expect(through).toHaveTextContent('Чек R-0000055 · закриває «Кепка»');
    expect(within(through).getByRole('button', { name: /Друкувати/ })).toBeInTheDocument();
    // What is left is a new payment from a sum typed again.
    expect(screen.getByPlaceholderText('Наприклад: 500')).toHaveValue('');
    expect(onChanged).toHaveBeenCalled();
  });

  it('after no answer sends the same request again, whatever was typed since', async () => {
    let calls = 0;
    pay = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      return paid();
    };
    const user = userEvent.setup();
    draw([CHAINED_CAP, BREAD_ODD], CHAINS);
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    await screen.findByRole('button', { name: 'Перевірити ще раз' });
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '100');
    await user.click(screen.getByRole('button', { name: 'Перевірити ще раз' }));
    await screen.findByTestId('debts-pay-done');

    const [first, second] = posRequest.mock.calls.map((c) => c[2]);
    expect(second).toEqual(first);
  });

  it('opened again after a payment that got no answer, sends what that payment sent', async () => {
    let calls = 0;
    pay = () => {
      calls += 1;
      if (calls === 1) throw new Error('timeout of 15000ms exceeded');
      return paid();
    };
    const user = userEvent.setup();
    const first = draw([CHAINED_CAP, BREAD_ODD], CHAINS);
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    await user.click(screen.getByRole('button', { name: /Прийняти/ }));
    expect(await screen.findByTestId('debts-pay-error')).toHaveTextContent('оплата могла пройти');
    first.unmount();

    // The statement read again: the cap is closed, only the bread is left.
    draw([BREAD_ODD], CHAINS);
    await user.click(screen.getByRole('button', { name: 'Перевірити ще раз' }));
    await screen.findByTestId('debts-pay-done');
    const [sent, again] = posRequest.mock.calls.map((c) => c[2]);
    expect(again).toEqual(sent);
    expect(again).toMatchObject({ line_ids: [3] });
  });

  it('takes no «внесок» where ПРРО keeps no chains — the statement says so, whatever the login', async () => {
    useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true, bootstrapped: true });
    const user = userEvent.setup();
    draw([CAP], { on: true, provider: 'cashalot', chains: false });
    await user.type(screen.getByPlaceholderText('Наприклад: 500'), '300');
    expect(screen.getByTestId('debts-pay-offer')).toHaveTextContent('внесок за частину товару поки не приймається');
    expect(screen.getByRole('button', { name: /Прийняти/ })).toBeDisabled();
  });

  it('warns while an earlier document of the chain is still being registered', () => {
    draw([{ ...CHAINED_CAP, chain: { id: 'ls-1-000003-1', provider: 'checkbox', pending: true } }], CHAINS);
    expect(screen.getByTestId('debts-pay-chain-note')).toHaveTextContent('внесок ще реєструється в ПРРО');
  });
});
