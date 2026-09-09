// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Local count sheets. Everything here is offline-first: the catalog comes from
 * the host's `cashierApi` (the till's own snapshot when offline, the API when
 * online), and the sheet lives in this module's IndexedDB until `sync.ts`
 * ships it.
 */

import { cashierApi } from '@pos/platform';
import type { CatalogItem } from '@pos/platform';
import { db, type LineRow, type SheetRow } from './db';

export function lineLabel(item: Pick<CatalogItem, 'product_name' | 'size' | 'color'>): string {
  return [item.product_name, item.size, item.color].filter((s) => s && s.trim()).join(' · ');
}

export async function listSheets(storeId: number): Promise<SheetRow[]> {
  const rows = await db.sheets.where('storeId').equals(storeId).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export function getSheet(id: string): Promise<SheetRow | undefined> {
  return db.sheets.get(id);
}

export async function listLines(sheetId: string): Promise<LineRow[]> {
  const rows = await db.lines.where('sheetId').equals(sheetId).toArray();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function startSheet(params: {
  storeId: number;
  staffId: number;
  note?: string | null;
}): Promise<SheetRow> {
  const row: SheetRow = {
    id: crypto.randomUUID(),
    storeId: params.storeId,
    staffId: params.staffId,
    status: 'counting',
    note: params.note?.trim() || null,
    createdAt: Date.now(),
    attempts: 0,
  };
  await db.sheets.add(row);
  return row;
}

async function assertCounting(sheetId: string): Promise<SheetRow> {
  const sheet = await db.sheets.get(sheetId);
  if (!sheet) throw new Error('Лист не знайдено');
  if (sheet.status !== 'counting') throw new Error('Лист уже завершено');
  return sheet;
}

/** Scan / tap: add `delta` (default one unit) to the line, creating it at 0 first. */
export async function addCount(sheetId: string, item: CatalogItem, delta = 1): Promise<LineRow> {
  await assertCounting(sheetId);
  const key: [string, number] = [sheetId, item.variant_id];
  const prev = await db.lines.get(key);
  const row: LineRow = {
    sheetId,
    variantId: item.variant_id,
    countedQty: Math.max(0, (prev?.countedQty ?? 0) + delta),
    label: prev?.label ?? lineLabel(item),
    barcode: item.barcode ?? prev?.barcode ?? null,
    updatedAt: Date.now(),
  };
  await db.lines.put(row);
  return row;
}

/** Typed quantity — replaces the count outright. */
export async function setCount(sheetId: string, variantId: number, qty: number): Promise<void> {
  await assertCounting(sheetId);
  const key: [string, number] = [sheetId, variantId];
  const prev = await db.lines.get(key);
  if (!prev) throw new Error('Рядок не знайдено');
  await db.lines.put({ ...prev, countedQty: Math.max(0, Math.floor(qty)), updatedAt: Date.now() });
}

export async function removeLine(sheetId: string, variantId: number): Promise<void> {
  await assertCounting(sheetId);
  await db.lines.delete([sheetId, variantId]);
}

/** Close the sheet and hand it to the queue. Refuses an empty sheet. */
export async function finishSheet(sheetId: string): Promise<SheetRow> {
  const sheet = await assertCounting(sheetId);
  const count = await db.lines.where('sheetId').equals(sheetId).count();
  if (count === 0) throw new Error('Порожній лист — відскануйте хоча б один товар');
  const next: SheetRow = { ...sheet, status: 'queued', finishedAt: Date.now() };
  await db.sheets.put(next);
  return next;
}

/** Delete a sheet that never reached the server. A synced one is history — keep it. */
export async function discardSheet(sheetId: string): Promise<void> {
  const sheet = await db.sheets.get(sheetId);
  if (!sheet) return;
  if (sheet.status === 'synced') throw new Error('Надісланий лист не видаляється');
  await db.transaction('rw', db.sheets, db.lines, async () => {
    await db.lines.where('sheetId').equals(sheetId).delete();
    await db.sheets.delete(sheetId);
  });
}

/**
 * Exact barcode match. `cashierApi.getCatalog` already filters server-side /
 * in the offline snapshot, but a mocked or lenient backend may return more —
 * the equality check keeps a scan from landing on the wrong variant.
 */
export async function lookupByBarcode(code: string): Promise<CatalogItem | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const items = await cashierApi.getCatalog({ barcode: trimmed });
  return items.find((i) => i.barcode === trimmed) ?? (items.length === 1 ? items[0] : null);
}

export async function searchCatalog(q: string): Promise<CatalogItem[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const items = await cashierApi.getCatalog({ q: trimmed });
  return items.slice(0, 20);
}
