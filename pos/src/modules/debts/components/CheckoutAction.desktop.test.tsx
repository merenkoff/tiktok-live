// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Під запис» on the desktop till (G3_DEBTS.md §6): without a network it
// writes the handover down, judged by the till's mirror; a write that got no
// answer goes into the same queue under the same key; and a till with a
// printer for «Квитанції під запис» prints the customer's slip.

import 'fake-indexeddb/auto';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartLine, PosCustomer } from '@pos/platform';

const posRequest = vi.fn();
const printSlip = vi.fn();
const resolveModuleStationPrinter = vi.fn();
const refreshCatalog = vi.fn();
let liveJwt = true;

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    isOfflinePosEnabled: () => true,
    api: {
      posRequest: (...a: unknown[]) => posRequest(...a),
      hasLiveJwt: () => liveJwt,
      loadAuth: () => ({ store: { id: 1 } }),
    },
    cashierApi: { ...real.cashierApi, refreshCatalog: () => refreshCatalog() },
    printSlip: (...a: unknown[]) => printSlip(...a),
    resolveModuleStationPrinter: (...a: unknown[]) => resolveModuleStationPrinter(...a),
  };
});

const { default: CheckoutAction } = await import('./CheckoutAction');
const { formatUah, useAuthStore, useOfflineStatus } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { resetUnanswered } = await import('../lib/pendingKeys');
const { db } = await import('../data/db');
const { applyDebtors, mirroredCredit } = await import('../data/mirror');
const { enqueueIssue } = await import('../data/queue');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

// `toHaveTextContent` folds every space, the thousands' narrow one included.
const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

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
  variant_label: '500 г',
  unit: 'шт',
  unit_price_cents: 3200,
  quantity: 2,
  max_quantity: 99,
};

const credit = (balance: number, limit: number | null = 100000) => ({
  customer_id: 7,
  limit_cents: limit,
  locked: false,
  balance_cents: balance,
  available_cents: limit == null ? null : Math.max(0, limit - balance),
  set_at: null,
  set_by_name: null,
});

async function mirror(balance: number, limit: number | null = 100000) {
  await applyDebtors(
    1,
    [{ customer_id: 7, name: 'Оксана', phone: customer.phone, balance_cents: balance, limit_cents: limit, locked: false, open_lines: 1, oldest_open_at: null }],
    Date.now() - 1000
  );
}

function draw() {
  const onCompleted = vi.fn();
  renderWithProviders(
    <CheckoutAction lines={[bread]} customer={customer} cartDiscount={null} totalCents={6400} onCompleted={onCompleted} />
  );
  return { onCompleted };
}

beforeEach(async () => {
  await db.issues.clear();
  await db.credit.clear();
  await db.meta.clear();
  resetCreditCache();
  resetUnanswered();
  posRequest.mockReset();
  printSlip.mockReset();
  resolveModuleStationPrinter.mockReset();
  resolveModuleStationPrinter.mockResolvedValue(null);
  refreshCatalog.mockReset();
  refreshCatalog.mockResolvedValue(undefined);
  liveJwt = true;
  useAuthStore.setState({ auth: makeAuthResponse({ staff: { role: 'seller' } }), isAuthenticated: true, bootstrapped: true });
  useOfflineStatus.setState({ online: true });
});

describe('without a network', () => {
  beforeEach(() => {
    useOfflineStatus.setState({ online: false });
  });

  it('writes the handover down under the sheet’s key, judged by the mirror, and asks the server nothing', async () => {
    await mirror(20000);
    const user = userEvent.setup();
    const { onCompleted } = draw();

    expect(await screen.findByTestId('debts-checkout-hint')).toHaveTextContent('Без мережі: запишеться на касі');
    await user.click(screen.getByRole('button', { name: /Під запис/ }));
    expect(await screen.findByTestId('debts-issue-local')).toHaveTextContent('Без мережі — за даними каси');
    await user.click(screen.getByRole('button', { name: /Записати .* у борг/ }));

    expect(await screen.findByTestId('debts-issue-queued')).toHaveTextContent('Записано на касі без мережі');
    expect(screen.getByTestId('debts-issue-after')).toHaveTextContent(`Борг ${uah(26400)}`);
    expect(posRequest).not.toHaveBeenCalled();
    const rows = await db.issues.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      storeId: 1,
      customerId: 7,
      customerName: 'Оксана',
      items: [{ variant_id: 10, quantity: 2 }],
      totalCents: 6400,
      status: 'queued',
      lines: [{ title: 'Хліб · 500 г', quantity: 2, unit: 'шт', unitPriceCents: 3200, totalCents: 6400 }],
    });

    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('refuses over the limit the mirror knows, in figures (Д3 does not lapse offline)', async () => {
    await mirror(98000);
    draw();

    expect(await screen.findByTestId('debts-checkout-hint')).toHaveTextContent(`ще можна ${uah(2000)}`);
    expect(screen.getByRole('button', { name: /Під запис/ })).toBeDisabled();
  });

  it('counts what this till already wrote down against the limit', async () => {
    await mirror(20000);
    await enqueueIssue({
      id: 'earlier',
      storeId: 1,
      staff: { id: 1, name: 'Олена' },
      customer: { id: 7, name: 'Оксана' },
      items: [{ variant_id: 10, quantity: 20 }],
      cartDiscount: null,
      note: null,
      totalCents: 78000,
      discountCents: 0,
      lines: [],
    });
    draw();

    expect(await screen.findByTestId('debts-checkout-hint')).toHaveTextContent(`ще можна ${uah(2000)}`);
    expect(screen.getByRole('button', { name: /Під запис/ })).toBeDisabled();
  });

  it('refuses when the till never had the list of who may take credit', async () => {
    draw();

    expect(await screen.findByTestId('debts-checkout-hint')).toHaveTextContent('Потрібна мережа');
    expect(screen.getByRole('button', { name: /Під запис/ })).toBeDisabled();
  });

  it('refuses a customer who is not in the list: no limit, no credit', async () => {
    await applyDebtors(1, [], Date.now() - 1000);
    draw();

    expect(await screen.findByTestId('debts-checkout-hint')).toHaveTextContent('Ліміт ставить власник');
  });

  it('takes an offline login for no network, whatever the cable says', async () => {
    useOfflineStatus.setState({ online: true });
    liveJwt = false;
    await mirror(20000);
    draw();

    expect(await screen.findByTestId('debts-checkout-hint')).toHaveTextContent('Без мережі: запишеться на касі');
    expect(posRequest).not.toHaveBeenCalled();
  });
});

