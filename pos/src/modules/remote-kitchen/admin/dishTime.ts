// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ordersText } from '../lib/plural';

/** A kitchen dish's times as the server sends them (§7.1). */
export interface DishTimes {
  /** The time on the kitchen's card. */
  prep_minutes: number | null;
  /** The 14-day median «оплачено → Готово»; absent from an older server. */
  measured_minutes?: number | null;
  measured_orders?: number;
}

/**
 * «≈27 хв за 5 замовлень» once the kitchen's own orders measured the dish —
 * the time its suggestion uses — else «≈40 хв» from its card, else nothing.
 */
export function dishTime(d: DishTimes): string {
  if (d.measured_minutes != null) return `≈${d.measured_minutes} хв за ${ordersText(d.measured_orders ?? 0)}`;
  return d.prep_minutes != null ? `≈${d.prep_minutes} хв` : '';
}
