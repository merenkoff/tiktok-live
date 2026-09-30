// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Дитині 2 роки» → which size (TechDocs/POS_CLOTHING.md, phase C1d). The till's
// size finder: the cashier types what the customer said — an age or a height —
// and the variant picker lights the sizes that fit, plus the next one up for a
// child who is about to grow out of it (the Nike / Apple «Find Your Size»
// pattern, without a chart to read). Pure; reads the same ladder the order and
// the hints use, so a size it suggests is a size the picker can show.
//
// A suggestion is a convenience, never a claim about a particular child: the
// length decides, and the guide says so.

import { parseSize, rungForMonths, SIZE_LADDER, type Rung } from './sizeLadder';

/** What the customer said, reduced to one of two numbers. */
export type ChildQuery = { kind: 'age'; months: number } | { kind: 'height'; cm: number };

const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const HEIGHT = new RegExp(`^${NUMBER} ?(?:см|cm)\\.?$`);
const MONTHS = new RegExp(`^${NUMBER} ?(?:міс|місяць|місяці|місяців|м|mo|mos|month|months)\\.?$`);
const YEARS = new RegExp(`^${NUMBER} ?(?:р|рік|року|роки|років|рр|y|yr|yrs|year|years)\\.?$`);
const BARE = new RegExp(`^${NUMBER}$`);

const toNumber = (text: string) => Number(text.replace(',', '.'));

/**
 * What was typed → an age or a height, or null when it is neither:
 * «2 роки», «1,5 року», «півтора року», «18 міс», «98», «98 см». A bare number is
 * a height from 50 to 170 and an age in years up to 14 — what sits between
 * (a shoe size, a typo) is not guessed at.
 */
export function parseChildQuery(text: string): ChildQuery | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === '') return null;
  if (/^півтора( року| роки)?$/.test(t)) return { kind: 'age', months: 18 };
  if (/^піврока|^півроку$/.test(t)) return { kind: 'age', months: 6 };

  let m = HEIGHT.exec(t);
  if (m) {
    const cm = toNumber(m[1]!);
    return cm >= 40 && cm <= 180 ? { kind: 'height', cm } : null;
  }
  m = MONTHS.exec(t);
  if (m) {
    const months = toNumber(m[1]!);
    return months >= 0 && months <= 168 ? { kind: 'age', months } : null;
  }
  m = YEARS.exec(t);
  if (m) {
    const years = toNumber(m[1]!);
    return years >= 0 && years <= 14 ? { kind: 'age', months: Math.round(years * 12) } : null;
  }
  m = BARE.exec(t);
  if (m) {
    const n = toNumber(m[1]!);
    if (n >= 50 && n <= 170) return { kind: 'height', cm: n };
    if (n >= 0 && n <= 14) return { kind: 'age', months: Math.round(n * 12) };
  }
  return null;
}

/** The size a customer's words point at: a child of so many months wears… / so tall wears the first size that is not smaller. */
export function rungFor(query: ChildQuery): Rung | null {
  if (query.kind === 'age') return rungForMonths(query.months);
  const first = SIZE_LADDER[0]!;
  const last = SIZE_LADDER[SIZE_LADDER.length - 1]!;
  if (query.cm > last.cm) return null;
  if (query.cm <= first.cm) return first;
  return SIZE_LADDER.find((r) => r.cm >= query.cm) ?? null;
}

export interface Suggestion {
  /** The size the words point at, for the line under the field. */
  rung: Rung;
  /** Labels (as the picker has them) that cover that size. */
  fit: string[];
  /** Labels that cover the next one up — for a child who is about to grow. */
  room: string[];
}

/**
 * Which of the picker's size labels fit. A label is read onto the ladder with
 * `parseSize` (so «98», «98-104» and «2–3 роки» all count); one that is not on it
 * — a letter, a shoe — is simply never suggested. `room` holds labels that cover
 * the next size but not this one.
 */
export function suggestSizes(query: ChildQuery, labels: readonly string[]): Suggestion | null {
  const rung = rungFor(query);
  if (!rung) return null;
  const index = SIZE_LADDER.indexOf(rung);
  const next = SIZE_LADDER[index + 1] ?? null;
  const fit: string[] = [];
  const room: string[] = [];
  for (const label of labels) {
    const parsed = parseSize(label);
    if (!parsed) continue;
    if (parsed.low <= rung.cm && rung.cm <= parsed.high) fit.push(label);
    else if (next && parsed.low <= next.cm && next.cm <= parsed.high) room.push(label);
  }
  return { rung, fit, room };
}
