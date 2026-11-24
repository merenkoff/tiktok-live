// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the server sends (`src/pos/serving.service.ts`, migration 115).
// Mirrored rather than imported: this bundle is built on its own and never
// links against the backend's types.

export type Station = 'kitchen' | 'bar';

/** One line of a fired round, with how much of it has been carried. */
export interface ServingLine {
  id: number;
  product_name: string;
  /** «M · вівсяне» — the caption the round locked. */
  caption: string;
  /** The kitchen note («без цибулі»). */
  note: string;
  modifiers: Array<{ group_name: string; name: string }>;
  quantity: number;
  served_quantity: number;
  stations: Station[];
}

export interface ServingRound {
  id: number;
  seq: number;
  fired_at: string;
  fired_by_name: string;
  prep_status: 'new' | 'ready';
  ready_at: string | null;
  items: ServingLine[];
}

/** An open bill on the waiter's row of tables. */
export interface ServingTable {
  table_id: number;
  table_name: string;
  hall_name: string;
  bill_id: number;
  bill_no: number;
  opened_by_name: string;
  /** Plates still to carry, over every live round. */
  to_serve: number;
  rounds: ServingRound[];
}

export interface ServingFeed {
  now: string;
  tables: ServingTable[];
}

/** One act of carrying, for «Винесено». */
export interface ServingHistoryRow {
  id: number;
  client_uuid: string | null;
  bill_item_id: number;
  round_id: number;
  round_seq: number;
  product_name: string;
  caption: string;
  quantity: number;
  source: 'waiter' | 'kitchen';
  served_by: number | null;
  served_by_name: string;
  served_at: string;
  undone_at: string | null;
  /** The asker may take it back right now. */
  undoable: boolean;
  undo_until: string | null;
}

export interface ServingBill {
  now: string;
  bill_id: number;
  status: string;
  rounds: ServingRound[];
  history: ServingHistoryRow[];
}

export interface ServeAnswer {
  replay: boolean;
  events: Array<{ id: number; bill_item_id: number; quantity: number; served_at: string }>;
  lines: Array<{ bill_item_id: number; quantity: number; served_quantity: number }>;
  rounds: Array<{ id: number; prep_status: 'new' | 'ready' | 'served'; served_at: string | null }>;
}

export interface UndoAnswer {
  undone: number[];
  lines: ServeAnswer['lines'];
  rounds: ServeAnswer['rounds'];
}
