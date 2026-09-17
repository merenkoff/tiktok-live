// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What the florist's bench holds while a bouquet is being assembled.
 *
 * Deliberately small: a map of variant → how many stems, and a budget the
 * florist heard from the customer. Everything else — the price, the caption,
 * whether the budget is blown — is derived on every render, because the one
 * rule the design rests on is that the price is never stale and never hidden
 * (`TechDocs/POS_FLORIST_BENCH.md` §2, §3.3).
 *
 * The budget does NOT enter the price (§3.5). It is a hint, drawn as a bar.
 * A bouquet that has to land on exactly 1500 is a *discount*, and the cart
 * already expresses one — a freely settable line price would be a hole no
 * receipt could show.
 */

import { useCallback, useMemo, useState } from 'react';
import { priceOfComponents, withLabour } from '@pos/platform';
import type { CartLineComponent, CatalogItem } from '@pos/platform';

export interface BenchStem {
  item: CatalogItem;
  quantity: number;
}

export interface BenchTotals {
  /** The stems at catalogue price, before the shop's assembly charge. */
  partsCents: number;
  /** What the shop charges for assembling this one, in kopecks. */
  labourCents: number;
  /** `partsCents + labourCents` — what the cart line will cost. */
  totalCents: number;
  /** Total stems, greenery and wrapping — what the caption counts. */
  stemCount: number;
}

export interface Bench {
  stems: BenchStem[];
  /** How many of this variant are in the bouquet right now. 0 when none. */
  countOf: (variantId: number) => number;
  add: (item: CatalogItem, delta?: number) => void;
  setQuantity: (variantId: number, quantity: number) => void;
  clear: () => void;
  /**
   * The stem the number pad types into — whatever the florist last touched.
   * One tap on a tile puts a stem in AND selects it, so «9 троянд» is two
   * taps, not nine. Null when the bouquet is empty.
   */
  selectedId: number | null;
  select: (variantId: number) => void;
  /** A digit from the pad. Builds the number, so 1 then 2 is twelve. */
  typeDigit: (digit: number) => void;
  /** Rubs out the last digit; rubbing out the only one takes the stem out. */
  backspace: () => void;
  totals: BenchTotals;
  labourBps: number;
  budgetCents: number | null;
  setBudgetCents: (cents: number | null) => void;
  /** The cart's shape, ready for `addAssembled`. Empty when nothing is in. */
  components: CartLineComponent[];
}

