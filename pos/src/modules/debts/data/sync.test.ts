// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop's queue of handovers written down without a network, and the
// mirror the till judges them by (G3_DEBTS.md §6): what a pass sends, what it
// does with every kind of answer, and that the mirror is the server's word.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posRequest = vi.fn();
let storeId: number | null = 1;

vi.mock('@pos/platform', () => ({
  api: {
    posRequest: (...a: unknown[]) => posRequest(...a),
    loadAuth: () => (storeId == null ? null : { store: { id: storeId } }),
  },
  isOfflinePosEnabled: () => true,
  isNetworkError: (e: unknown) => (e as { code?: string })?.code === 'ERR_NETWORK',
  isUnauthorized: (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 401,
}));

import { db } from './db';
import { applyDebtors, mirroredCredit, rememberCredit, DEBTORS_PAGE } from './mirror';
import { enqueueIssue, onQueueChange, pendingFor, retryIssue, discardIssue, queueRows } from './queue';
import { MAX_ATTEMPTS } from './policy';
import { MIRROR_EVERY_MS, pendingCount, resetSyncState, syncIssues } from './sync';
import { knownCredit, resetCreditCache } from '../lib/creditStore';

const http = (status: number, error = 'bad') => ({ response: { status, data: { error } } });
const offline = { code: 'ERR_NETWORK' };

const credit = (customerId: number, balance: number, limit: number | null = 100000) => ({
  customer_id: customerId,
  limit_cents: limit,
  locked: false,
  balance_cents: balance,
  available_cents: limit == null ? null : Math.max(0, limit - balance),
  set_at: null,
  set_by_name: null,
});

const debtor = (customerId: number, balance: number, limit: number | null = 100000) => ({
  customer_id: customerId,
  name: `Покупець ${customerId}`,
  phone: `+38067000000${customerId}`,
  balance_cents: balance,
  limit_cents: limit,
  locked: false,
  open_lines: 1,
  oldest_open_at: null,
});

async function queued(over: { id?: string; store?: number; customer?: number; total?: number; at?: number } = {}) {
  return enqueueIssue(
    {
      id: over.id ?? crypto.randomUUID(),
      storeId: over.store ?? 1,
      staff: { id: 3, name: 'Олена' },
      customer: { id: over.customer ?? 7, name: 'Оксана', phone: '+380671234567' },
      items: [{ variant_id: 10, quantity: 2 }],
      cartDiscount: null,
      note: 'до зарплати',
      totalCents: over.total ?? 6400,
      discountCents: 0,
      lines: [{ title: 'Хліб', quantity: 2, unit: 'шт', unitPriceCents: 3200, totalCents: 6400 }],
    },
    over.at ?? Date.now() - 60_000
  );
}

/** The server: every issue is taken and answers the customer's new credit; the list is `list`. */
function serverTakes(list: ReturnType<typeof debtor>[] = []) {
  posRequest.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'post' && path === '/debts/issue') {
      return { entry: { id: 1 }, lines: [], open_lines: [], replay: false, credit: credit(Number(body?.customer_id), 26400) };
    }
    if (method === 'get' && path === '/debts?all=1') return { debtors: list };
    throw new Error(`unexpected ${method} ${path}`);
  });
}

beforeEach(async () => {
  await db.issues.clear();
  await db.credit.clear();
  await db.meta.clear();
  posRequest.mockReset();
  resetSyncState();
  resetCreditCache();
  storeId = 1;
});

