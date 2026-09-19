// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { create } from 'zustand';
import type { CatalogItem, PosCustomer } from '../types';
import {
  cartLineUid,
  cleanLineNote,
  lineCaption,
  normalizeModifierIds,
  resolveLineModifiers,
  shiftCompareAt,
  type CartLineChoice,
  type CartLineModifier,
} from '../lib/modifiers';

export interface CartDiscount {
  type: 'percent' | 'fixed';
  value: number;
}

export interface CartLine {
  /**
   * This line's identity, not the variant's.
   *
   * An ordinary line's uid is its `variant_id` as a string, so scanning the
   * same rose twice still merges into one line. A bouquet assembled at the
   * counter gets a fresh uid, because two custom bouquets rung on one
   * catalogue card are two different bouquets and merging them would throw one
   * of the two recipes away — which is exactly how the server behaves.
   */
  uid: string;
  variant_id: number;
  product_name: string;
  /** Built by the store's vertical, server-side — never composed here. */
  variant_label: string;
  /** Unit the quantity counts ('шт', 'г'…), for the cart and the receipt. */
  unit: string;
  unit_price_cents: number;
  quantity: number;
  max_quantity: number;
  image_url?: string | null;
  compare_at_cents?: number | null;
  discount_label?: string | null;
  /**
   * What this one line was assembled from, for a bouquet built at the counter.
   * The server re-prices from it and snapshots it; the client never sends a
   * price. Absent on every ordinary line.
   */
  components?: CartLineComponent[];
  /**
   * The answers this line chose («вівсяне», «без цукру»), in group order.
   * `variant_label` already carries their names — the server composes the
   * caption the same way — so the cart draws the label, not this list; this
   * is what goes on the wire (ids) and what the offline receipt is priced
   * from. Absent on every line without modifiers.
   */
  modifiers?: CartLineModifier[];
  /** Kitchen note. Never part of any label, and never on the fiscal line. */
  note?: string;
}

/** One stem in a bouquet being rung, per one unit of it. */
export interface CartLineComponent {
  component_variant_id: number;
  quantity: number;
  product_name: string;
  label: string;
  unit: string;
  unit_price_cents: number;
}

interface CartStore {
  lines: CartLine[];
  banner: string | null;
  /**
   * The pre-order this cart IS, when one is being handed over
   * (`TechDocs/POS_FLORIST_BENCH.md` §14).
   *
   * Set, the cart is not a cart: it is a promise the shop already made, at a
   * price it already named. The sell screen hides every edit control while it
   * is set, because the server rings the order's own lines from its own table
   * and an edited screen would show one thing while the receipt says another.
   * Adding something at the counter is a second sale.
   */
  preorderId: number | null;
  cartDiscount: CartDiscount | null;
  customer: PosCustomer | null;
  setBanner: (msg: string | null) => void;
  setCartDiscount: (discount: CartDiscount | null) => void;
  setCustomer: (customer: PosCustomer | null) => void;
  /**
   * Add a catalog item, merging into the line with the same identity. The
   * optional `choice` is what the modifier sheet hands back; without it the
   * call is exactly what it was before modifiers existed, which is what the
   * clothing and flowers catalogs still make.
   */
  addItem: (item: CatalogItem, qty?: number, choice?: CartLineChoice) => void;
  /** A bouquet assembled at the counter — always its own line. */
  addAssembled: (input: AssembledLineInput) => void;
  /**
   * Put a parked cart back on the screen, replacing whatever is there.
   *
   * Replaces rather than merges on purpose: the cashier asked for *that*
   * customer's cart, and quietly folding it into a half-rung one would make
   * two people's flowers into one receipt. The frame refuses to restore over a
   * non-empty cart; this is what happens once it has been cleared.
   */
  restore: (cart: RestoredCart) => void;
  setQty: (uid: string, quantity: number) => void;
  remove: (uid: string) => void;
  clear: () => void;
  subtotalCents: () => number;
  cartDiscountCents: () => number;
  totalCents: () => number;
  itemCount: () => number;
}

function discountMeta(item: CatalogItem): {
  compare_at_cents: number | null;
  discount_label: string | null;
} {
  const compare = item.compare_at_cents ?? null;
  if (compare == null || compare <= item.price_cents) {
    return { compare_at_cents: null, discount_label: null };
  }
  const pct = Math.round(((compare - item.price_cents) / compare) * 100);
  return {
    compare_at_cents: compare,
    discount_label: `Знижка (${pct}%)`,
  };
}

/** What the bench hands the cart when the florist is done. */
export interface AssembledLineInput {
  /** The catalogue card it was rung on — a derived composite. */
  variant_id: number;
  product_name: string;
  variant_label: string;
  unit: string;
  /** Mirrors `priceOfComposition`; the server recomputes and wins. */
  unit_price_cents: number;
  quantity: number;
  image_url?: string | null;
  components: CartLineComponent[];
}

/** A parked cart, turned back into what the sell screen draws. */
export interface RestoredCart {
  lines: CartLine[];
  cartDiscount?: CartDiscount | null;
  customer?: PosCustomer | null;
  /** Set when what is being restored is a pre-order being handed over. */
  preorderId?: number | null;
}

