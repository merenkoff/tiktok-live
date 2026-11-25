// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure helpers behind the kitchen's «Замовлення точок» (РК5).

import type { KitchenOrder } from './ordersApi';

/** What the kitchen may still delay or cancel: paid and not yet given to the courier (the server's rule). */
const IN_WORK = ['paid', 'cooking', 'ready'] as const;

/** «+10 хв» — one tap. */
export const DELAY_STEP_MINUTES = 10;

/** Ready-made reasons; the cafe's cashier reads the one chosen on the red line. */
export const CANCEL_REASONS = ['Немає продуктів', 'Зламалося обладнання', 'Не встигаємо'] as const;

/** The orders the kitchen can still move, the soonest promise first. */
export function ordersInWork(orders: KitchenOrder[]): KitchenOrder[] {
  const at = (o: KitchenOrder) => {
    const ms = o.promised_at ? Date.parse(o.promised_at) : NaN;
    return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
  };
  return orders
    .filter((o) => (IN_WORK as readonly string[]).includes(o.status))
    .sort((a, b) => at(a) - at(b) || a.id - b.id);
}

/** The reason the server gets: a chosen one, else what was typed; empty = not yet. */
export function cancelReason(chosen: string | null, typed: string): string {
  return (chosen ?? typed).trim();
}
