// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/table-keys.ts — what lets a guest act on THEIR table.
// TechDocs/POS_QR_MENU.md, phase Q5.
//
// `?t=<table id>` (phase Q2) only captions the menu, and that is all it may do:
// the id is a plain integer from one sequence for every store, and the store's
// URL token is printed on every table, so a guest who has scanned any QR could
// otherwise walk the ids. Reading a table's bill needs a second thing that only
// the QR printed for that table carries — a random key.
//
// Two secrets live here, and they must not be confused:
//
//  - the TABLE KEY (`pos_tables.qr_key`): printed in the QR, so it is known to
//    whoever sits at the table. It opens THAT table's bill and nothing else.
//  - the PRINT LINK: a short-lived signed suffix (`?p=`) the owner's own
//    screens append when they open a print page. The print pages are the only
//    place a table key is ever written out, and they are reachable by the
//    store token that every guest can see — so without the suffix they print
//    QR codes with no key in them.
//
// This file imports nothing from `menu.service.ts` on purpose: the owner's
// settings (there) hand out the print link (here).

import crypto from 'crypto';
import { pool } from '../../db.js';

/** What a table key looks like in a URL. Checked before any query. */
export const TABLE_KEY_RE = /^[A-Za-z0-9_-]{8,32}$/;

/** How long a link the owner's screen was given keeps opening the print pages. */
export const PRINT_LINK_TTL_SECONDS = 6 * 60 * 60;

const PRINT_LINK_RE = /^\d{9,12}\.[A-Za-z0-9_-]{43}$/;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/** 72 bits: not guessable by a guest, short enough to print in a QR without making it dense. */
export function newTableKey(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// ── table keys ──────────────────────────────────────────────────────

/**
 * Give every table of the store that has no key one. Lazy on purpose: a table
 * created yesterday gets its key the first time somebody prints it, so neither
 * the migration nor `createTable` has to know about keys.
 */
export async function ensureTableKeys(storeId: number): Promise<void> {
  const missing = await pool.query(`SELECT id FROM pos_tables WHERE store_id = $1 AND qr_key IS NULL`, [storeId]);
  for (const row of missing.rows) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await pool.query(`UPDATE pos_tables SET qr_key = $2 WHERE id = $1 AND qr_key IS NULL`, [row.id, newTableKey()]);
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error;
      }
    }
  }
}

/** The keys of the store's tables, by table id — for the print pages, after `ensureTableKeys`. */
export async function getTableKeys(storeId: number): Promise<Map<number, string>> {
  await ensureTableKeys(storeId);
  const result = await pool.query(
    `SELECT id, qr_key FROM pos_tables WHERE store_id = $1 AND qr_key IS NOT NULL`,
    [storeId]
  );
  return new Map(result.rows.map((row) => [Number(row.id), String(row.qr_key)]));
}

/**
 * Is `key` the key printed for this table of this store? False for a missing
 * key, a malformed one, a table with no key yet and a key that belongs to
 * another table — the caller treats all of them as «no table mode», so a
 * stale or forged link degrades to the plain menu instead of an error.
 */
export async function verifyTableKey(storeId: number, tableId: number, key: unknown): Promise<boolean> {
  if (typeof key !== 'string' || !TABLE_KEY_RE.test(key)) return false;
  const result = await pool.query(`SELECT qr_key FROM pos_tables WHERE id = $1 AND store_id = $2`, [tableId, storeId]);
  const stored = result.rows[0]?.qr_key;
  return typeof stored === 'string' && sameString(stored, key);
}

// ── the print link ──────────────────────────────────────────────────

async function readSecret(storeId: number): Promise<string | null> {
  const result = await pool.query(`SELECT public_menu_secret FROM pos_stores WHERE id = $1`, [storeId]);
  const secret = result.rows[0]?.public_menu_secret;
  return typeof secret === 'string' && secret ? secret : null;
}

async function ensureSecret(storeId: number): Promise<string> {
  const existing = await readSecret(storeId);
  if (existing) return existing;
  // COALESCE keeps the first writer's value when two requests race.
  const result = await pool.query(
    `UPDATE pos_stores SET public_menu_secret = COALESCE(public_menu_secret, $2) WHERE id = $1 RETURNING public_menu_secret`,
    [storeId, crypto.randomBytes(24).toString('base64url')]
  );
  const secret = result.rows[0]?.public_menu_secret;
  if (typeof secret !== 'string') throw new Error('Магазин не знайдено');
  return secret;
}

function signature(secret: string, storeId: number, expires: number): string {
  return crypto.createHmac('sha256', secret).update(`print|${storeId}|${expires}`).digest('base64url');
}

/** A link suffix the owner's screen appends to a print page: `<expires>.<signature>`. */
export async function issuePrintLink(storeId: number, now = Date.now()): Promise<string> {
  const secret = await ensureSecret(storeId);
  const expires = Math.floor(now / 1000) + PRINT_LINK_TTL_SECONDS;
  return `${expires}.${signature(secret, storeId, expires)}`;
}

/** True only for a link this store's secret signed and that has not expired. */
export async function verifyPrintLink(storeId: number, link: unknown, now = Date.now()): Promise<boolean> {
  if (typeof link !== 'string' || !PRINT_LINK_RE.test(link)) return false;
  const [expiresText, given] = link.split('.') as [string, string];
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires * 1000 < now) return false;
  const secret = await readSecret(storeId);
  if (!secret) return false;
  return sameString(signature(secret, storeId, expires), given);
}
