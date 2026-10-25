// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Giving a line's ПРРО chain back (G3_DEBTS.md §11, 2-Б): the whole chain at
// once — the «внески» of an open line, or the goods of a closed one with all
// the money for them — said in figures before the tap, the return receipts
// listed after it, and the same key again after no answer.

// The credit cache writes the desktop mirror (Dexie) on every answer.
import 'fake-indexeddb/auto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    isOfflinePosEnabled: () => false,
    api: {
      posRequest: (...a: unknown[]) => posRequest(...a),
      hasLiveJwt: () => true,
      loadAuth: () => ({ store: { id: 1 } }),
    },
  };
});

const { ChainReturnSheet } = await import('./ChainReturnSheet');
const { formatUah, useAuthStore } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { resetUnanswered } = await import('../lib/pendingKeys');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

function refunded(id: number, cents: number, refundId: number, kind: 'prepayment' | 'chain_close') {
  return {
    kind,
    refund_id: refundId,
    fiscal: { status: 'done', fiscal_code: `FN${refundId}`, fiscal_date: null, tax_url: null, qr_payload: null, receipt_text: null, error_code: null, message: null },
    sale: {
      id,
      receipt_number: `R-00000${id}`,
      status: 'refunded',
      subtotal_cents: cents,
      total_cents: cents,
      rounding_cents: 0,
      items: [],
      payments: [{ id: 1, method: 'cash', amount_cents: cents }],
      refunds: [
        {
          id: refundId,
          refund_number: `RF-000000${refundId}`,
          client_uuid: null,
          method: 'cash',
          total_cents: cents,
          rounding_cents: 0,
          reason: null,
          staff_name: 'Олена',
          created_at: '2026-10-25T12:00:00Z',
          fiscal_status: 'done',
          fiscal: null,
          items: [],
        },
      ],
      created_at: '2026-10-25T10:00:00Z',
      staff_name: 'Олена',
      fiscal_status: 'done',
      fiscal: null,
      fiscal_chain_id: 'ls-1-000003-1',
      debt_prepayment: kind === 'prepayment' ? { line_id: 3, product_name: 'Кепка', variant_label: '', amount_cents: cents } : null,
    },
  };
}

const credit = { customer_id: 7, limit_cents: 100000, locked: false, balance_cents: 59000, available_cents: 41000, set_at: null, set_by_name: null };

let answer: (body: Record<string, unknown>) => unknown;

function draw(mode: 'cancel' | 'goods', count = 2, cents = 40000) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <ChainReturnSheet
      mode={mode}
      customerId={7}
      lineId={3}
      title="Кепка"
      count={count}
      cents={cents}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
  return { onChanged, onClose };
}

beforeEach(() => {
  resetCreditCache();
  resetUnanswered();
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true, bootstrapped: true });
  answer = () => ({
    parts: [refunded(58, 10000, 12, 'prepayment'), refunded(57, 30000, 11, 'prepayment')],
    back_cents: 40000,
    warning: null,
    credit,
    open_lines: [],
    replay: false,
  });
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'post' && (path === '/debts/customers/7/prepayments/cancel' || path === '/debts/customers/7/chain-return')) {
      return answer(body ?? {});
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
});

