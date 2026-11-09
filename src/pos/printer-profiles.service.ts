// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Shared printer profiles (TechDocs/POS_PRINTER_PROFILES.md, migration 100).
//
// A printer profile is the Cyrillic table a thermal printer reads text through
// and the `ESC t` number that selects it (`pos/src/lib/printerEncoding.ts`,
// Rust `hardware/encoding.rs`). A desktop till reports the one its owner picked
// once three documents have printed with it; the super admin approves one per
// driver; every till then gets the approved list and prints through it on a
// printer of that driver that its owner has not set up by hand.

import { pool } from '../db.js';

export const ENCODING_TABLES = ['windows1251', 'cp866', 'cp1125'] as const;
export type EncodingTable = (typeof ENCODING_TABLES)[number];

/** The `ESC t` number Epson's list gives each table — the till's `ENCODING_TABLES[].standard`. */
export const STANDARD_ESC_T: Record<EncodingTable, number> = { windows1251: 46, cp866: 17, cp1125: 44 };

/** A till reports after this many documents printed with one profile. */
export const REPORT_AFTER_PRINTS = 3;

/**
 * Different profiles one store may have reported. A shop has a few printers;
 * the cap keeps a staff token from filling the table with invented drivers.
 */
export const MAX_REPORTS_PER_STORE = 50;

export class PrinterProfileError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'PrinterProfileError';
  }
}

export interface ProfileInput {
  driver: string;
  table: EncodingTable;
  /** Always the number the profile selects — the standard one filled in. */
  esc_t: number;
}

/** The OS driver name, trimmed and with runs of spaces collapsed; null when blank or too long. */
export function normalizeDriver(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const driver = raw.replace(/\s+/g, ' ').trim();
  return driver.length >= 1 && driver.length <= 120 ? driver : null;
}

/** Driver + table + number from a request body, in words when something is off. */
export function parseProfile(body: unknown): ProfileInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const driver = normalizeDriver(b.driver);
  if (!driver) throw new PrinterProfileError(400, 'Потрібна назва драйвера принтера (до 120 символів).');
  const table = b.table;
  if (typeof table !== 'string' || !(ENCODING_TABLES as readonly string[]).includes(table)) {
    throw new PrinterProfileError(400, 'Невідома таблиця кодування.');
  }
  const raw = b.esc_t;
  let escT: number;
  if (raw === null || raw === undefined) escT = STANDARD_ESC_T[table as EncodingTable];
  else if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 255) escT = raw;
  else throw new PrinterProfileError(400, 'Номер таблиці (ESC t) — ціле число від 0 до 255.');
  return { driver, table: table as EncodingTable, esc_t: escT };
}

function parseTitle(raw: unknown): string {
  const title = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (title.length < 1 || title.length > 80) throw new PrinterProfileError(400, 'Назва — від 1 до 80 символів.');
  return title;
}

// ── The till ───────────────────────────────────────────────────────────────

/**
 * A till's report: «this driver printed `prints` documents with this profile».
 * One row per store and profile; a repeat only raises the count and the date.
 */
export async function reportProfile(storeId: number, body: unknown): Promise<void> {
  const profile = parseProfile(body);
  const b = (body ?? {}) as Record<string, unknown>;
  const prints =
    typeof b.prints === 'number' && Number.isInteger(b.prints) && b.prints >= 0 ? Math.min(b.prints, 1_000_000) : 0;
  const width = b.paper_width_mm === 58 || b.paper_width_mm === 80 ? b.paper_width_mm : null;
  const { rows } = await pool.query<{ n: string; mine: boolean }>(
    `SELECT COUNT(*) AS n,
            BOOL_OR(driver = $2 AND enc_table = $3 AND esc_t = $4) AS mine
       FROM pos_printer_profile_reports WHERE store_id = $1`,
    [storeId, profile.driver, profile.table, profile.esc_t]
  );
  if (Number(rows[0]?.n ?? 0) >= MAX_REPORTS_PER_STORE && !rows[0]?.mine) {
    throw new PrinterProfileError(429, 'Забагато різних принтерів від одного магазину.');
  }
  await pool.query(
    `INSERT INTO pos_printer_profile_reports (store_id, driver, enc_table, esc_t, paper_width_mm, prints)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (store_id, driver, enc_table, esc_t) DO UPDATE
       SET prints = GREATEST(pos_printer_profile_reports.prints, EXCLUDED.prints),
           paper_width_mm = COALESCE(EXCLUDED.paper_width_mm, pos_printer_profile_reports.paper_width_mm),
           last_reported_at = NOW()`,
    [storeId, profile.driver, profile.table, profile.esc_t, width, prints]
  );
}

export interface SharedProfile {
  driver: string;
  title: string;
  table: EncodingTable;
  esc_t: number;
}

/** What every till prints with on a printer its owner has not set up: the approved profiles. */
export async function listSharedProfiles(): Promise<SharedProfile[]> {
  const { rows } = await pool.query<{ driver: string; title: string; enc_table: EncodingTable; esc_t: number }>(
    `SELECT driver, title, enc_table, esc_t FROM pos_printer_profiles ORDER BY driver`
  );
  return rows.map((r) => ({ driver: r.driver, title: r.title, table: r.enc_table, esc_t: Number(r.esc_t) }));
}

// ── The super admin ────────────────────────────────────────────────────────

