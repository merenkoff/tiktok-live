// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Shared printer profiles, the till's half (TechDocs/POS_PRINTER_PROFILES.md).
//
// A printer's Cyrillic profile is kept per printer name on this device
// (`printerEncoding:<name>`, `lib/printer.ts`). Two things are added here:
//
//   * REPORT: once three documents have printed with a profile the owner picked
//     by hand, the till sends «this DRIVER prints with this profile» to the
//     server, once per profile. The driver is the operating system's name for
//     it (Rust `os_printers.rs`), not the printer's own name, which is whatever
//     the shop called it.
//   * SHARE: the super admin approves one profile per driver; the till keeps
//     the approved list (`printerProfiles:shared`, so a till without a network
//     still has it) and prints through it on a printer whose owner has not
//     picked a profile. A profile the owner picked always wins.
//
// Nothing here may break printing: every function swallows its own failures.

import { invoke } from '@tauri-apps/api/core';
import { getMeta, setMeta } from '../offline/db';
import { api } from '../services/api';
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

/** How long the approved list is trusted before the till asks again. */
const SHARED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SHARED_KEY = 'printerProfiles:shared';

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

function isProfile(p: unknown): p is SharedPrinterProfile {
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

interface SharedCache {
  fetched_at: number;
  profiles: SharedPrinterProfile[];
}

let sharedMemo: SharedCache | null = null;
let refreshing: Promise<SharedPrinterProfile[]> | null = null;

async function readShared(): Promise<SharedCache> {
  if (sharedMemo) return sharedMemo;
  try {
    const raw = await getMeta<SharedCache>(SHARED_KEY);
    const profiles = Array.isArray(raw?.profiles) ? raw!.profiles.filter(isProfile) : [];
    sharedMemo = { fetched_at: typeof raw?.fetched_at === 'number' ? raw.fetched_at : 0, profiles };
  } catch {
    sharedMemo = { fetched_at: 0, profiles: [] };
  }
  return sharedMemo;
}

/** Asks the server for the approved list and keeps it. Never throws: the kept list stays on any failure. */
export function refreshSharedProfiles(): Promise<SharedPrinterProfile[]> {
  refreshing ??= (async () => {
    try {
      const data = await api.posRequest<{ profiles?: unknown }>('get', '/printer-profiles');
      const profiles = Array.isArray(data?.profiles) ? data.profiles.filter(isProfile) : [];
      sharedMemo = { fetched_at: Date.now(), profiles };
      await setMeta(SHARED_KEY, sharedMemo).catch(() => undefined);
      return profiles;
    } catch {
      return (await readShared()).profiles;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** The kept list, refreshed in the background once it is old — a print never waits for the network. */
export async function sharedProfiles(): Promise<SharedPrinterProfile[]> {
  const cache = await readShared();
  if (Date.now() - cache.fetched_at > SHARED_MAX_AGE_MS) void refreshSharedProfiles();
  return cache.profiles;
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
  const profiles = await sharedProfiles();
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

interface ReportState {
  /** `driver|table|esc_t` — a changed profile starts the count again. */
  key: string;
  prints: number;
  reported: boolean;
}

const reportKey = (printerName: string) => `printerProfileReport:${printerName}`;

/**
 * After a document printed: count it toward the owner's own profile and, at
 * the third, report it. Only the owner's own pick is reported — the approved
 * profile is already known, and the default says nothing. Never throws.
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
    const key = `${driver}|${encoding.table}|${effectiveEscT(encoding)}`;
    const saved = await getMeta<ReportState>(reportKey(printerName));
    const state: ReportState =
      saved && saved.key === key ? { ...saved, prints: saved.prints + 1 } : { key, prints: 1, reported: false };
    if (state.prints >= REPORT_AFTER_PRINTS && !state.reported) {
      try {
        await api.posRequest('post', '/printer-profiles/report', {
          driver,
          table: encoding.table,
          esc_t: effectiveEscT(encoding),
          prints: state.prints,
          paper_width_mm: paperWidthMm === 80 ? 80 : 58,
        });
        state.reported = true;
      } catch {
        // No network or no session: the next print tries again.
      }
    }
    await setMeta(reportKey(printerName), state);
  } catch {
    // Never in the way of printing.
  }
}

/** Test seam: forget what this run has read. */
export function resetPrinterProfilesForTests(): void {
  drivers.clear();
  driversRead = null;
  sharedMemo = null;
  refreshing = null;
  noting = Promise.resolve();
}