describe('with a network', () => {
  it('writes a handover that got no answer into the queue under the very key it sent', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/debts/customers/7/balance') return credit(20000);
      // No response at all: the request may or may not have landed.
      throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    });
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: /Під запис/ }));
    await user.click(await screen.findByRole('button', { name: /Записати .* у борг/ }));

    expect(await screen.findByTestId('debts-issue-queued')).toBeInTheDocument();
    const sent = posRequest.mock.calls.find((c) => c[1] === '/debts/issue')?.[2] as { client_uuid: string };
    const rows = await db.issues.toArray();
    expect(rows.map((row) => row.id)).toEqual([sent.client_uuid]);
  });

  it('keeps the server’s answer for the next outage, re-reads the stock and prints the slip where a printer is set', async () => {
    resolveModuleStationPrinter.mockResolvedValue({ name: 'XP-58', paperWidth: 58 });
    printSlip.mockResolvedValue(undefined);
    posRequest.mockImplementation(async (method: string) => {
      if (method === 'get') return credit(20000);
      return {
        entry: { id: 41, kind: 'issue', amount_cents: 6400, created_at: '2026-10-24T09:15:00.000Z', staff_name: 'Олена', reason: null, sale_id: null, receipt_number: null },
        lines: [{ product_name: 'Хліб', variant_label: '500 г', quantity: 2, unit: 'шт', unit_price_cents: 3200, line_total_cents: 6400 }],
        credit: credit(26400),
        open_lines: [],
        replay: false,
      };
    });
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: /Під запис/ }));
    await user.click(await screen.findByRole('button', { name: /Записати .* у борг/ }));

    expect(await screen.findByTestId('debts-issue-slip')).toHaveTextContent('Квитанцію надруковано (XP-58)');
    expect(printSlip).toHaveBeenCalledWith(
      'XP-58',
      expect.objectContaining({
        title: 'ПІД ЗАПИС',
        lines: expect.arrayContaining(['Покупець: Оксана', 'Запис № 41']),
        totals: [
          { label: 'Під запис', amount_cents: 6400 },
          { label: 'Борг після', amount_cents: 26400 },
        ],
      }),
      58
    );
    expect(refreshCatalog).toHaveBeenCalled();
    await waitFor(async () => expect(await mirroredCredit(1, 7)).toMatchObject({ credit: { balance_cents: 26400 } }));
  });

  it('prints nothing and says nothing where the till named no printer', async () => {
    posRequest.mockImplementation(async (method: string) => {
      if (method === 'get') return credit(20000);
      return {
        entry: { id: 41, kind: 'issue', amount_cents: 6400, created_at: '', staff_name: null, reason: null, sale_id: null, receipt_number: null },
        lines: [],
        credit: credit(26400),
        open_lines: [],
        replay: false,
      };
    });
    const user = userEvent.setup();
    draw();

    await user.click(await screen.findByRole('button', { name: /Під запис/ }));
    await user.click(await screen.findByRole('button', { name: /Записати .* у борг/ }));

    expect(await screen.findByText('Записано під запис')).toBeInTheDocument();
    await waitFor(() => expect(resolveModuleStationPrinter).toHaveBeenCalled());
    expect(printSlip).not.toHaveBeenCalled();
    expect(screen.queryByTestId('debts-issue-slip')).not.toBeInTheDocument();
  });
});
