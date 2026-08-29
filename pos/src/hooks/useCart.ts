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
  variant_id: number;
  product_name: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  max_quantity: number;
  image_url?: string | null;
  compare_at_cents?: number | null;
  discount_label?: string | null;
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
  setQty: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
  subtotalCents: () => number;
  cartDiscountCents: () => number;
  totalCents: () => number;
  itemCount: () => number;
}

function label(item: CatalogItem): string {
  return [item.color, item.size].filter(Boolean).join(' / ');
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
    const existing = lines.find((l) => l.variant_id === item.variant_id);
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
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_label: label(item),
      unit_price_cents: item.price_cents,
      quantity: Math.min(qty, item.quantity),
      max_quantity: item.quantity,
      image_url: item.image_url,
      compare_at_cents: meta.compare_at_cents,
      discount_label: meta.discount_label,
    });
    set({ lines, banner: null });
  },

  setQty: (variantId, quantity) => {
    const lines = get()
      .lines.map((line) => {
        if (line.variant_id !== variantId) return line;
        if (quantity > line.max_quantity) {
          set({ banner: 'Недостатньо залишку' });
          return { ...line, quantity: line.max_quantity };
        }
        return { ...line, quantity };
      })
      .filter((line) => line.quantity > 0);
    set({ lines });
  },

  remove: (variantId) => {
    set({ lines: get().lines.filter((l) => l.variant_id !== variantId) });
  },

  clear: () => set({ lines: [], banner: null, cartDiscount: null, customer: null }),

  subtotalCents: () =>
    get().lines.reduce((sum, line) => sum + line.unit_price_cents * line.quantity, 0),

  cartDiscountCents: () => computeCartDiscountCents(get().lines, get().cartDiscount),

  totalCents: () => Math.max(0, get().subtotalCents() - get().cartDiscountCents()),

  itemCount: () => get().lines.reduce((sum, line) => sum + line.quantity, 0),
}));
