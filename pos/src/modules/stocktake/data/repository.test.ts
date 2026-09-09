// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '../../../types';

const getCatalog = vi.fn<(opts?: { q?: string; barcode?: string }) => Promise<CatalogItem[]>>();
vi.mock('@pos/platform', () => ({ cashierApi: { getCatalog: (o: never) => getCatalog(o) } }));

import { db } from './db';
import {
  addCount,
  discardSheet,
  finishSheet,
  lineLabel,
  listLines,
  listSheets,
  lookupByBarcode,
  removeLine,
  setCount,
  startSheet,
} from './repository';

const tee: CatalogItem = {
  variant_id: 1,
  product_id: 1,
  product_name: 'Футболка базова',
  size: 'M',
  color: 'Синій',
  sku: 'TS-M-BL',
  barcode: '4820000000001',
  price_cents: 45000,
  quantity: 5,
  image_url: null,
};
const shoe: CatalogItem = { ...tee, variant_id: 2, product_name: 'Кросівки', size: '42', color: '', barcode: '4820000000002' };

beforeEach(async () => {
  await db.sheets.clear();
  await db.lines.clear();
  getCatalog.mockReset();
});

describe('count sheet repository', () => {
  it('starts a sheet per store and lists newest first', async () => {
    const a = await startSheet({ storeId: 1, staffId: 7 });
    await new Promise((r) => setTimeout(r, 2));
    const b = await startSheet({ storeId: 1, staffId: 7 });
    await startSheet({ storeId: 2, staffId: 9 });
    expect((await listSheets(1)).map((s) => s.id)).toEqual([b.id, a.id]);
    expect(a).toMatchObject({ status: 'counting', attempts: 0, note: null });
  });

  it('scanning the same variant twice bumps the count; labels drop an empty color', async () => {
    const s = await startSheet({ storeId: 1, staffId: 7 });
    await addCount(s.id, tee);
    await addCount(s.id, tee);
    await addCount(s.id, shoe);
    const lines = await listLines(s.id);
    expect(lines.map((l) => [l.variantId, l.countedQty, l.label])).toEqual(
      expect.arrayContaining([
        [1, 2, 'Футболка базова · M · Синій'],
        [2, 1, 'Кросівки · 42'],
      ])
    );
    expect(lineLabel(shoe)).toBe('Кросівки · 42');
  });

  it('setCount replaces, never below zero; removeLine drops the row', async () => {
    const s = await startSheet({ storeId: 1, staffId: 7 });
    await addCount(s.id, tee);
    await setCount(s.id, 1, 12);
    expect((await listLines(s.id))[0].countedQty).toBe(12);
    await setCount(s.id, 1, -3);
    expect((await listLines(s.id))[0].countedQty).toBe(0);
    await removeLine(s.id, 1);
    expect(await listLines(s.id)).toEqual([]);
  });

  it('finishSheet refuses an empty sheet and freezes a counted one', async () => {
    const s = await startSheet({ storeId: 1, staffId: 7 });
    await expect(finishSheet(s.id)).rejects.toThrow(/Порожній/);
    await addCount(s.id, tee);
    const done = await finishSheet(s.id);
    expect(done.status).toBe('queued');
    expect(done.finishedAt).toBeTypeOf('number');
    await expect(addCount(s.id, tee)).rejects.toThrow(/завершено/);
  });

  it('discardSheet removes the sheet and its lines, but never a synced one', async () => {
    const s = await startSheet({ storeId: 1, staffId: 7 });
    await addCount(s.id, tee);
    await discardSheet(s.id);
    expect(await db.sheets.count()).toBe(0);
    expect(await db.lines.count()).toBe(0);

    const t = await startSheet({ storeId: 1, staffId: 7 });
    await db.sheets.update(t.id, { status: 'synced', serverDocId: 5 });
    await expect(discardSheet(t.id)).rejects.toThrow(/не видаляється/);
  });

  it('lookupByBarcode insists on an exact match when the backend is lenient', async () => {
    getCatalog.mockResolvedValue([tee, shoe]);
    await expect(lookupByBarcode('4820000000002')).resolves.toMatchObject({ variant_id: 2 });
    await expect(lookupByBarcode('0000')).resolves.toBeNull();
    getCatalog.mockResolvedValue([shoe]);
    await expect(lookupByBarcode(' 4820000000002 ')).resolves.toMatchObject({ variant_id: 2 });
    expect(getCatalog).toHaveBeenLastCalledWith({ barcode: '4820000000002' });
  });
});
