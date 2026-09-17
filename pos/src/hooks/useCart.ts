// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { create } from 'zustand';
import type { CatalogItem, PosCustomer } from '../types';

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
  cartDiscount: CartDiscount | null;
  customer: PosCustomer | null;
  setBanner: (msg: string | null) => void;
  setCartDiscount: (discount: CartDiscount | null) => void;
  setCustomer: (customer: PosCustomer | null) => void;
  addItem: (item: CatalogItem, qty?: number) => void;
  /** A bouquet assembled at the counter — always its own line. */
  addAssembled: (input: AssembledLineInput) => void;
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
  cartDiscount: null,
  customer: null,

  setBanner: (msg) => set({ banner: msg }),
  setCartDiscount: (discount) => set({ cartDiscount: discount }),
  setCustomer: (customer) => set({ customer }),

  addItem: (item, qty = 1) => {
    if (item.quantity <= 0) {
      set({ banner: 'Немає в наявності' });
      return;
    }
    const meta = discountMeta(item);
    const lines = [...get().lines];
    // Only an ordinary line merges. A line carrying its own composition keeps
    // its own uid, so it is never a candidate here.
    const existing = lines.find((l) => l.uid === String(item.variant_id));
    if (existing) {
      const next = Math.min(existing.quantity + qty, item.quantity);
      if (next === existing.quantity) {
        set({ banner: 'Недостатньо залишку' });
        return;
      }
      existing.quantity = next;
      existing.max_quantity = item.quantity;
      existing.image_url = item.image_url ?? existing.image_url;
      existing.compare_at_cents = meta.compare_at_cents;
      existing.discount_label = meta.discount_label;
      existing.unit_price_cents = item.price_cents;
      set({ lines, banner: null });
      return;
    }
    lines.push({
      uid: String(item.variant_id),
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_label: item.label,
      unit: item.unit,
      unit_price_cents: item.price_cents,
      quantity: Math.min(qty, item.quantity),
      max_quantity: item.quantity,
      image_url: item.image_url,
      compare_at_cents: meta.compare_at_cents,
      discount_label: meta.discount_label,
    });
    set({ lines, banner: null });
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

  clear: () => set({ lines: [], banner: null, cartDiscount: null, customer: null }),

  subtotalCents: () =>
    get().lines.reduce((sum, line) => sum + line.unit_price_cents * line.quantity, 0),

  cartDiscountCents: () => computeCartDiscountCents(get().lines, get().cartDiscount),

  totalCents: () => Math.max(0, get().subtotalCents() - get().cartDiscountCents()),

  itemCount: () => get().lines.reduce((sum, line) => sum + line.quantity, 0),
}));