/** Mirror backend: cart discount only on lines without product discount. */
export function computeCartDiscountCents(
  lines: CartLine[],
  cartDiscount: CartDiscount | null
): number {
  if (!cartDiscount) return 0;
  const eligible = lines.filter((l) => !l.compare_at_cents);
  const eligibleSum = eligible.reduce(
    (s, l) => s + l.unit_price_cents * l.quantity,
    0
  );
  if (eligibleSum <= 0) return 0;
  if (cartDiscount.type === 'percent') {
    const pct = Math.min(100, Math.max(0, cartDiscount.value));
    return Math.round((eligibleSum * pct) / 100);
  }
  return Math.min(Math.max(0, cartDiscount.value), eligibleSum);
}

export const useCartStore = create<CartStore>((set, get) => ({
  lines: [],
  banner: null,
  preorderId: null,
  cartDiscount: null,
  customer: null,

  setBanner: (msg) => set({ banner: msg }),
  setCartDiscount: (discount) => set({ cartDiscount: discount }),
  setCustomer: (customer) => set({ customer }),

  addItem: (item, qty = 1, choice) => {
    if (item.quantity <= 0) {
      set({ banner: 'Немає в наявності' });
      return;
    }
    // A choice is resolved the way the server will resolve it at checkout:
    // the same refusals, the same delta, the same caption. No choice means no
    // modifiers at all — the server never applies a default on its own, so
    // neither does this.
    const ids = normalizeModifierIds(choice?.modifiers);
    const note = cleanLineNote(choice?.note);
    const resolved = choice ? resolveLineModifiers(item.modifier_groups ?? [], ids) : null;
    if (resolved?.error) {
      set({ banner: resolved.error });
      return;
    }
    const deltaCents = resolved?.deltaCents ?? 0;
    const unitPrice = item.price_cents + deltaCents;
    if (unitPrice < 0) {
      set({ banner: 'Ціна не може бути відʼємною' });
      return;
    }
    // The discount is read off the card; the old price then moves by the same
    // delta as the new one, or a +20 ₴ double shot would shrink the discount.
    const meta = discountMeta(item);
    const compareAt = shiftCompareAt(meta.compare_at_cents, deltaCents);
    const uid = cartLineUid(item.variant_id, ids, note);
    const label = resolved ? lineCaption(item.label, resolved.names) : item.label;

    const lines = [...get().lines];
    // Only a line with the same identity merges — same variant, same answers,
    // same note, which is the server's own merge key. A line carrying its own
    // composition keeps a uid of its own, so it is never a candidate here.
    const existing = lines.find((l) => l.uid === uid);
    if (existing) {
      const next = Math.min(existing.quantity + qty, item.quantity);
      if (next === existing.quantity) {
        set({ banner: 'Недостатньо залишку' });
        return;
      }
      existing.quantity = next;
      existing.max_quantity = item.quantity;
      existing.image_url = item.image_url ?? existing.image_url;
      existing.compare_at_cents = compareAt;
      existing.discount_label = meta.discount_label;
      existing.unit_price_cents = unitPrice;
      set({ lines, banner: null });
      return;
    }
    lines.push({
      uid,
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_label: label,
      unit: item.unit,
      unit_price_cents: unitPrice,
      quantity: Math.min(qty, item.quantity),
      max_quantity: item.quantity,
      image_url: item.image_url,
      compare_at_cents: compareAt,
      discount_label: meta.discount_label,
      ...(resolved && resolved.snapshot.length ? { modifiers: resolved.snapshot } : {}),
      ...(note ? { note } : {}),
    });
    set({ lines, banner: null });
  },

  restore: ({ lines, cartDiscount, customer, preorderId }) => {
    set({
      lines,
      cartDiscount: cartDiscount ?? null,
      customer: customer ?? null,
      preorderId: preorderId ?? null,
      banner: null,
    });
  },

  addAssembled: (input) => {
    const stems = input.components.reduce((sum, c) => sum + c.quantity, 0);
    if (stems <= 0) {
      set({ banner: 'Букет порожній' });
      return;
    }
    set({
      lines: [
        ...get().lines,
        {
          // A fresh uid every time: this bouquet is not the last one.
          uid: `bouquet:${crypto.randomUUID()}`,
          variant_id: input.variant_id,
          product_name: input.product_name,
          variant_label: input.variant_label,
          unit: input.unit,
          unit_price_cents: input.unit_price_cents,
          quantity: input.quantity,
          // Stock is the components', and the server checks it. Nothing here
          // can be clamped against a single variant's quantity.
          max_quantity: input.quantity,
          image_url: input.image_url ?? null,
          components: input.components,
        },
      ],
      banner: null,
    });
  },

  setQty: (uid, quantity) => {
    const lines = get()
      .lines.map((line) => {
        if (line.uid !== uid) return line;
        if (quantity > line.max_quantity) {
          set({ banner: 'Недостатньо залишку' });
          return { ...line, quantity: line.max_quantity };
        }
        return { ...line, quantity };
      })
      .filter((line) => line.quantity > 0);
    set({ lines });
  },

  remove: (uid) => {
    set({ lines: get().lines.filter((l) => l.uid !== uid) });
  },

  clear: () =>
    set({ lines: [], banner: null, cartDiscount: null, customer: null, preorderId: null }),

  subtotalCents: () =>
    get().lines.reduce((sum, line) => sum + line.unit_price_cents * line.quantity, 0),

  cartDiscountCents: () => computeCartDiscountCents(get().lines, get().cartDiscount),

  totalCents: () => Math.max(0, get().subtotalCents() - get().cartDiscountCents()),

  itemCount: () => get().lines.reduce((sum, line) => sum + line.quantity, 0),
}));