export interface SuperProfileReport {
  id: number;
  driver: string;
  table: EncodingTable;
  esc_t: number;
  paper_width_mm: number | null;
  prints: number;
  store_id: number;
  store_code: string;
  store_name: string;
  first_reported_at: string;
  last_reported_at: string;
  /** This exact profile is the approved one for its driver. */
  approved: boolean;
}

export interface SuperProfile {
  id: number;
  driver: string;
  title: string;
  table: EncodingTable;
  esc_t: number;
  source_store_id: number | null;
  source_store_code: string | null;
  approved_at: string;
  updated_at: string;
}

export async function superPrinterProfiles(): Promise<{ reports: SuperProfileReport[]; profiles: SuperProfile[] }> {
  const reports = await pool.query(
    `SELECT r.id, r.driver, r.enc_table, r.esc_t, r.paper_width_mm, r.prints, r.store_id,
            s.slug AS store_code, s.name AS store_name, r.first_reported_at, r.last_reported_at,
            (p.id IS NOT NULL) AS approved
       FROM pos_printer_profile_reports r
       JOIN pos_stores s ON s.id = r.store_id
       LEFT JOIN pos_printer_profiles p
              ON p.driver = r.driver AND p.enc_table = r.enc_table AND p.esc_t = r.esc_t
      ORDER BY r.driver, r.last_reported_at DESC`
  );
  const profiles = await pool.query(
    `SELECT p.id, p.driver, p.title, p.enc_table, p.esc_t, p.source_store_id, s.slug AS source_store_code,
            p.approved_at, p.updated_at
       FROM pos_printer_profiles p
       LEFT JOIN pos_stores s ON s.id = p.source_store_id
      ORDER BY p.driver`
  );
  return {
    reports: reports.rows.map((r) => ({
      id: Number(r.id),
      driver: r.driver,
      table: r.enc_table,
      esc_t: Number(r.esc_t),
      paper_width_mm: r.paper_width_mm === null ? null : Number(r.paper_width_mm),
      prints: Number(r.prints),
      store_id: Number(r.store_id),
      store_code: r.store_code,
      store_name: r.store_name,
      first_reported_at: new Date(r.first_reported_at).toISOString(),
      last_reported_at: new Date(r.last_reported_at).toISOString(),
      approved: Boolean(r.approved),
    })),
    profiles: profiles.rows.map(toSuperProfile),
  };
}

function toSuperProfile(r: any): SuperProfile {
  return {
    id: Number(r.id),
    driver: r.driver,
    title: r.title,
    table: r.enc_table,
    esc_t: Number(r.esc_t),
    source_store_id: r.source_store_id === null ? null : Number(r.source_store_id),
    source_store_code: r.source_store_code ?? null,
    approved_at: new Date(r.approved_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

async function readProfile(id: number): Promise<SuperProfile> {
  const { rows } = await pool.query(
    `SELECT p.id, p.driver, p.title, p.enc_table, p.esc_t, p.source_store_id, s.slug AS source_store_code,
            p.approved_at, p.updated_at
       FROM pos_printer_profiles p LEFT JOIN pos_stores s ON s.id = p.source_store_id
      WHERE p.id = $1`,
    [id]
  );
  if (!rows[0]) throw new PrinterProfileError(404, 'Профіль не знайдено.');
  return toSuperProfile(rows[0]);
}

/**
 * Approves a reported profile for every till: one per driver, so approving
 * another profile for a driver that has one REPLACES it — the super admin
 * changes their mind in one step.
 */
export async function approveReport(reportId: number, rawTitle: unknown): Promise<SuperProfile> {
  const title = parseTitle(rawTitle);
  const { rows } = await pool.query(
    `SELECT store_id, driver, enc_table, esc_t FROM pos_printer_profile_reports WHERE id = $1`,
    [reportId]
  );
  const report = rows[0];
  if (!report) throw new PrinterProfileError(404, 'Звіт не знайдено.');
  const saved = await pool.query<{ id: string }>(
    `INSERT INTO pos_printer_profiles (driver, title, enc_table, esc_t, source_store_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (driver) DO UPDATE
       SET title = EXCLUDED.title, enc_table = EXCLUDED.enc_table, esc_t = EXCLUDED.esc_t,
           source_store_id = EXCLUDED.source_store_id, approved_at = NOW(), updated_at = NOW()
     RETURNING id`,
    [report.driver, title, report.enc_table, report.esc_t, report.store_id]
  );
  return readProfile(Number(saved.rows[0].id));
}

export async function renameProfile(id: number, rawTitle: unknown): Promise<SuperProfile> {
  const title = parseTitle(rawTitle);
  const { rowCount } = await pool.query(
    `UPDATE pos_printer_profiles SET title = $2, updated_at = NOW() WHERE id = $1`,
    [id, title]
  );
  if (!rowCount) throw new PrinterProfileError(404, 'Профіль не знайдено.');
  return readProfile(id);
}

/** Takes an approved profile away from every till; the reports stay. */
export async function removeProfile(id: number): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM pos_printer_profiles WHERE id = $1`, [id]);
  if (!rowCount) throw new PrinterProfileError(404, 'Профіль не знайдено.');
}

/** Forgets one store's report (a mistaken or test one). */
export async function removeReport(id: number): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM pos_printer_profile_reports WHERE id = $1`, [id]);
  if (!rowCount) throw new PrinterProfileError(404, 'Звіт не знайдено.');
}