describe('sending the queue', () => {
  it('sends a handover with its key and the moment the goods left, then forgets it and keeps the answer', async () => {
    const at = Date.parse('2026-10-24T09:15:00.000Z');
    const row = await queued({ at });
    serverTakes([debtor(7, 26400)]);

    await syncIssues();

    expect(posRequest).toHaveBeenCalledWith('post', '/debts/issue', {
      customer_id: 7,
      items: [{ variant_id: 10, quantity: 2 }],
      cart_discount: null,
      client_uuid: row.id,
      note: 'до зарплати',
      offline_at: '2026-10-24T09:15:00.000Z',
    });
    expect(await db.issues.get(row.id)).toBeUndefined();
    // The server's word is the mirror's and the screen's at once.
    const mirrored = await mirroredCredit(1, 7);
    expect(mirrored).toMatchObject({ credit: { balance_cents: 26400, limit_cents: 100000 } });
    expect(knownCredit(7)?.balance_cents).toBe(26400);
  });

  it('sends the oldest first', async () => {
    const late = await queued({ at: Date.now() - 1000 });
    const early = await queued({ at: Date.now() - 50_000 });
    serverTakes();

    await syncIssues();

    const sent = posRequest.mock.calls.filter((c) => c[1] === '/debts/issue').map((c) => c[2].client_uuid);
    expect(sent).toEqual([early.id, late.id]);
  });

  it('burns no attempt without a connection: the row waits, and says why', async () => {
    const row = await queued();
    posRequest.mockRejectedValue(offline);

    await syncIssues();

    expect(await db.issues.get(row.id)).toMatchObject({ status: 'queued', attempts: 0, lastError: 'Немає звʼязку' });
    expect(await pendingCount()).toBe(1);
  });

  it('gives a refused handover up for a person to see, with the server’s own sentence', async () => {
    const row = await queued();
    posRequest.mockRejectedValue(http(404, 'Покупця не знайдено'));

    await syncIssues();

    expect(await db.issues.get(row.id)).toMatchObject({
      status: 'dead',
      deadReason: 'rejected',
      attempts: 1,
      lastError: 'Покупця не знайдено',
    });
    // A dead row is not «waiting»: the till's banner does not count it forever.
    expect(await pendingCount()).toBe(0);
  });

  it('tries the server’s own trouble again with backoff, and gives up after the shell’s number of attempts', async () => {
    const row = await queued();
    posRequest.mockRejectedValue(http(503, 'Сервер зайнятий'));

    await syncIssues();
    expect(await db.issues.get(row.id)).toMatchObject({ status: 'error', attempts: 1 });
    // Still inside its backoff: the next tick leaves it alone.
    await syncIssues();
    expect(posRequest.mock.calls.filter((c) => c[1] === '/debts/issue')).toHaveLength(1);

    await db.issues.update(row.id, { attempts: MAX_ATTEMPTS - 1, lastAttemptAt: 0 });
    await syncIssues();
    expect(await db.issues.get(row.id)).toMatchObject({ status: 'dead', deadReason: 'attempts_exhausted' });
  });

  it('treats a timeout and a rate limit as the server’s trouble, not a refusal', async () => {
    const a = await queued();
    posRequest.mockRejectedValueOnce(http(429)).mockRejectedValueOnce(http(408));
    const b = await queued();

    await syncIssues();

    expect(await db.issues.get(a.id)).toMatchObject({ status: 'error' });
    expect(await db.issues.get(b.id)).toMatchObject({ status: 'error' });
  });

  it('stops the pass on a dead session, touching nothing', async () => {
    const a = await queued({ at: Date.now() - 2000 });
    const b = await queued({ at: Date.now() - 1000 });
    posRequest.mockRejectedValue(http(401));

    await syncIssues();

    expect(posRequest).toHaveBeenCalledTimes(1);
    expect(await db.issues.get(a.id)).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await db.issues.get(b.id)).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('leaves another store’s rows for that store, and counts only this one’s', async () => {
    await queued({ store: 2 });
    const mine = await queued();
    serverTakes();

    expect(await pendingCount()).toBe(1);
    await syncIssues();

    expect(posRequest.mock.calls.filter((c) => c[1] === '/debts/issue').map((c) => c[2].client_uuid)).toEqual([mine.id]);
    expect(await db.issues.where('storeId').equals(2).count()).toBe(1);
  });

  it('does nothing without a session', async () => {
    await queued();
    storeId = null;

    await syncIssues();

    expect(posRequest).not.toHaveBeenCalled();
    expect(await pendingCount()).toBe(0);
  });

  it('runs one pass at a time', async () => {
    await queued();
    let release: () => void = () => undefined;
    posRequest.mockImplementation(
      (method: string) =>
        new Promise((resolve) => {
          if (method === 'get') return resolve({ debtors: [] });
          release = () => resolve({ entry: { id: 1 }, lines: [], open_lines: [], replay: false, credit: credit(7, 6400) });
        })
    );

    const first = syncIssues();
    await vi.waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    // A pass is under way: the second call returns at once and sends nothing.
    await syncIssues();
    release();
    await first;

    expect(posRequest.mock.calls.filter((c) => c[1] === '/debts/issue')).toHaveLength(1);
  });

  it('tells the screens when the queue has moved', async () => {
    await queued();
    serverTakes();
    const heard = vi.fn();
    const off = onQueueChange(heard);

    await syncIssues();
    off();

    expect(heard).toHaveBeenCalled();
  });
});

describe('the mirror', () => {
  it('reads the whole list after the sends, and drops whoever is no longer on it', async () => {
    await rememberCredit(1, credit(99, 5000), { name: 'Колишній' });
    serverTakes([debtor(7, 26400), debtor(8, 0)]);
    await queued();

    await syncIssues();

    const calls = posRequest.mock.calls.map((c) => `${c[0]} ${c[1]}`);
    expect(calls).toEqual(['post /debts/issue', 'get /debts?all=1']);
    expect(await mirroredCredit(1, 8)).toMatchObject({ credit: { balance_cents: 0, limit_cents: 100000 } });
    expect(await mirroredCredit(1, 99)).toBe('none');
  });

  it('reads the list at most once a minute when there was nothing to send', async () => {
    serverTakes([debtor(7, 1000)]);

    await syncIssues();
    await syncIssues();
    expect(posRequest.mock.calls.filter((c) => c[1] === '/debts?all=1')).toHaveLength(1);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + MIRROR_EVERY_MS + 1);
    await syncIssues();
    vi.useRealTimers();
    expect(posRequest.mock.calls.filter((c) => c[1] === '/debts?all=1')).toHaveLength(2);
  });

  it('cannot vouch for anyone before the first list, and knows who has no credit after it', async () => {
    expect(await mirroredCredit(1, 7)).toBe('unknown');
    await applyDebtors(1, [debtor(8, 2000)], Date.now());
    expect(await mirroredCredit(1, 7)).toBe('none');
    expect(await mirroredCredit(1, 8)).toMatchObject({ credit: { balance_cents: 2000, available_cents: 98000 } });
    // Another store's list says nothing about this one.
    expect(await mirroredCredit(2, 8)).toBe('unknown');
  });

  it('keeps a row written after the list was asked for — it is newer than the answer', async () => {
    const asked = Date.now() - 5000;
    await rememberCredit(1, credit(7, 30000), { name: 'Оксана' });
    await applyDebtors(1, [debtor(7, 20000)], asked);
    expect(await mirroredCredit(1, 7)).toMatchObject({ credit: { balance_cents: 30000 } });

    await applyDebtors(1, [], asked);
    expect(await mirroredCredit(1, 7)).toMatchObject({ credit: { balance_cents: 30000 } });
  });

  it('removes nobody when the list came back full — past the page, absence proves nothing', async () => {
    await rememberCredit(1, credit(9999, 500), { name: 'За сторінкою' });
    const page = Array.from({ length: DEBTORS_PAGE }, (_, i) => debtor(i + 1, 100));

    await applyDebtors(1, page, Date.now() + 1);

    expect(await mirroredCredit(1, 9999)).toMatchObject({ credit: { balance_cents: 500 } });
  });

  it('forgets a customer the server says has no limit and owes nothing', async () => {
    await rememberCredit(1, credit(7, 0), { name: 'Оксана' });
    await applyDebtors(1, [debtor(7, 0)], Date.now() - 10_000);
    await rememberCredit(1, credit(7, 0, null));
    expect(await mirroredCredit(1, 7)).toBe('none');
  });
});

