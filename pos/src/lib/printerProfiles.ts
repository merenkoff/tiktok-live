// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Shared printer profiles, the till's half (TechDocs/POS_PRINTER_PROFILES.md).
//
// A printer's Cyrillic profile is kept per printer name on this device
// (`printerEncoding:<name>`, `lib/printer.ts`). Two things are added here:
//
//   * REPORT: once three documents have printed with a profile the owner picked
//     by hand, the print is marked for reporting «this DRIVER prints with this
//     profile», once per profile. The driver is the operating system's name for
//     it (Rust `os_printers.rs`), not the printer's own name, which is whatever
//     the shop called it.
//   * SHARE: the super admin approves one profile per driver; the till keeps
//     the approved list (`printerProfiles:shared`, so a till without a network
//     still has it) and prints through it on a printer whose owner has not
//     picked a profile. A profile the owner picked always wins.
//
// This file talks to no server: it is part of the `@pos/platform` chunk
// (`lib/printer.ts` is), and the api singleton must not be reached from there
// (`npm run check:platform-boundary`). What crosses the network — sending the
// marked reports, fetching the approved list — is the host's
// `offline/printerProfilesSync.ts`, run with every sync pass. Both halves meet
// in the device's settings, which is also why nothing here keeps a copy in
// memory: the host's copy of this file and the platform chunk's must agree.
//
// Nothing here may break printing: every function swallows its own failures.

import { invoke } from '@tauri-apps/api/core';
import { db, getMeta, setMeta } from '../offline/db';
import {
  DEFAULT_PRINTER_ENCODING,
  effectiveEscT,
  normalizeEncoding,
  printerEncodingMetaKey,
  type PrinterEncoding,
  type PrinterEncodingTable,
} from './printerEncoding';

/** A till reports after this many documents printed with one profile — the server's `REPORT_AFTER_PRINTS`. */
export const REPORT_AFTER_PRINTS = 3;

/** Where the approved list is kept on the device. */
export const SHARED_PROFILES_KEY = 'printerProfiles:shared';

export interface SharedPrinterProfile {
  driver: string;
  /** The super admin's readable name — «Xprinter XP-58IIH». */
  title: string;
  table: PrinterEncodingTable;
  esc_t: number;
}

/** Where the profile a printer prints with came from. */
export type PrinterEncodingSource = 'own' | 'shared' | 'default';

export interface ResolvedPrinterEncoding {
  encoding: PrinterEncoding;
  source: PrinterEncodingSource;
  /** The approved profile for this printer's driver, whether or not it is in force. */
  shared: SharedPrinterProfile | null;
  /** The operating system's driver name; '' when unknown. */
  driver: string;
}

/** The server's `normalizeDriver`: trimmed, runs of spaces collapsed. */
export function normalizeDriver(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

/** The approved profile for `driver`, or null. */
export function sharedFor(profiles: SharedPrinterProfile[], driver: string): SharedPrinterProfile | null {
  const d = normalizeDriver(driver);
  if (!d) return null;
  return profiles.find((p) => normalizeDriver(p.driver) === d) ?? null;
}

/**
 * Which profile prints: the owner's own when they picked one (`own` is the raw
 * stored value — an object; `null`/absent means never picked or taken back),
 * else the approved one for the driver, else the default.
 */
export function chooseEncoding(
  own: unknown,
  shared: SharedPrinterProfile | null
): { encoding: PrinterEncoding; source: PrinterEncodingSource } {
  if (own && typeof own === 'object') return { encoding: normalizeEncoding(own), source: 'own' };
  if (shared) return { encoding: normalizeEncoding({ table: shared.table, esc_t: shared.esc_t }), source: 'shared' };
  return { encoding: { ...DEFAULT_PRINTER_ENCODING }, source: 'default' };
}

export function isSharedProfile(p: unknown): p is SharedPrinterProfile {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.driver === 'string' &&
    typeof o.title === 'string' &&
    (o.table === 'windows1251' || o.table === 'cp866' || o.table === 'cp1125') &&
    typeof o.esc_t === 'number' &&
    Number.isInteger(o.esc_t) &&
    o.esc_t >= 0 &&
    o.esc_t <= 255
  );
}

// ── Drivers of this device's printers ─────────────────────────────────────

const drivers = new Map<string, string>();
let driversRead: Promise<void> | null = null;

/** Called with every printer list the OS gives (`listPrinters`), so a print never has to ask again. */
export function rememberDrivers(printers: Array<{ name: string; driver?: string }>): void {
  if (!Array.isArray(printers)) return;
  for (const p of printers) {
    if (p && typeof p.name === 'string') drivers.set(p.name, normalizeDriver(p.driver));
  }
}

/** The driver of a printer by name; asks the OS once per run of the app when it has not been told. */
export async function driverOf(printerName: string): Promise<string> {
  if (!drivers.has(printerName)) {
    driversRead ??= invoke<unknown>('list_printers')
      .then((list) => rememberDrivers(Array.isArray(list) ? (list as Array<{ name: string; driver?: string }>) : []))
      .catch(() => undefined);
    await driversRead;
  }
  return drivers.get(printerName) ?? '';
}

// ── The approved list ─────────────────────────────────────────────────────

