// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { decodeBytes, detectDelimiter, parseDelimited, parseRows } from './parseDelimited';

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe('decodeBytes', () => {
  it('reads UTF-8 and drops the BOM Excel prepends', () => {
    const out = decodeBytes(bytes('\uFEFFштрихкод;назва'));
    expect(out.encoding).toBe('utf-8');
    expect(out.text).toBe('штрихкод;назва');
  });

  it('falls back to windows-1251 when the bytes are not valid UTF-8', () => {
    // "Назва" in cp1251 — invalid as UTF-8, which is exactly the signal.
    const cp1251 = new Uint8Array([0xcd, 0xe0, 0xe7, 0xe2, 0xe0]);
    const out = decodeBytes(cp1251.buffer as ArrayBuffer);
    expect(out.encoding).toBe('windows-1251');
    expect(out.text).toBe('Назва');
  });
});

describe('detectDelimiter', () => {
  it('prefers the separator that actually splits the header', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
  });

  it('ignores separators inside quotes', () => {
    // Commas live inside the product name; semicolons are the real separator.
    expect(detectDelimiter('"Сукня, синя";4820000000017')).toBe(';');
  });
});

describe('parseRows', () => {
  it('handles quotes, escaped quotes and newlines inside a field', () => {
    const rows = parseRows('a;"b;still b";"say ""hi"""\n"line\nbreak";2;3', ';');
    expect(rows[0]).toEqual(['a', 'b;still b', 'say "hi"']);
    expect(rows[1]).toEqual(['line\nbreak', '2', '3']);
  });

  it('drops entirely blank lines', () => {
    expect(parseRows('a;b\n\n;\nc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('parseDelimited', () => {
  it('reads a header row and pads short rows to full width', () => {
    const t = parseDelimited(bytes('штрихкод;назва;бренд\n4820000000017;Боді;Acme\n4820000000024;Піжама'));
    expect(t.headers).toEqual(['штрихкод', 'назва', 'бренд']);
    expect(t.rows).toEqual([
      ['4820000000017', 'Боді', 'Acme'],
      ['4820000000024', 'Піжама', ''],
    ]);
    expect(t.delimiter).toBe(';');
  });

  it('names the columns itself when the file has no header row', () => {
    const t = parseDelimited(bytes('4820000000017;Боді'), { hasHeader: false });
    expect(t.headers).toEqual(['Колонка 1', 'Колонка 2']);
    expect(t.rows).toEqual([['4820000000017', 'Боді']]);
  });

  it('survives an empty file', () => {
    expect(parseDelimited(bytes('')).rows).toEqual([]);
  });
});
