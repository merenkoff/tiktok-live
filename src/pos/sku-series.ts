// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The shop's own article numbering, read back out of the articles themselves.
 *
 * An article (`pos_variants.sku`) is the one code on a card that the shop
 * invents: the barcode is minted (`autoBarcode` → `29…`), receipt and document
 * numbers are counters we own, but the article is a convention that lives in
 * the owner's head — «0001, 0002 …» for one kind of goods, «т001, т002 …» for
 * another. Nothing records that convention, so the only honest place to read it
 * is the articles already given out.
 *
 * Hence a *suggestion*, never a mint. `generateInternalBarcode` may hand out a
 * number nobody looks at, because a barcode is machine-read and a gap in it
 * costs nothing. An article is printed on the tag and means something to the
 * person holding it: guessing the series wrong and writing it in silently is
 * worse than leaving the field empty.
 */

/** One article as the store holds it, with the asked-for tag already resolved. */
export type SkuSeriesRow = {
  sku: string;
  productName: string;
  /** True when this article's product carries the tag the caller asked about. */
  inTag?: boolean;
};

export type SkuSeries = {
  /** Everything before the digits, verbatim — `''` for «0001», `'т'` for «т001». */
  prefix: string;
  /** Digits in the highest article, so «0042» suggests «0043» and not «43». */
  width: number;
  last: string;
  next: string;
  /** Articles in this series across the whole store, archived ones included. */
  count: number;
  /** How many of them sit under the tag the caller asked about. */
  inTag: number;
  /** A few product names, so the owner recognises which series this is. */
  samples: string[];
};

/**
 * Non-digits, then digits, then nothing. `068-130` is deliberately NOT a
 * series: its digits are interleaved, so "the next one" has no meaning and
 * inventing one would collide with whatever that shop's scheme actually is.
 */
const SERIES_RE = /^([^0-9]*)([0-9]+)$/;

/** Product names shown under a series. Three is enough to recognise it. */
const SAMPLE_LIMIT = 3;

/**
 * At most this many series come back. A shop has one or two; more than that
 * means stray articles, and they sort last anyway.
 */
const SERIES_LIMIT = 8;

/**
 * Group articles into series and say what the next number in each would be.
 *
 * Series are keyed on the prefix **verbatim**, which is why a Cyrillic «т» and
 * a Latin «t» come back as two rows rather than one. They are indistinguishable
 * on screen, but `idx_pos_variants_store_sku` compares the stored string, so
 * folding them together would suggest a number that is already taken — and
 * showing them apart is the only way the owner ever finds out the two got
 * mixed.
 */
export function skuSeries(rows: SkuSeriesRow[]): SkuSeries[] {
  const groups = new Map<string, { digits: string; value: bigint; row: SkuSeriesRow }[]>();

  for (const row of rows) {
    const match = SERIES_RE.exec(row.sku);
    if (!match) continue;
    const [, prefix, digits] = match as unknown as [string, string, string];
    const bucket = groups.get(prefix);
    // BigInt, not Number: `sku` is VARCHAR(64), so a long article would lose
    // its last digits to floating point and suggest a number already in use.
    const entry = { digits, value: BigInt(digits), row };
    if (bucket) bucket.push(entry);
    else groups.set(prefix, [entry]);
  }

  const series: SkuSeries[] = [];
  for (const [prefix, entries] of groups) {
    // Highest first: the newest numbers are the ones worth showing as samples,
    // and the top one decides both the width and what comes next.
    entries.sort((a, b) => (a.value === b.value ? 0 : a.value < b.value ? 1 : -1));
    const top = entries[0]!;
    const width = top.digits.length;

    const samples: string[] = [];
    for (const entry of entries) {
      const name = entry.row.productName.trim();
      if (!name || samples.includes(name)) continue;
      samples.push(name);
      if (samples.length === SAMPLE_LIMIT) break;
    }

    series.push({
      prefix,
      width,
      last: top.row.sku,
      // `padStart` only pads — a series that outgrows its width (0999 → 1000)
      // widens instead of being truncated back into a collision.
      next: prefix + String(top.value + 1n).padStart(width, '0'),
      count: entries.length,
      inTag: entries.reduce((n, entry) => n + (entry.row.inTag ? 1 : 0), 0),
      samples,
    });
  }

  // What the card is already filed under wins: adding a T-shirt where every
  // other T-shirt is «т…» should put «т…» first. Then sheer usage, so the
  // shop's main series leads; the prefix only breaks ties, for a stable order.
  series.sort(
    (a, b) => b.inTag - a.inTag || b.count - a.count || a.prefix.localeCompare(b.prefix)
  );
  return series.slice(0, SERIES_LIMIT);
}
