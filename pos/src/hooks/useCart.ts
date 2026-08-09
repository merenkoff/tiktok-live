import { create } from 'zustand';
import type { CatalogItem } from '../types';

export interface CartLine {
  variant_id: number;
  product_name: string;
  variant_label: string;
  unit_price_cents: number;
  quantity: number;
  max_quantity: number;
}

interface CartStore {
  lines: CartLine[];
  banner: string | null;
  setBanner: (msg: string | null) => void;
  addItem: (item: CatalogItem, qty?: number) => void;
  setQty: (variantId: number, quantity: number) => void;
  remove: (variantId: number) => void;
  clear: () => void;
  totalCents: () => number;
  itemCount: () => number;
}

function label(item: CatalogItem): string {
  return [item.color, item.size].filter(Boolean).join(' / ');
}

export const useCartStore = create<CartStore>((set, get) => ({
  lines: [],
  banner: null,

  setBanner: (msg) => set({ banner: msg }),

  addItem: (item, qty = 1) => {
    if (item.quantity <= 0) {
      set({ banner: 'Немає в наявності' });
      return;
    }
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
    });
    set({ lines, banner: null });
  },

  setQty: (variantId, quantity) => {
    const lines = get().lines
      .map((line) => {
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

  clear: () => set({ lines: [], banner: null }),

  totalCents: () =>
    get().lines.reduce((sum, line) => sum + line.unit_price_cents * line.quantity, 0),

  itemCount: () => get().lines.reduce((sum, line) => sum + line.quantity, 0),
}));
