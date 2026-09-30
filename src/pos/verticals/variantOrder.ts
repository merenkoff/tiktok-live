// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/variantOrder.ts — the order a product's variants are listed in
// (TechDocs/POS_CLOTHING.md, phase C0).
//
// Variants used to come out `ORDER BY v.label`, which is alphabetical text:
// «Чорний / L», «Чорний / M», «Чорний / S», «Чорний / XL», and «100» before
// «90». Nobody reads a size run like that. This is the order a person expects:
// colour (or whatever comes first) alphabetically, then sizes from smallest to
// largest — XXS, XS, S, M, L, XL, XXL… — and numbers as numbers (90 < 100,
// 28 < 104, «1,5 л» < «10 л»).
//
// Pure, and done after the query rather than in SQL: the label is a derived
// string, not a column a database can rank by size, and the catalogue's LIMIT
// must keep cutting on the same key it always did.

/** The separators a derived label joins its attributes with (`labelOf` — «Колір / Розмір»; a café caption — «M · вівсяне»). */
const PART_SEPARATOR = /\s*[/·]\s*/;

const collator = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

// A Ukrainian keyboard types «М», «Л», «С», «Х» as readily as the Latin ones,
// and to the eye they are the same size. Mapped after lower-casing.
const LOOKALIKES: Record<string, string> = { х: 'x', м: 'm', л: 'l', с: 's' };

/**
 * Where a clothing size sits on the ladder, or null when the text is not a
 * letter size at all. XS is 1, S 2, M 3, L 4, XL 5, then one more per X:
 * XXL 6, XXXL 7; 2XL is XXL, 3XL is XXXL; XXS is 0, XXXS −1.
 */
export function sizeRank(text: string): number | null {
  const compact = text
    .trim()
    .toLowerCase()
    .replace(/[\s.]/g, '')
    .replace(/[хмлс]/g, (ch) => LOOKALIKES[ch] ?? ch);
  switch (compact) {
    case 's':
      return 2;
    case 'm':
      return 3;
    case 'l':
      return 4;
    default:
      break;
  }
  // XS, XXS, XXXS … and 2XS, 3XS …
  let match = /^(x{1,4}|[2-5]x)s$/.exec(compact);
  if (match) return 2 - xCount(match[1]!);
  // XL, XXL, XXXL … and 2XL, 3XL …
  match = /^(x{1,4}|[2-5]x)l$/.exec(compact);
  if (match) return 4 + xCount(match[1]!);
  return null;
}

/** «xx» → 2, «3x» → 3, «x» → 1. */
function xCount(prefix: string): number {
  return /^\d/.test(prefix) ? Number(prefix[0]) : prefix.length;
}

function comparePart(a: string, b: string): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  if (ra !== null && rb !== null) return ra - rb;
  // A letter size against anything else (a colour, «Універсальний», a number):
  // sizes first, so a mixed list does not interleave them.
  if (ra !== null) return -1;
  if (rb !== null) return 1;
  return collator.compare(a, b);
}

/**
 * Compares two derived variant labels: part by part (colour, then size), each
 * part as a size on the ladder when it is one and as natural text otherwise.
 * `0` for labels that are the same by this reading — callers keep the id
 * order the query already gave them.
 */
export function compareVariantLabels(a: string, b: string): number {
  const pa = a.split(PART_SEPARATOR);
  const pb = b.split(PART_SEPARATOR);
  const shared = Math.min(pa.length, pb.length);
  for (let i = 0; i < shared; i++) {
    const c = comparePart(pa[i]!, pb[i]!);
    if (c !== 0) return c;
  }
  return pa.length - pb.length;
}

/**
 * Re-sorts the variants of each product by `compareVariantLabels`, leaving the
 * order of the products — and of the rows a LIMIT kept — exactly as the query
 * gave it. The rows of a product are a contiguous run (`ORDER BY name, label`,
 * or `product_id, label`), so each run is sorted on its own, stably.
 *
 * `runKey` says which rows belong together: the product id where the query has
 * one, the product name where it has only that.
 */
export function sortVariantRuns<T>(
  rows: readonly T[],
  runKey: (row: T) => string | number,
  label: (row: T) => string
): T[] {
  const out: T[] = [];
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    const key = runKey(rows[start]!);
    while (end < rows.length && runKey(rows[end]!) === key) end++;
    const run = rows.slice(start, end);
    // Array.prototype.sort is stable: equal labels keep the query's id order.
    run.sort((x, y) => compareVariantLabels(label(x), label(y)));
    out.push(...run);
    start = end;
  }
  return out;
}
