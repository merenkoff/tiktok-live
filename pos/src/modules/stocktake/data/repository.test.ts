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
  searchCatalog,
  setCount,
  startSheet,
} from './repository';

const tee: CatalogItem = {
  variant_id: 1,
  product_id: 1,
  product_name: 'Футболка базова',
  attributes: { color: 'Синій', size: 'M' },
  label: 'Синій / M',
  unit: 'шт',
  sku: 'TS-M-BL',
  barcode: '4820000000001',
  price_cents: 45000,
  quantity: 5,
  image_url: null,
};
const shoe: CatalogItem = {
  ...tee,
  variant_id: 2,
  product_name: 'Кросівки',
  attributes: { size: '42' },
  label: '42',
  barcode: '4820000000002',
};

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

  it('scanning the same variant twice bumps the count; the line keeps the server caption', async () => {
    const s = await startSheet({ storeId: 1, staffId: 7 });
    await addCount(s.id, tee);
    await addCount(s.id, tee);
    await addCount(s.id, shoe);
    const lines = await listLines(s.id);
    expect(lines.map((l) => [l.variantId, l.countedQty, l.label])).toEqual(
      expect.arrayContaining([
        [1, 2, 'Футболка базова · Синій / M'],
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
    // A count counts the shelf, not the menu: a café's milk is not sellable
    // and this is the one screen that has to find it.
    expect(getCatalog).toHaveBeenLastCalledWith({
      barcode: '4820000000002',
      include_unsellable: true,
    });
  });

  it('searchCatalog asks for the whole shelf too', async () => {
    getCatalog.mockResolvedValue([tee]);
    await expect(searchCatalog('mi')).resolves.toHaveLength(1);
    expect(getCatalog).toHaveBeenLastCalledWith({ q: 'mi', include_unsellable: true });
  });

  // Captured with the label, and for the same reason: the sheet is counted
  // with no network, and «5 пляшок» has to stay readable without the catalog
  // (migration 054).
  it('captures the unit and the purchase pack on the line', async () => {
    const sheet = await startSheet({ storeId: 1, staffId: 1 });
    const oil: CatalogItem = {
      ...tee,
      variant_id: 9,
      product_name: 'Олія',
      unit: 'мл',
      pack_qty: 1000,
      pack_label: 'пляшка',
    };
    await addCount(sheet.id, oil, 1000);
    const [line] = await listLines(sheet.id);
    expect(line).toMatchObject({ unit: 'мл', packQty: 1000, packLabel: 'пляшка' });
    // Base units, always: the pack is a typing aid, not a second unit.
    expect(line.countedQty).toBe(1000);
  });

  it('leaves a variant with no pack exactly as it was', async () => {
    const sheet = await startSheet({ storeId: 1, staffId: 1 });
    await addCount(sheet.id, tee, 2);
    const [line] = await listLines(sheet.id);
    expect(line.packQty).toBeNull();
    expect(line.packLabel).toBe('');
  });
});
