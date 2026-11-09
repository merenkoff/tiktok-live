// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which character table a thermal printer reads Cyrillic through, pure.
//
// A receipt printer holds a few 256-character tables and `ESC t n` picks one.
// Two things must agree: the table the text is ENCODED for (`table`) and the
// number the printer's firmware gives that table (`esc_t`). The numbers follow
// Epson's list, and plenty of 58 mm printers do not: they ignore a number they
// do not have, stay on CP437 and print every Cyrillic letter as a box-drawing or
// math symbol. Nothing on the wire says that happened, so the owner picks the
// profile by eye from a test sheet (`printEncodingTest`) and this device
// remembers it per printer. Rust side: `src-tauri/src/hardware/encoding.rs`.

export type PrinterEncodingTable = 'windows1251' | 'cp866' | 'cp1125';

export interface PrinterEncoding {
  table: PrinterEncodingTable;
  /** `ESC t n`. Null = the table's standard number (`standard` below). */
  esc_t: number | null;
}

/** What every release before encoding profiles printed with. */
export const DEFAULT_PRINTER_ENCODING: PrinterEncoding = { table: 'windows1251', esc_t: null };

export interface EncodingTableInfo {
  id: PrinterEncodingTable;
  title: string;
  /** The `ESC t` number Epson's list gives it — pinned to Rust's `standard_number` by a test. */
  standard: number;
  /** One sentence for the owner: what it can print. */
  note: string;
}

export const ENCODING_TABLES: EncodingTableInfo[] = [
  { id: 'windows1251', title: 'Windows-1251', standard: 46, note: 'усі українські літери' },
  { id: 'cp866', title: 'CP866', standard: 17, note: 'без «і» і «ґ»: друкуються як «i» і «г»' },
  { id: 'cp1125', title: 'CP1125', standard: 44, note: 'усі українські літери' },
];

const TABLE_IDS = ENCODING_TABLES.map((t) => t.id);

export function tableInfo(id: PrinterEncodingTable): EncodingTableInfo {
  return ENCODING_TABLES.find((t) => t.id === id) ?? ENCODING_TABLES[0];
}

/** The number a profile actually selects: its own, or its table's standard one. */
export function effectiveEscT(encoding: PrinterEncoding): number {
  return encoding.esc_t ?? tableInfo(encoding.table).standard;
}

/** «Windows-1251 · таблиця 46» — what the picker and the summary say. */
export function encodingTitle(encoding: PrinterEncoding): string {
  return `${tableInfo(encoding.table).title} · таблиця ${effectiveEscT(encoding)}`;
}

/** Two profiles that select the same table by the same number are the same profile. */
export function sameEncoding(a: PrinterEncoding, b: PrinterEncoding): boolean {
  return a.table === b.table && effectiveEscT(a) === effectiveEscT(b);
}

function isEscT(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255;
}

/**
 * A profile read back from the device's settings. A value written by hand, by an
 * older build or by a future one must never reach the printer as garbage, so
 * anything that is not a known table and a whole number 0–255 falls back piece
 * by piece to the default — a printer that was never set up prints as it always did.
 */
export function normalizeEncoding(raw: unknown): PrinterEncoding {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRINTER_ENCODING };
  const { table, esc_t } = raw as { table?: unknown; esc_t?: unknown };
  return {
    table: TABLE_IDS.includes(table as PrinterEncodingTable)
      ? (table as PrinterEncodingTable)
      : DEFAULT_PRINTER_ENCODING.table,
    esc_t: isEscT(esc_t) ? esc_t : null,
  };
}

/**
 * What the owner types into «Номер таблиці»: empty = the standard number, a
 * whole number 0–255 = that number, anything else is refused (`'invalid'`).
 */
export function parseEscT(text: string): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,3}$/.test(t)) return 'invalid';
  const n = Number(t);
  return n <= 255 ? n : 'invalid';
}

/** One profile to print on the test sheet; `label` is the letter the screen matches it by. */
export interface EncodingCandidate {
  table: PrinterEncodingTable;
  esc_t: number | null;
  label?: string;
}

/**
 * The profiles worth trying first, each with the letter that is printed above
 * its sample and shown next to its choice on screen — «A» on paper is «A» in the
 * list. Windows-1251 first: it is the default, so a printer that already works
 * shows its line right under «A».
 */
export const ENCODING_PRESETS: { letter: string; encoding: PrinterEncoding }[] = [
  { letter: 'A', encoding: { table: 'windows1251', esc_t: null } },
  { letter: 'B', encoding: { table: 'cp866', esc_t: null } },
  { letter: 'C', encoding: { table: 'cp1125', esc_t: null } },
];

export function presetCandidates(): EncodingCandidate[] {
  return ENCODING_PRESETS.map((p) => ({ ...p.encoding, label: p.letter }));
}

/** `ESC t` takes one byte; a sheet of more rows than there are numbers is a mistake. */
export const MAX_SWEEP = 256;

/**
 * One row per table number in `from..=to`, all through the same encoding: the
 * printer decides which number carries a table it really has, and the owner
 * reads it off the paper. Bounds are clamped to 0–255 and swapped if backwards.
 */
export function sweepCandidates(table: PrinterEncodingTable, from: number, to: number): EncodingCandidate[] {
  const lo = Math.max(0, Math.min(255, Math.trunc(Math.min(from, to))));
  const hi = Math.max(0, Math.min(255, Math.trunc(Math.max(from, to))));
  const rows: EncodingCandidate[] = [];
  for (let n = lo; n <= hi && rows.length < MAX_SWEEP; n++) rows.push({ table, esc_t: n });
  return rows;
}

/** The device-settings key a printer's profile lives under: per printer, because a café's kitchen and bar differ. */
export function printerEncodingMetaKey(printerName: string): string {
  return `printerEncoding:${printerName}`;
}
