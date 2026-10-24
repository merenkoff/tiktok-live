// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The notebook on the desktop till (G3_DEBTS.md §6): the handovers written
// down without a network head the page until they reach the server, a refused
// one waits for a person, and without a network the list is the till's mirror.

import 'fake-indexeddb/auto';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    isOfflinePosEnabled: () => true,
    api: {
      posRequest: (...a: unknown[]) => posRequest(...a),
      hasLiveJwt: () => true,
      loadAuth: () => ({ store: { id: 1 } }),
    },
  };
});

const { DebtsRoutes } = await import('./DebtsRoutes');
const { formatUah, useAuthStore, useOfflineStatus } = await import('@pos/platform');
const { resetCreditCache } = await import('../lib/useCredit');
const { db } = await import('../data/db');
const { applyDebtors } = await import('../data/mirror');
const { enqueueIssue } = await import('../data/queue');
const { resetSyncState, syncIssues } = await import('../data/sync');
const { makeAuthResponse, renderWithProviders } = await import('../../../test/utils');

const uah = (cents: number) => formatUah(cents).replace(/\s/g, ' ');

const debtor = (id: number, name: string, balance: number, limit: number | null) => ({
  customer_id: id,
  name,
  phone: `+38067000000${id}`,
  balance_cents: balance,
  limit_cents: limit,
  locked: false,
  open_lines: 1,
  oldest_open_at: '2026-10-20T10:00:00.000Z',
});

async function written(customerId: number, name: string, total: number, over: { id?: string } = {}) {
  return enqueueIssue({
    id: over.id ?? crypto.randomUUID(),
    storeId: 1,
    staff: { id: 1, name: 'Олена' },
    customer: { id: customerId, name },
    items: [{ variant_id: 10, quantity: 1 }],
    cartDiscount: null,
    note: null,
    totalCents: total,
    discountCents: 0,
    lines: [{ title: 'Хліб', quantity: 1, unit: 'шт', unitPriceCents: total, totalCents: total }],
  });
}