export interface SharedProfilesCache {
  /** `Date.now()` of the last answer from the server; 0 = never. */
  fetched_at: number;
  profiles: SharedPrinterProfile[];
}

/** The kept list as it is on the device; empty when never fetched or unreadable. */
export async function readSharedProfiles(): Promise<SharedProfilesCache> {
  try {
    const raw = await getMeta<SharedProfilesCache>(SHARED_PROFILES_KEY);
    return {
      fetched_at: typeof raw?.fetched_at === 'number' ? raw.fetched_at : 0,
      profiles: Array.isArray(raw?.profiles) ? raw!.profiles.filter(isSharedProfile) : [],
    };
  } catch {
    return { fetched_at: 0, profiles: [] };
  }
}

/** Keeps a fresh answer from the server (`offline/printerProfilesSync.ts`). */
export async function saveSharedProfiles(profiles: unknown): Promise<SharedPrinterProfile[]> {
  const list = Array.isArray(profiles) ? profiles.filter(isSharedProfile) : [];
  await setMeta(SHARED_PROFILES_KEY, { fetched_at: Date.now(), profiles: list } satisfies SharedProfilesCache);
  return list;
}

// ── Resolving and reporting ───────────────────────────────────────────────

/** The profile a printer prints with and where it came from (`lib/printer.ts`, `PrinterEncodingPicker`). */
export async function resolvePrinterEncoding(printerName: string): Promise<ResolvedPrinterEncoding> {
  let own: unknown = null;
  try {
    own = await getMeta<unknown>(printerEncodingMetaKey(printerName));
  } catch {
    own = null;
  }
  const { profiles } = await readSharedProfiles();
  // The OS is asked for the driver only when it can matter: a list to match
  // against, or the owner's own pick to report.
  const needDriver = profiles.length > 0 || (own !== null && typeof own === 'object');
  const driver = needDriver ? await driverOf(printerName) : '';
  const shared = sharedFor(profiles, driver);
  return { ...chooseEncoding(own, shared), shared, driver };
}

/** Takes back the owner's own pick, so the printer follows the approved profile (or the default). */
export function forgetOwnEncoding(printerName: string): Promise<void> {
  return setMeta(printerEncodingMetaKey(printerName), null);
}

/** What one printer's count stands at — `printerProfileReport:<name>` on the device. */
export interface PrinterReportState {
  /** `driver|table|esc_t` — a changed profile starts the count again. */
  key: string;
  driver: string;
  table: PrinterEncodingTable;
  /** The number the profile selects (the standard one filled in). */
  esc_t: number;
  paper_width_mm: 58 | 80;
  prints: number;
  /** The server has it. Until then a count of `REPORT_AFTER_PRINTS` or more is waiting to be sent. */
  reported: boolean;
}

export const REPORT_KEY_PREFIX = 'printerProfileReport:';

/** Counts waiting to be sent: the third document or later, not yet reported. */
export async function pendingReports(): Promise<Array<{ metaKey: string; state: PrinterReportState }>> {
  try {
    const rows = await db.meta.where('key').startsWith(REPORT_KEY_PREFIX).toArray();
    return rows
      .map((row) => ({ metaKey: row.key, state: row.value as PrinterReportState }))
      .filter(({ state }) => state && !state.reported && state.prints >= REPORT_AFTER_PRINTS && Boolean(state.driver));
  } catch {
    return [];
  }
}

/** The server took a report: unless the profile changed meanwhile, it is not sent again. */
export async function markReported(metaKey: string, key: string): Promise<void> {
  const state = await getMeta<PrinterReportState>(metaKey);
  if (state && state.key === key) await setMeta(metaKey, { ...state, reported: true });
}

/**
 * After a document printed: count it toward the owner's own profile. At the
 * third the count is waiting to be sent (`pendingReports`). Only the owner's
 * own pick is counted — the approved profile is already known, and the default
 * says nothing. Never throws.
 */
export function notePrinted(printerName: string, paperWidthMm: number): Promise<void> {
  // One at a time: two documents printed back to back must count as two.
  const next = noting.then(() => countPrint(printerName, paperWidthMm));
  noting = next;
  return next;
}

let noting: Promise<void> = Promise.resolve();

async function countPrint(printerName: string, paperWidthMm: number): Promise<void> {
  try {
    const own = await getMeta<unknown>(printerEncodingMetaKey(printerName));
    if (!own || typeof own !== 'object') return;
    const driver = await driverOf(printerName);
    if (!driver) return;
    const encoding = normalizeEncoding(own);
    const escT = effectiveEscT(encoding);
    const key = `${driver}|${encoding.table}|${escT}`;
    const metaKey = `${REPORT_KEY_PREFIX}${printerName}`;
    const saved = await getMeta<PrinterReportState>(metaKey);
    const state: PrinterReportState =
      saved && saved.key === key
        ? { ...saved, prints: saved.prints + 1 }
        : {
            key,
            driver,
            table: encoding.table,
            esc_t: escT,
            paper_width_mm: paperWidthMm === 80 ? 80 : 58,
            prints: 1,
            reported: false,
          };
    await setMeta(metaKey, state);
  } catch {
    // Never in the way of printing.
  }
}

/** Test seam: forget what this run has read. */
export function resetPrinterProfilesForTests(): void {
  drivers.clear();
  driversRead = null;
  noting = Promise.resolve();
}