describe('the queue', () => {
  it('is one row per key, however often it is written down', async () => {
    const row = await queued({ id: 'same-key' });
    const again = await queued({ id: 'same-key', total: 9999 });

    expect(again).toEqual(row);
    expect(await db.issues.count()).toBe(1);
  });

  it('counts what is waiting or failing against the customer, never what was given up on', async () => {
    const a = await queued({ total: 1000 });
    const b = await queued({ total: 2000 });
    await queued({ total: 4000, customer: 8 });
    await db.issues.update(b.id, { status: 'error' });
    expect(await pendingFor(1, 7)).toEqual({ cents: 3000, count: 2 });

    await db.issues.update(a.id, { status: 'dead' });
    expect(await pendingFor(1, 7)).toEqual({ cents: 2000, count: 1 });
  });

  it('sends a refused row again on request, with a clean slate, or removes it', async () => {
    const row = await queued();
    await db.issues.update(row.id, { status: 'dead', attempts: 1, deadReason: 'rejected', lastError: 'Ні' });

    await retryIssue(row.id);
    expect(await db.issues.get(row.id)).toMatchObject({ status: 'queued', attempts: 0 });
    expect((await db.issues.get(row.id))?.lastError).toBeUndefined();

    await discardIssue(row.id);
    expect(await queueRows(1)).toEqual([]);
  });
});
