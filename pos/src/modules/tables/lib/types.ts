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
  /** Who seated it — «мій стіл». Absent in a mirror an older till wrote. */
  opened_by?: number;
  opened_by_name: string;
  /** Set when the pre-bill was printed: the guests asked for the bill. */
  precheck_printed_at: string | null;
  /** Money owed — fired rounds at their locked price. */
  fired_total_cents: number;
  /** Lines typed but not sent: the dot that says «не відправлено». */
  draft_count: number;
  /** What the table is waiting for, or null when nothing is. */
  prep_status: 'new' | 'ready' | null;
}

// ── the bill itself (К4b–К4d) ──────────────────────────────────────────────

/** One answer chosen on a line, as the bill recorded it. */
export interface LineModifier {
  modifier_id: number | null;
  group_name: string;
  name: string;
  price_delta_cents: number;
  sort_order: number;
}

export interface BillLine {
  id: number;
  variant_id: number;
  quantity: number;
  product_name: string;
  variant_label: string;
  unit: string;
  /** The money this line locked when its round was fired. Null on a draft. */
  unit_price_cents: number | null;
  compare_at_unit_cents: number | null;
  /** Today's card price + today's deltas, for a draft only. Indicative. */
  preview_unit_price_cents: number | null;
  components: Array<{ component_variant_id: number; quantity: number }> | null;
  modifiers: LineModifier[];
  note: string;
  /**
   * The sale that paid for this plate, or null while it is still owed. After
   * the first guest of a split pays, this is what tells the screen which
   * lines are still on the table.
   */
  sale_id: number | null;
  added_by: number;
  added_by_name: string;
  sort_order: number;
}

export interface BillRound {
  id: number;
  seq: number;
  fired_at: string;
  fired_by: number;
  fired_by_name: string;
  prep_status: 'new' | 'ready' | 'served';
  ready_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
  items: BillLine[];
  total_cents: number;
}

export interface Bill {
  id: number;
  bill_no: number;
  status: 'open' | 'paid' | 'cancelled';
  table_id: number;
  table_name: string;
  hall_id: number;
  hall_name: string;
  guests: number;
  note: string | null;
  customer_id: number | null;
  precheck_printed_at: string | null;
  opened_by: number;
  opened_by_name: string;
  opened_at: string;
  closed_at: string | null;
  rounds: BillRound[];
  /** Lines not yet fired. */
  draft: BillLine[];
  /** Σ of fired lines at their locked price — the money owed so far. */
  fired_total_cents: number;
  /** Σ of the draft at today's prices. Indicative; it is not owed yet. */
  draft_preview_cents: number;
}
