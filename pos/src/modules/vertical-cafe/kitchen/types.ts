// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen board's wire shapes — what `GET /kitchen/orders`,
// `PATCH /sales/:id/prep` and `POST /kitchen/stop-list/:id` answer
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
