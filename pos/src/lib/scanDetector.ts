// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Tells a keyboard-wedge barcode scanner apart from a person at the keyboard,
 * by speed, so the sell screen can take a scan wherever the focus happens to
 * be (`ScanWedge` feeds it every keydown of the window).
 *
 * It used to need the focus: the wedge was a hidden input that grabbed it
 * whenever the catalog became the active surface — and only then. A tap on a
 * tile, on «Очистити чек» or anywhere in the receipt moved the focus away while
 * the catalog stayed active, so nothing ever gave it back, and the scanner
 * typed into nowhere until someone clicked into the search box (2026-10-19).
 * Worse, with a tile still focused the scanner's Enter pressed that tile and
 * rang up the last tapped product instead of the scanned one.
 *
 * Two rules, by where the keys land:
 * - nothing editable has the focus (the page, a tile, a button): every
 *   printable key is collected at any speed, and Enter hands the collection
 *   over — exactly what typing into the old hidden input did, manual entry
 *   included;
 * - a text field has the focus (the search box): the keys are the person's,
 *   unless they arrive as a burst no hand can type — at least
 *   `SCAN_MIN_LENGTH` characters, each within `SCAN_MAX_GAP_MS` of the last,
 *   then Enter. Such a burst is a scan; the field gets back the text it held
 *   before the burst, so a half-typed search survives a scan.
 *
 * The characters are read from the physical key (`code`) whenever the layout
 * turned them into something outside ASCII: a scanner types as a US keyboard,
 * and on a till switched to Ukrainian the article «JNS-BLU-28» arrived as
 * «ОТІ-ИДГ-28». Digits are the same in both layouts, so EAN codes never
 * suffered; articles printed as Code 128 did.
 */

/** The longest pause between two keys of a scan. Scanners type every 1–20 ms; people every 80 ms and more. */
export const SCAN_MAX_GAP_MS = 60;
/** …and between the last character and the scanner's Enter. */
export const SCAN_ENTER_GAP_MS = 120;
/** The shortest burst taken for a scan inside a text field (EAN-8 is 8; short internal codes exist). */
export const SCAN_MIN_LENGTH = 4;
/** With nothing editable focused, a pause this long starts a fresh code: a stray key does not prefix the next scan. */
export const MANUAL_GAP_MS = 2000;

export interface ScanKey {
  key: string;
  code: string;
  shiftKey: boolean;
  capsLock: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  /** Milliseconds, any monotonic origin — only differences are read. */
  time: number;
  /** Where the key lands: the focused text field, or `null` for anything that is not one. */
  field: EventTarget | null;
}

export type ScanVerdict =
  /** Not a scan: let the key through untouched. */
  | { kind: 'pass' }
  /** A scan: swallow the Enter, put `restore` back into `field` when there is one, hand `code` over. */
  | { kind: 'scan'; code: string; field: EventTarget | null; restore: string | null };

/** Punctuation scanners put into articles, by physical key: [plain, with Shift]. */
const PUNCTUATION: Record<string, [string, string]> = {
  Minus: ['-', '_'],
  NumpadSubtract: ['-', '-'],
  Equal: ['=', '+'],
  NumpadAdd: ['+', '+'],
  Slash: ['/', '?'],
  NumpadDivide: ['/', '/'],
  Period: ['.', '>'],
  NumpadDecimal: ['.', '.'],
  Comma: [',', '<'],
  Space: [' ', ' '],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Backquote: ['`', '~'],
  NumpadMultiply: ['*', '*'],
};

/** The character a US keyboard would have typed for this key. */
export function scannedChar(key: string, code: string, shift: boolean, capsLock = false): string {
  if (/^[\x20-\x7e]$/.test(key)) return key;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return shift !== capsLock ? letter[1] : letter[1].toLowerCase();
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  const punctuation = PUNCTUATION[code];
  if (punctuation) return shift ? punctuation[1] : punctuation[0];
  return key;
}

/**
 * The keys typed since the last pause. Inside a text field a pause longer
 * than a scanner's starts a new run, so a run there is fast by construction.
 */
interface Run {
  chars: string;
  last: number;
  field: EventTarget | null;
  /** The field's text before the run's first key. */
  before: string | null;
}

function textOf(field: EventTarget | null): string | null {
  const value: unknown = (field as { value?: unknown } | null)?.value;
  return typeof value === 'string' ? value : null;
}

export function createScanDetector() {
  let run: Run | null = null;

  function feed(k: ScanKey): ScanVerdict {
    if (k.ctrlKey || k.altKey || k.metaKey || k.isComposing || k.key === 'Process' || k.repeat) {
      run = null;
      return { kind: 'pass' };
    }

    if (k.key === 'Enter') {
      const done = run;
      run = null;
      if (!done || !done.chars.trim() || done.field !== k.field) return { kind: 'pass' };
      const gap = k.time - done.last;
      if (done.field === null) {
        if (gap > MANUAL_GAP_MS) return { kind: 'pass' };
      } else if (done.chars.length < SCAN_MIN_LENGTH || gap > SCAN_ENTER_GAP_MS) {
        return { kind: 'pass' };
      }
      return { kind: 'scan', code: done.chars.trim(), field: done.field, restore: done.before };
    }

    // Shift is how a scanner types a capital letter: it belongs to the run.
    if (k.key === 'Shift' || k.key === 'CapsLock') return { kind: 'pass' };

    if (k.key.length !== 1) {
      run = null;
      return { kind: 'pass' };
    }

    const char = scannedChar(k.key, k.code, k.shiftKey, k.capsLock);
    const gap = run ? k.time - run.last : Infinity;
    const limit = k.field === null ? MANUAL_GAP_MS : SCAN_MAX_GAP_MS;
    if (!run || run.field !== k.field || gap > limit) {
      run = { chars: char, last: k.time, field: k.field, before: textOf(k.field) };
    } else {
      run.chars += char;
      run.last = k.time;
    }
    return { kind: 'pass' };
  }

  return {
    feed,
    reset(): void {
      run = null;
    },
  };
}