function draw(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/debts/*" element={<DebtsRoutes frame="till" />} />
    </Routes>,
    { route }
  );
}

beforeEach(async () => {
  await db.issues.clear();
  await db.credit.clear();
  await db.meta.clear();
  resetCreditCache();
  resetSyncState();
  posRequest.mockReset();
  useAuthStore.setState({ auth: makeAuthResponse({ staff: { role: 'seller' } }), isAuthenticated: true, bootstrapped: true });
  useOfflineStatus.setState({ online: true });
});

describe('the queue on «Борги»', () => {
  it('heads the page with what is waiting, and a refused handover in the server’s words', async () => {
    posRequest.mockResolvedValue({ debtors: [debtor(7, 'Оксана', 26400, 100000)] });
    const dead = await written(8, 'Петро', 4000);
    await db.issues.update(dead.id, { status: 'dead', attempts: 1, deadReason: 'rejected', lastError: 'Покупця не знайдено' });
    await written(7, 'Оксана', 6400);
    draw('/debts');

    const panel = await screen.findByTestId('debts-queue');
    const rows = await within(panel).findAllByTestId('debts-queue-row');
    expect(rows).toHaveLength(2);
    expect(within(panel).getByText('Сервер не прийняв: Покупця не знайдено')).toBeInTheDocument();
    expect(within(panel).getByText('Чекає мережі')).toBeInTheDocument();
    // The ordinary list is still there under it.
    expect(await screen.findByTestId('debtors')).toHaveTextContent('Оксана');
  });

  it('sends a refused row again on request, and removes one only after saying what that means', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get') return { debtors: [] };
      if (path === '/debts/issue') throw { response: { status: 404, data: { error: 'Покупця не знайдено' } } };
      throw new Error(path);
    });
    const row = await written(8, 'Петро', 4000);
    await db.issues.update(row.id, { status: 'dead', attempts: 1, deadReason: 'rejected', lastError: 'Покупця не знайдено' });
    const user = userEvent.setup();
    draw('/debts');

    await user.click(await screen.findByRole('button', { name: 'Надіслати ще раз' }));
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('post', '/debts/issue', expect.objectContaining({ client_uuid: row.id })));
    // Refused again: still here, still red.
    expect(await screen.findByText('Сервер не прийняв: Покупця не знайдено')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Прибрати' }));
    expect(screen.getByText(/товар уже в покупця/)).toBeInTheDocument();
    expect(await db.issues.get(row.id)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Так, прибрати' }));

    await waitFor(() => expect(screen.queryByTestId('debts-queue')).not.toBeInTheDocument());
    expect(await db.issues.get(row.id)).toBeUndefined();
  });

  it('reads the list again once the queue has gone out — the read that raced the send is not the last word', async () => {
    let sent = false;
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'post' && path === '/debts/issue') {
        sent = true;
        return {
          entry: { id: 1 },
          lines: [],
          open_lines: [],
          replay: false,
          credit: { customer_id: 7, limit_cents: 100000, locked: false, balance_cents: 6400, available_cents: 93600, set_at: null, set_by_name: null },
        };
      }
      // Before the send the server has nothing; after it, the handover.
      return { debtors: sent ? [debtor(7, 'Оксана', 6400, 100000)] : [] };
    });
    await written(7, 'Оксана', 6400);
    draw('/debts');

    expect(await screen.findByText('Ніхто нічого не винен.')).toBeInTheDocument();
    await syncIssues();

    expect(await screen.findByTestId('debtors')).toHaveTextContent('Оксана');
    await waitFor(() => expect(screen.queryByTestId('debts-queue')).not.toBeInTheDocument());
  });

  it('marks a debtor above the limit — only an offline handover or a lowered limit puts one there', async () => {
    posRequest.mockResolvedValue({ debtors: [debtor(7, 'Оксана', 320000, 300000), debtor(8, 'Петро', 1000, 300000)] });
    draw('/debts');

    const list = await screen.findByTestId('debtors');
    const marks = within(list).getAllByTestId('debtor-over-limit');
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('li')).toHaveTextContent('Оксана');
  });
});

describe('«Борги» without a network', () => {
  beforeEach(() => {
    useOfflineStatus.setState({ online: false });
  });

  it('shows the mirror with what this till wrote down on top — read-only, and says so', async () => {
    await applyDebtors(1, [debtor(7, 'Оксана', 20000, 100000), debtor(8, 'Петро', 0, 50000)], Date.now() - 1000);
    await written(7, 'Оксана', 90000);
    const user = userEvent.setup();
    draw('/debts');

    expect(await screen.findByTestId('debts-mirror-note')).toHaveTextContent('Без мережі — за даними каси');
    const list = await screen.findByTestId('debtors');
    expect(list).toHaveTextContent('Оксана');
    expect(list).toHaveTextContent(uah(110000));
    // Over the limit by the till's own reckoning, and marked.
    expect(within(list).getByTestId('debtor-over-limit')).toBeInTheDocument();
    // A statement is the server's: no links.
    expect(within(list).queryAllByRole('link')).toHaveLength(0);
    expect(list).not.toHaveTextContent('Петро');

    await user.click(screen.getByRole('button', { name: 'Усі з лімітом' }));
    expect(screen.getByTestId('debtors')).toHaveTextContent('Петро');
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('says plainly when the till never had the list', async () => {
    draw('/debts');
    expect(await screen.findByText(/ще жодного разу не отримала список боргів/)).toBeInTheDocument();
    expect(screen.queryByTestId('debtors')).not.toBeInTheDocument();
  });

  it('keeps a customer’s queued handovers on their page even when the statement cannot be read', async () => {
    await written(7, 'Оксана', 6400);
    await written(8, 'Петро', 1000);
    draw('/debts/7');

    const panel = await screen.findByTestId('debts-queue');
    expect(within(panel).getAllByTestId('debts-queue-row')).toHaveLength(1);
    expect(panel).toHaveTextContent(uah(6400));
    expect(screen.getByText('Потрібна мережа')).toBeInTheDocument();
  });
});

describe('the statement', () => {
  it('marks a handover the desktop wrote without a network', async () => {
    posRequest.mockResolvedValue({
      customer: { id: 7, name: 'Оксана', phone: '' },
      credit: { customer_id: 7, limit_cents: 100000, locked: false, balance_cents: 6400, available_cents: 93600, set_at: null, set_by_name: null },
      open_lines: [],
      entries: [
        { id: 2, kind: 'issue', amount_cents: 6400, created_at: '2026-10-24T09:15:00.000Z', staff_name: 'Олена', reason: null, sale_id: null, receipt_number: null, offline: true },
        { id: 1, kind: 'issue', amount_cents: 1000, created_at: '2026-10-23T09:15:00.000Z', staff_name: 'Олена', reason: null, sale_id: null, receipt_number: null, offline: false },
      ],
      oldest_open_at: null,
    });
    draw('/debts/7');

    const journal = await screen.findByTestId('debts-journal');
    const [first, second] = within(journal).getAllByRole('listitem');
    expect(first).toHaveTextContent('без мережі');
    expect(second).not.toHaveTextContent('без мережі');
  });
});
