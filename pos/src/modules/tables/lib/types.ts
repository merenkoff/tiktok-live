// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the server sends (К4a/К4b, `src/pos/tables.service.ts` and
// `src/pos/bills.service.ts`). Mirrored rather than imported: this bundle is
// built on its own and never links against the backend's types.

export type TableShape = 'rect' | 'round';

export interface PosTable {
  id: number;
  hall_id: number;
  name: string;
  seats: number;
  /** Whole grid CELLS, never pixels — the owner's layout, §4.8 of the doc. */
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  shape: TableShape;
  is_active: boolean;
}

export interface PosHall {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  tables: PosTable[];
}

/** A seated table, as the map needs it. */
export interface OpenBillSummary {
  id: number;
  bill_no: number;
  table_id: number;
  guests: number;
  opened_at: string;
  opened_by_name: string;
  precheck_printed_at: string | null;
  /** Money owed — fired rounds at their locked price. */
  fired_total_cents: number;
  /** Lines typed but not sent: the dot that says «не відправлено». */
  draft_count: number;
  /** What the table is waiting for, or null when nothing is. */
  prep_status: 'new' | 'ready' | null;
}
