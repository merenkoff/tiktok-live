// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  MANUAL_GAP_MS,
  SCAN_MAX_GAP_MS,
  createScanDetector,
  scannedChar,
  type ScanKey,
  type ScanVerdict,
} from './scanDetector';

type Key = Partial<ScanKey> & { key: string };

/** Feeds `text` then Enter, `gap` ms apart, and returns the verdict on Enter. */
function type(
  text: string,
  { gap, field = null, start = 1000, enterGap = gap }: { gap: number; field?: EventTarget | null; start?: number; enterGap?: number }
): ScanVerdict {
  const d = createScanDetector();
  let t = start;
  for (const ch of text) {
    d.feed(key({ key: ch, code: codeOf(ch), time: t, field }));
    t += gap;
  }
  return d.feed(key({ key: 'Enter', code: 'Enter', time: t - gap + enterGap, field }));
}

function key(k: Key): ScanKey {
  return {
    code: '',
    shiftKey: false,
    capsLock: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    time: 0,
    field: null,
    ...k,
  };
}

function codeOf(ch: string): string {
  if (/[0-9]/.test(ch)) return `Digit${ch}`;
  if (/[a-z]/i.test(ch)) return `Key${ch.toUpperCase()}`;
  return '';
}

/** A stand-in for the focused search box: the detector only reads `value`. */
function field(value: string): EventTarget {
  return Object.assign(new EventTarget(), { value });
}

describe('with nothing editable focused (the page, a tile, a button)', () => {
  it('takes a scanner burst', () => {
    expect(type('4820000000213', { gap: 4 })).toEqual({
      kind: 'scan',
      code: '4820000000213',
      field: null,
      restore: null,
    });
  });

  it('takes a code typed by hand too — what the hidden input used to accept', () => {
    expect(type('12345', { gap: 400 })).toMatchObject({ kind: 'scan', code: '12345' });
  });

  it('starts afresh after a long pause, so a stray key does not prefix the next scan', () => {
    const d = createScanDetector();
    d.feed(key({ key: 'r', code: 'KeyR', time: 0 }));
    let t = MANUAL_GAP_MS + 500;
    for (const ch of '4820000000213') {
      d.feed(key({ key: ch, code: codeOf(ch), time: t }));
      t += 5;
    }
    expect(d.feed(key({ key: 'Enter', time: t }))).toMatchObject({ kind: 'scan', code: '4820000000213' });
  });

  it('lets a bare Enter through — the cashier pressing the focused button', () => {
    const d = createScanDetector();
    expect(d.feed(key({ key: 'Enter', time: 0 }))).toEqual({ kind: 'pass' });
  });
});

describe('inside a text field (the search box)', () => {
  it('takes a burst for a scan and gives the field back the text it had before', () => {
    const search = field('джинси');
    expect(type('4820000000213', { gap: 5, field: search })).toEqual({
      kind: 'scan',
      code: '4820000000213',
      field: search,
      restore: 'джинси',
    });
  });

  it('leaves the cashier their own typing, Enter and all', () => {
    expect(type('4820000000213', { gap: 120, field: field('') })).toEqual({ kind: 'pass' });
    expect(type('футболка', { gap: 90, field: field('') })).toEqual({ kind: 'pass' });
  });

  it('does not mistake two fast keys for a scan', () => {
    expect(type('ab', { gap: 10, field: field('') })).toEqual({ kind: 'pass' });
  });

  it('keeps a key typed by hand before the burst in the box', () => {
    const d = createScanDetector();
    const search = Object.assign(new EventTarget(), { value: '' });
    d.feed(key({ key: 'ш', code: 'KeyI', time: 0, field: search }));
    search.value = 'ш';
    let t = SCAN_MAX_GAP_MS + 200;
    for (const ch of '4820000000213') {
      d.feed(key({ key: ch, code: codeOf(ch), time: t, field: search }));
      search.value += ch;
      t += 5;
    }
    expect(d.feed(key({ key: 'Enter', time: t, field: search }))).toEqual({
      kind: 'scan',
      code: '4820000000213',
      field: search,
      restore: 'ш',
    });
  });

  it('waits only so long for the scanner’s Enter', () => {
    expect(type('4820000000213', { gap: 5, enterGap: 600, field: field('') })).toEqual({ kind: 'pass' });
  });
});

describe('keys that end or survive a run', () => {
  it('keeps Shift inside the run — it is how a scanner types a capital letter', () => {
    const d = createScanDetector();
    let t = 0;
    for (const [k, c, shift] of [
      ['Shift', 'ShiftLeft', true],
      ['J', 'KeyJ', true],
      ['N', 'KeyN', true],
      ['S', 'KeyS', true],
      ['-', 'Minus', false],
      ['2', 'Digit2', false],
      ['8', 'Digit8', false],
    ] as const) {
      d.feed(key({ key: k, code: c, shiftKey: shift, time: t }));
      t += 3;
    }
    expect(d.feed(key({ key: 'Enter', time: t }))).toMatchObject({ kind: 'scan', code: 'JNS-28' });
  });

  it('drops the run on a shortcut', () => {
    const d = createScanDetector();
    d.feed(key({ key: '1', code: 'Digit1', time: 0 }));
    d.feed(key({ key: 'c', code: 'KeyC', ctrlKey: true, time: 2 }));
    expect(d.feed(key({ key: 'Enter', time: 4 }))).toEqual({ kind: 'pass' });
  });

  it('drops the run when the focus moved to another field', () => {
    const d = createScanDetector();
    const a = field('');
    const b = field('');
    for (const [i, ch] of [...'48200'].entries()) d.feed(key({ key: ch, code: codeOf(ch), time: i * 3, field: a }));
    expect(d.feed(key({ key: 'Enter', time: 20, field: b }))).toEqual({ kind: 'pass' });
  });
});

describe('scannedChar', () => {
  it('reads an article off the physical keys on a till switched to Ukrainian', () => {
    // KeyJ, KeyN, KeyS under the Ukrainian layout.
    expect(scannedChar('О', 'KeyJ', true)).toBe('J');
    expect(scannedChar('т', 'KeyN', false)).toBe('n');
    expect(scannedChar('І', 'KeyS', false, true)).toBe('S');
    expect(scannedChar('_', 'Minus', true)).toBe('_');
  });

  it('keeps what an ASCII layout typed', () => {
    expect(scannedChar('7', 'Digit7', false)).toBe('7');
    expect(scannedChar('A', 'KeyA', true)).toBe('A');
    expect(scannedChar('-', 'Minus', false)).toBe('-');
  });

  it('maps the number pad', () => {
    expect(scannedChar('5', 'Numpad5', false)).toBe('5');
  });
});
