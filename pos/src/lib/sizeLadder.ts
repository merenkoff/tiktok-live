// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/sizeLadder.ts — one ladder of children's sizes with two names
// (TechDocs/POS_CLOTHING.md, phase C1d).
//
// A baby's size is written two ways that mean the same thing: a HEIGHT in
// centimetres («86» — the garment fits a child up to about 86 cm) and an AGE
// («12–18 міс»). The European label is the height and the age is a hint; the
// British one is the age range. A shop that mixes them (one costume with both
// «3–6 міс» and «62» on it) is not wrong — they are the same rung of one ladder.
//
// This module is that ladder and nothing else: pure, no I/O. It is used to
//   · read a size label (`parseSize`) — so the order can put «3–6 міс» between
//     «62» and «74», which a text or number comparison cannot;
//   · write an age label (`monthsLabel`, `yearsLabel`) — «3–4 роки», never a bare
//     «4» that could be an age, a height or a shoe;
//   · explain a size in the other system (`sizeHint`) — «12–18 міс» under «86»,
//     «≈ 104 см» under «3–4 роки». A hint is always approximate and never said
//     about a particular child: when age and length disagree, follow the length.
//
// The till's copy of `src/pos/verticals/sizeLadder.ts` (the offline till sorts
// and explains with its own); `sizeLadder.test.ts` here and `pos.size-ladder.test.ts`
// there pin the same table of cases, so the two can never read a label differently.

/** One size: the height it is named after and the age (in months) it fits, `from` ≤ age < `to`. */
export interface Rung {
  cm: number;
  from: number;
  to: number;
}

/**
 * The ladder, in the order the British and Ukrainian charts agree on it:
 * 62 is 1–3 months, 68 is 3–6, 74 is 6–9, 80 is 9–12, 86 is 12–18, 92 is
 * 18–24 months, 98 is 2–3 years, 104 is 3–4 … 164 is 13–14.
 */
export const SIZE_LADDER: readonly Rung[] = [
  { cm: 56, from: 0, to: 1 },
  { cm: 62, from: 1, to: 3 },
  { cm: 68, from: 3, to: 6 },
  { cm: 74, from: 6, to: 9 },
  { cm: 80, from: 9, to: 12 },
  { cm: 86, from: 12, to: 18 },
  { cm: 92, from: 18, to: 24 },
  { cm: 98, from: 24, to: 36 },
  { cm: 104, from: 36, to: 48 },
  { cm: 110, from: 48, to: 60 },
  { cm: 116, from: 60, to: 72 },
  { cm: 122, from: 72, to: 84 },
  { cm: 128, from: 84, to: 96 },
  { cm: 134, from: 96, to: 108 },
  { cm: 140, from: 108, to: 120 },
  { cm: 146, from: 120, to: 132 },
  { cm: 152, from: 132, to: 144 },
  { cm: 158, from: 144, to: 156 },
  { cm: 164, from: 156, to: 168 },
];

const LAST_MONTH = SIZE_LADDER[SIZE_LADDER.length - 1]!.to;

/** A height label outside this range is not a child's height (a belt, a shoe). */
const MIN_CM = 50;
const MAX_CM = 170;

export function rungByCm(cm: number): Rung | null {
  return SIZE_LADDER.find((r) => r.cm === cm) ?? null;
}

/** The size a child of `months` months wears: `from` ≤ months < `to`, the last one for anyone older. */
export function rungForMonths(months: number): Rung | null {
  if (!(months >= 0)) return null;
  if (months >= LAST_MONTH) return SIZE_LADDER[SIZE_LADDER.length - 1]!;
  return SIZE_LADDER.find((r) => months >= r.from && months < r.to) ?? null;
}

/** The smallest size whose range reaches `months` — the size an «up to N months» label is named after. */
export function rungUpTo(months: number): Rung | null {
  if (!(months >= 0) || months > LAST_MONTH) return null;
  return SIZE_LADDER.find((r) => r.to >= months) ?? null;
}

/** Ukrainian plural: 1 рік, 2–4 роки, 5–20 років, 21 рік … */
function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const tens = abs % 100;
  const units = abs % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

