// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen board's wire shapes — what `GET /kitchen/orders`,
// `PATCH /sales/:id/prep`, `PATCH /kitchen/rounds/:id/prep` and
// `POST /kitchen/stop-list/:id` answer
// (`src/pos/kitchen.service.ts`, café phase К3). Mirrored here rather than
// imported: this bundle ships on its own cadence and shares only
// `@pos/platform` with the host.

export type PrepStatus = 'new' | 'ready' | 'served';
export type Station = 'kitchen' | 'bar';

export interface KitchenOrderItem {
  id: number;
  product_name: string;
  /** The line's caption — already «M · вівсяне». */
  variant_label: string;
  quantity: number;
  modifiers: Array<{ group_name: string; name: string }>;
  /** The kitchen note. */
  note: string;
  /** Where the line is made, from its product's tags; empty = the kitchen. */
  stations: Station[];
}

export interface KitchenOrder {
  id: number;
  /**
   * Which half of the board this came from (К4c). A `sale` is rung at the
   * counter, a `round` was fired from a table — and they are **different
   * tables with their own id sequences**, so nothing here may key on `id`
   * alone, and the two taps go to different endpoints.
   *
   * Optional because a server older than К4 sends neither this nor the
   * fields under it; absent reads as `sale`, which is all there was then.
   */
  kind?: 'sale' | 'round';
  /** What the server wants called out: «№ 42», «Чек R-…» or «Стіл 5 · раунд 2». */
  title?: string;
  /** The table a round belongs to; null for a counter sale. */
  table_name?: string | null;
  /** Which round of that bill this is — 1 is the first one fired. */
  round_seq?: number | null;
  order_no: number | null;
  receipt_number: string;
  prep_status: 'new' | 'ready';
  created_at: string;
  ready_at: string | null;
  staff_name: string;
  /** The receipt-level note. */
  note: string | null;
  items: KitchenOrderItem[];
}

export interface KitchenBoard {
  orders: KitchenOrder[];
  /** The server's clock at the read — waiting times count against it. */
  now: string;
}

export interface PrepStatusRow {
  id: number;
  prep_status: PrepStatus;
  ready_at: string | null;
  served_at: string | null;
}

export interface StopListRow {
  product_id: number;
  stop_listed: boolean;
  stop_listed_on: string | null;
}