describe('ChainReturnSheet — «Скасувати внески»', () => {
  it('says what goes back before the tap, sends the line, and lists the return receipts', async () => {
    const user = userEvent.setup();
    const { onChanged } = draw('cancel');
    expect(text(screen.getByTestId('debts-chain-words'))).toContain(`Поверніть покупцеві ${uah(40000)}`);
    expect(text(screen.getByTestId('debts-chain-words'))).toContain('2 внески');
    expect(text(screen.getByTestId('debts-chain-words'))).toContain('окремо один внесок не повертається');

    await user.click(screen.getByRole('button', { name: `Повернути ${formatUah(40000)}` }));
    const done = await screen.findByTestId('debts-chain-done');
    const [, path, body] = posRequest.mock.calls[0];
    expect(path).toBe('/debts/customers/7/prepayments/cancel');
    expect(body).toEqual({ line_id: 3, client_uuid: expect.any(String) });
    expect(text(within(done).getByTestId('debts-chain-done-text'))).toContain(`Покупцеві — ${uah(40000)}: 2 чеки повернення. Сума знову в борг.`);
    const rows = within(done).getByTestId('debts-chain-returns');
    expect(text(rows)).toContain('Чек повернення RF-00000012 · внесок № R-0000058');
    expect(text(rows)).toContain('Чек повернення RF-00000011 · внесок № R-0000057');
    expect(within(rows).getByRole('button', { name: 'Друкувати: Чек повернення RF-00000011 · внесок № R-0000057' })).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('says the money goes back when a return receipt is still to be registered', async () => {
    const user = userEvent.setup();
    answer = () => ({
      parts: [refunded(57, 30000, 11, 'prepayment')],
      back_cents: 30000,
      warning: 'Повернення записано — гроші покупцеві віддайте. Чеки повернення ще реєструються в ПРРО, повторювати нічого не треба.',
      credit,
      open_lines: [],
      replay: false,
    });
    draw('cancel', 1, 30000);
    await user.click(screen.getByRole('button', { name: `Повернути ${formatUah(30000)}` }));
    expect(await screen.findByTestId('debts-chain-warning')).toHaveTextContent('гроші покупцеві віддайте');
  });

  it('sends the same key again after no answer — the second tap finds the first', async () => {
    const user = userEvent.setup();
    const keys: unknown[] = [];
    let first = true;
    answer = (body) => {
      keys.push(body.client_uuid);
      if (first) {
        first = false;
        throw new Error('timeout of 15000ms exceeded');
      }
      return { parts: [refunded(57, 30000, 11, 'prepayment')], back_cents: 30000, warning: null, credit, open_lines: [], replay: true };
    };
    draw('cancel', 1, 30000);
    await user.click(screen.getByRole('button', { name: `Повернути ${formatUah(30000)}` }));
    expect(await screen.findByTestId('debts-chain-error')).toHaveTextContent('не поверне гроші вдруге');
    await user.click(screen.getByRole('button', { name: 'Перевірити ще раз' }));
    await screen.findByTestId('debts-chain-done');
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('prints the server’s refusal in its words', async () => {
    const user = userEvent.setup();
    answer = () => {
      throw { response: { status: 409, data: { error: 'Попередній внесок за цей товар ще реєструється в ПРРО — спробуйте за хвилину', code: 'chain_pending' } } };
    };
    const { onChanged } = draw('cancel');
    await user.click(screen.getByRole('button', { name: `Повернути ${formatUah(40000)}` }));
    expect(await screen.findByTestId('debts-chain-error')).toHaveTextContent('ще реєструється в ПРРО');
    expect(screen.getByRole('button', { name: `Повернути ${formatUah(40000)}` })).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe('ChainReturnSheet — the goods of a line its chain closed', () => {
  it('names the goods and the sum, and writes them off when they are defective', async () => {
    const user = userEvent.setup();
    answer = () => ({
      parts: [refunded(59, 29000, 13, 'chain_close'), refunded(57, 30000, 11, 'prepayment')],
      back_cents: 59000,
      warning: null,
      credit,
      open_lines: [],
      replay: false,
    });
    draw('goods', 2, 59000);
    const words = text(screen.getByTestId('debts-chain-words'));
    expect(words).toContain('«Кепка» — на полицю');
    expect(words).toContain(uah(59000));
    expect(words).toContain('2 чеки повернення');

    await user.click(screen.getByTestId('debts-chain-defect'));
    await user.click(screen.getByRole('button', { name: `Повернути ${formatUah(59000)}` }));
    const done = await screen.findByTestId('debts-chain-done');
    const [, path, body] = posRequest.mock.calls[0];
    expect(path).toBe('/debts/customers/7/chain-return');
    expect(body).toEqual({ line_id: 3, client_uuid: expect.any(String), reason_code: 'defect' });
    expect(text(within(done).getByTestId('debts-chain-done-text'))).not.toContain('борг');
    expect(text(within(done).getByTestId('debts-chain-returns'))).toContain('Чек повернення RF-00000013 · чек R-0000059');
  });
});
