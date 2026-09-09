// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const submitStockCount = vi.fn();
vi.mock('@pos/platform', () => ({
  api: { submitStockCount: (p: unknown) => submitStockCount(p) },
  isNetworkError: (e: unknown) => (e as { code?: string })?.code === 'ERR_NETWORK',
  isUnauthorized: (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 401,
}));

import { db } from './db';
import { MAX_ATTEMPTS } from './policy';
import { pendingCount, syncSheets } from './sync';

const http = (status: number, error = 'bad') => ({ response: { status, data: { error } } });

async function queuedSheet(over: Partial<Parameters<typeof db.sheets.add>[0]> = {}) {
  const id = crypto.randomUUID();
  await db.sheets.add({
    id,
    storeId: 1,
    staffId: 7,
    status: 'queued',
    note: null,
    createdAt: Date.now() - 10_000,
    attempts: 0,
    ...over,
  });
  await db.lines.add({ sheetId: id, variantId: 1, countedQty: 3, label: 'Tee', barcode: null, updatedAt: 1 });
  await db.lines.add({ sheetId: id, variantId: 2, countedQty: 0, label: 'Shoe', barcode: null, updatedAt: 2 });
  return id;
}

beforeEach(async () => {
  await db.sheets.clear();
  await db.lines.clear();
  submitStockCount.mockReset();
});

describe('count sheet sync', () => {
  it('submits a queued sheet as client_uuid + lines and records the server document', async () => {
    const id = await queuedSheet({ note: 'зал' });
    submitStockCount.mockResolvedValue({ id: 77, doc_number: 'ІН-000077' });

    await syncSheets();

    expect(submitStockCount).toHaveBeenCalledWith({
      client_uuid: id,
      note: 'зал',
      lines: expect.arrayContaining([
        { variant_id: 1, counted_qty: 3 },
        { variant_id: 2, counted_qty: 0 },
      ]),
    });
    expect(await db.sheets.get(id)).toMatchObject({
      status: 'synced',
      serverDocId: 77,
      serverDocNumber: 'ІН-000077',
    });
    expect(await pendingCount()).toBe(0);
  });

  it('a network failure keeps the sheet queued and burns no attempt', async () => {
    const id = await queuedSheet();
    submitStockCount.mockRejectedValue({ code: 'ERR_NETWORK' });
    await syncSheets();
    expect(await db.sheets.get(id)).toMatchObject({ status: 'queued', attempts: 0, lastError: "Немає зв'язку" });
    expect(await pendingCount()).toBe(1);
  });

  it('a 4xx is final: dead, rejected, with the server message', async () => {
    const id = await queuedSheet();
    submitStockCount.mockRejectedValue(http(400, 'unknown variant_id: 2'));
    await syncSheets();
    expect(await db.sheets.get(id)).toMatchObject({
      status: 'dead',
      deadReason: 'rejected',
      lastError: 'unknown variant_id: 2',
      attempts: 1,
    });
    expect(await pendingCount()).toBe(0);
  });

  it('a 5xx backs off and gives up after MAX_ATTEMPTS', async () => {
    const id = await queuedSheet();
    submitStockCount.mockRejectedValue(http(503, 'try later'));
    await syncSheets();
    expect(await db.sheets.get(id)).toMatchObject({ status: 'error', attempts: 1 });
    // Not due yet — the next tick skips it.
    await syncSheets();
    expect(submitStockCount).toHaveBeenCalledTimes(1);

    await db.sheets.update(id, { attempts: MAX_ATTEMPTS - 1, lastAttemptAt: 0 });
    await syncSheets();
    expect(await db.sheets.get(id)).toMatchObject({ status: 'dead', deadReason: 'attempts_exhausted' });
  });

  it('stops the pass on 401 — the session is gone, not the sheet', async () => {
    const a = await queuedSheet();
    const b = await queuedSheet({ createdAt: Date.now() - 5_000 });
    submitStockCount.mockRejectedValue(http(401, 'Unauthorized'));
    await syncSheets();
    expect(submitStockCount).toHaveBeenCalledTimes(1);
    expect((await db.sheets.get(a))?.status).toBe('queued');
    expect((await db.sheets.get(b))?.status).toBe('queued');
  });
});