const years = (n: number) => plural(n, 'рік', 'роки', 'років');

/** «3–6 міс» — the label a size in months is saved under. */
export function monthsLabel(from: number, to: number): string {
  return `${from}–${to} міс`;
}

/** «3–4 роки», «5–6 років» — the label a size in years is saved under (the word agrees with the last number). */
export function yearsLabel(from: number, to: number): string {
  return `${from}–${to} ${years(to)}`;
}

/**
 * An age range from the ladder, worded for a hint: months while it ends by two
 * years, years after. `12–24 міс`, `3–4 роки`, `18 міс–4 роки`.
 */
export function formatAgeRange(from: number, to: number): string {
  if (to <= 24) return monthsLabel(from, to);
  const left = from % 12 === 0 ? String(from / 12) : `${from} міс`;
  const right = to / 12;
  return `${left}–${right} ${years(right)}`;
}

export type SizeKind = 'height' | 'months' | 'years';

/** A size label read onto the ladder: what it is written in, and the first and last heights it covers. */
export interface ParsedSize {
  kind: SizeKind;
  /** Height (cm) of the smallest size it covers. */
  low: number;
  /** Height (cm) of the largest — the size it is named after, and what the order goes by. */
  high: number;
}

/** `98/104`, `98–104` and `98—104` are all `98-104`; any run of spaces is one. */
function tidy(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[–—/]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

const HEIGHT = /^(\d{2,3})(?:-(\d{2,3}))?(?: ?см)?$/;
const MONTHS = /^(\d{1,2})(?:-(\d{1,2}))? ?(?:міс|місяць|місяці|місяців)\.?$/;
const YEARS = /^(\d{1,2})-(\d{1,2}) ?(?:р|рік|роки|років|рр)\.?$/;

/**
 * Reads a size label onto the ladder, or null when it is not one of the three
 * kinds this knows: a height («86», «98-104»), an age in months («3–6 міс») or
 * an age in years («3–4 роки»). Deliberately NOT a bare small number — «4» could
 * be an age, a height, a shoe or a count, and guessing is how a size ends up
 * wrong; the owner's own digits keep the old number-by-number order.
 */
export function parseSize(text: string): ParsedSize | null {
  const t = tidy(text);

  let m = HEIGHT.exec(t);
  if (m) {
    const low = Number(m[1]);
    const high = m[2] === undefined ? low : Number(m[2]);
    if (low < MIN_CM || high > MAX_CM || low > high) return null;
    if (m[2] !== undefined && low === high) return null;
    return { kind: 'height', low, high };
  }

  m = MONTHS.exec(t);
  if (m) {
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from > to) return null;
    const low = rungForMonths(from);
    const high = rungUpTo(to);
    if (!low || !high) return null;
    return { kind: 'months', low: Math.min(low.cm, high.cm), high: high.cm };
  }

  m = YEARS.exec(t);
  if (m) {
    const from = Number(m[1]);
    const to = Number(m[2]);
    if (from >= to) return null;
    const low = rungForMonths(from * 12);
    const high = rungUpTo(to * 12);
    if (!low || !high) return null;
    return { kind: 'years', low: Math.min(low.cm, high.cm), high: high.cm };
  }

  return null;
}

/** «≈ 104 см», «≈ 56–62 см». */
function heightRange(low: number, high: number): string {
  return low === high ? `≈ ${low} см` : `≈ ${low}–${high} см`;
}

/**
 * The same size in the other system: an age under a height («86» → «12–18 міс»,
 * «98-104» → «2–4 роки»), a height under an age («3–4 роки» → «≈ 104 см»). Null
 * for anything that is not on the ladder — a hint is never a guess.
 */
export function sizeHint(text: string): string | null {
  const parsed = parseSize(text);
  if (!parsed) return null;
  if (parsed.kind === 'height') {
    const low = rungByCm(parsed.low);
    const high = rungByCm(parsed.high);
    if (!low || !high) return null;
    return formatAgeRange(low.from, high.to);
  }
  return heightRange(parsed.low, parsed.high);
}
