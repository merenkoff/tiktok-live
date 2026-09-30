// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's copy of `src/pos/verticals/variantOrder.ts` (TechDocs/POS_CLOTHING.md,
// C0/C1): the order a product's variants are listed in — colour (or whatever
// comes first) alphabetically, then sizes from smallest to largest, numbers as
// numbers («92» < «104», «3-6» < «12-18»).
//
// The server sorts what it sends, but the offline catalogue comes out of
// IndexedDB by `variant_id`, so the till needs its own. The cases in
// `variantOrder.test.ts` are the same table `src/__tests__/pos.variant-order.test.ts`
// pins on the server: the two must never disagree about what a size run is.

/** The separators a derived label joins its attributes with («Колір / Розмір»; a café caption — «M · вівсяне»). */
const PART_SEPARATOR = /\s*[/·]\s*/;

const collator = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

// A Ukrainian keyboard types «М», «Л», «С», «Х» as readily as the Latin ones,
// and to the eye they are the same size. Mapped after lower-casing.
const LOOKALIKES: Record<string, string> = { х: 'x', м: 'm', л: 'l', с: 's' };

/**
 * Where a clothing size sits on the ladder, or null when the text is not a
 * letter size at all. XS is 1, S 2, M 3, L 4, XL 5, then one more per X.
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
  let match = /^(x{1,4}|[2-5]x)s$/.exec(compact);
  if (match) return 2 - xCount(match[1]!);
  match = /^(x{1,4}|[2-5]x)l$/.exec(compact);
  if (match) return 4 + xCount(match[1]!);
  return null;
}

function xCount(prefix: string): number {
  return /^\d/.test(prefix) ? Number(prefix[0]) : prefix.length;
}

function comparePart(a: string, b: string): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  if (ra !== null && rb !== null) return ra - rb;
  // A letter size against anything else: sizes first, so a mixed list does not interleave them.
  if (ra !== null) return -1;
  if (rb !== null) return 1;
  return collator.compare(a, b);
}

/** Compares two derived variant labels part by part; `0` when they read the same. */
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

interface Orderable {
  variant_id: number;
  product_id: number;
  product_name: string;
  label: string;
}

/**
 * The catalogue in the order the online till gets it: by product name, each
 * card's variants together (two cards with one name stay apart, told by id) and
 * within a card from small to large. Stable and pure.
 */
export function orderCatalog<T extends Orderable>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      collator.compare(a.product_name ?? '', b.product_name ?? '') ||
      a.product_id - b.product_id ||
      compareVariantLabels(a.label ?? '', b.label ?? '') ||
      a.variant_id - b.variant_id
  );
}