export function useBench(labourBps: number): Bench {
  // Insertion-ordered, which is also the order the florist built it in — the
  // composition panel reads top-down as "what I did", not as an alphabetised
  // list they have to re-scan.
  const [stems, setStems] = useState<BenchStem[]>([]);
  const [budgetCents, setBudgetCents] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // False right after a stem is touched, so the first digit REPLACES the count
  // rather than appending to it: tap a rose, press 9, get nine roses. True once
  // a digit has landed, so 1 then 2 reads as twelve.
  const [typing, setTyping] = useState(false);

  const countOf = useCallback(
    (variantId: number) => stems.find((s) => s.item.variant_id === variantId)?.quantity ?? 0,
    [stems]
  );

  const add = useCallback((item: CatalogItem, delta = 1) => {
    setSelectedId(item.variant_id);
    setTyping(false);
    setStems((prev) => {
      const at = prev.findIndex((s) => s.item.variant_id === item.variant_id);
      if (at === -1) {
        if (delta <= 0) return prev;
        // Never more than the shelf holds: the stems are physically there or
        // they are not, and a bouquet promising a rose the fridge does not
        // have is a customer conversation, not a rounding error.
        return [...prev, { item, quantity: Math.min(delta, Math.max(0, item.quantity)) }];
      }
      const next = [...prev];
      const wanted = next[at].quantity + delta;
      const capped = Math.min(wanted, Math.max(0, item.quantity));
      if (capped <= 0) return next.filter((_, i) => i !== at);
      // Keep the row it already has rather than re-appending: a stem the
      // florist adds, removes and adds again should not jump to the bottom.
      next[at] = { ...next[at], quantity: capped };
      return next;
    });
  }, []);

  const setQuantity = useCallback((variantId: number, quantity: number) => {
    setStems((prev) => {
      const at = prev.findIndex((s) => s.item.variant_id === variantId);
      if (at === -1) return prev;
      const capped = Math.min(Math.max(0, quantity), Math.max(0, prev[at].item.quantity));
      if (capped <= 0) return prev.filter((_, i) => i !== at);
      const next = [...prev];
      next[at] = { ...next[at], quantity: capped };
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setStems([]);
    setBudgetCents(null);
    setSelectedId(null);
    setTyping(false);
  }, []);

  const select = useCallback((variantId: number) => {
    setSelectedId(variantId);
    setTyping(false);
  }, []);

  const typeDigit = useCallback(
    (digit: number) => {
      if (selectedId == null) return;
      setStems((prev) => {
        const at = prev.findIndex((s) => s.item.variant_id === selectedId);
        if (at === -1) return prev;
        const wanted = typing ? prev[at].quantity * 10 + digit : digit;
        const capped = Math.min(wanted, Math.max(0, prev[at].item.quantity));
        if (capped <= 0) return prev;
        const next = [...prev];
        next[at] = { ...next[at], quantity: capped };
        return next;
      });
      setTyping(true);
    },
    [selectedId, typing]
  );

  const backspace = useCallback(() => {
    if (selectedId == null) return;
    setStems((prev) => {
      const at = prev.findIndex((s) => s.item.variant_id === selectedId);
      if (at === -1) return prev;
      const shorter = Math.floor(prev[at].quantity / 10);
      if (shorter <= 0) return prev.filter((_, i) => i !== at);
      const next = [...prev];
      next[at] = { ...next[at], quantity: shorter };
      return next;
    });
  }, [selectedId]);

  const components = useMemo<CartLineComponent[]>(
    () =>
      stems.map((s) => ({
        component_variant_id: s.item.variant_id,
        quantity: s.quantity,
        product_name: s.item.product_name,
        label: s.item.label,
        unit: s.item.unit,
        unit_price_cents: s.item.price_cents,
      })),
    [stems]
  );

  const totals = useMemo<BenchTotals>(() => {
    // Priced through the shared helper, not a local sum: the server re-prices
    // the line from the same components when the sale is filed, and an `OFF-`
    // receipt printed with no network has to match it to the kopeck.
    const byId = new Map(stems.map((s) => [s.item.variant_id, s.item]));
    const partsCents = priceOfComponents(
      components.map((c) => ({ component_variant_id: c.component_variant_id, quantity: c.quantity })),
      byId,
      0
    );
    const totalCents = withLabour(partsCents, labourBps);
    return {
      partsCents,
      labourCents: totalCents - partsCents,
      totalCents,
      stemCount: stems.reduce((sum, s) => sum + s.quantity, 0),
    };
  }, [stems, components, labourBps]);

  return {
    stems,
    countOf,
    add,
    setQuantity,
    clear,
    totals,
    labourBps,
    budgetCents,
    setBudgetCents,
    components,
    selectedId,
    select,
    typeDigit,
    backspace,
  };
}

/**
 * How the budget bar reads. Separate from the state so it can be tested as
 * arithmetic, and so the bar has no opinion about where the numbers came from.
 *
 * `remainingCents` is what is left to spend; negative means over. `nextStem` is
 * the "≈2 more roses" hint — it needs a reference stem price, which the panel
 * takes from the most recently added stem, because that is what the florist's
 * hand is on.
 */
export function budgetRead(
  totalCents: number,
  budgetCents: number | null,
  referenceStemCents: number | null,
  labourBps: number
): { ratio: number; remainingCents: number; over: boolean; nextStems: number | null } {
  if (budgetCents == null || budgetCents <= 0) {
    return { ratio: 0, remainingCents: 0, over: false, nextStems: null };
  }
  const remainingCents = budgetCents - totalCents;
  // One more stem costs its price plus the labour charged on that price, which
  // is why this divides by the stem's *grossed-up* cost and not its shelf
  // price — quoting "2 more roses" and then landing 25% over is the exact
  // trust-loser the bar exists to prevent.
  const perStem =
    referenceStemCents && referenceStemCents > 0 ? withLabour(referenceStemCents, labourBps) : 0;
  return {
    ratio: Math.min(1, totalCents / budgetCents),
    remainingCents,
    over: remainingCents < 0,
    nextStems: perStem > 0 && remainingCents > 0 ? Math.floor(remainingCents / perStem) : null,
  };
}
