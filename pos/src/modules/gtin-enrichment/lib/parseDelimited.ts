// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A CSV/TSV reader for supplier price lists.
 *
 * Written rather than pulled in because the awkward parts here are not the ones
 * a library solves. A price list from a Ukrainian wholesaler is typically "Save
 * as CSV" out of Excel, which means semicolons rather than commas and, often
 * enough, windows-1251 rather than UTF-8. Both are guessed from the bytes.
 */

export type DelimitedTable = {
  /** Column headers, or `Колонка N` when the file has no header row. */
  headers: string[];
  /** Data rows, padded to `headers.length`. */
  rows: string[][];
  delimiter: string;
  encoding: 'utf-8' | 'windows-1251';
};

const DELIMITERS = [';', ',', '\t', '|'] as const;

/**
 * Excel on a Ukrainian or Russian locale still writes windows-1251 unless told
 * otherwise. UTF-8 is tried first in strict mode: cp1251 text is almost always
 * invalid UTF-8, so a throw is a reliable signal rather than a guess.
 */
export function decodeBytes(buffer: ArrayBuffer): { text: string; encoding: DelimitedTable['encoding'] } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    // Strip the BOM Excel likes to prepend; it would end up inside the first header.
    return { text: text.replace(/^\uFEFF/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1251').decode(buffer), encoding: 'windows-1251' };
  }
}

/** The delimiter that yields the most columns on the first non-empty line. */
export function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  let best = ';';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    // Count outside quotes so a name like "Сукня, синя" does not vote for ','.
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === d) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC-4180-ish: quoted fields, `""` escapes, newlines allowed inside quotes. */
export function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field.trim());
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

export function parseDelimited(
  buffer: ArrayBuffer,
  opts: { hasHeader?: boolean } = {}
): DelimitedTable {
  const { text, encoding } = decodeBytes(buffer);
  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter);
  if (rows.length === 0) return { headers: [], rows: [], delimiter, encoding };

  const hasHeader = opts.hasHeader ?? true;
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const headers = hasHeader
    ? rows[0]!.map((h, i) => h || `Колонка ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Колонка ${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;

  return {
    headers: Array.from({ length: width }, (_, i) => headers[i] ?? `Колонка ${i + 1}`),
    rows: body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')),
    delimiter,
    encoding,
  };
}
