// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's calls into `/api/pos`, all through the host's one client so
// the token, the base URL and the version header stay the host's business
// (`lib/hostPlatform.ts`).

import { posRequest } from './hostPlatform';
import type { TablePosition } from './layout';
import type { Bill, OpenBillSummary, PosHall, PosTable, TableShape } from './types';

/** The room, as the owner laid it out. */
export function listHalls(): Promise<{ halls: PosHall[] }> {
  return posRequest<{ halls: PosHall[] }>('get', '/halls');
}

/** Who is sitting where, and for how much. */
export function listOpenBills(): Promise<{ bills: OpenBillSummary[] }> {
  return posRequest<{ bills: OpenBillSummary[] }>('get', '/bills');
}

/**
 * Seat a table — or open the bill already on it.
 *
 * Tapping an occupied table means «show me it», never «start a second one»,
 * and the server answers with the bill that is already there (К4b). So the
 * map needs no separate «open» and «view»: one tap, one endpoint.
 */
export function seatTable(tableId: number, guests?: number): Promise<{ bill: { id: number } }> {
  return posRequest<{ bill: { id: number } }>('post', '/bills', {
    table_id: tableId,
    ...(guests ? { guests } : {}),
  });
}

// ── the bill (К4f) ─────────────────────────────────────────────────────────

export function getBill(billId: number): Promise<Bill> {
  return posRequest<Bill>('get', `/bills/${billId}`);
}

/**
 * Put a dish on the draft.
 *
 * `modifiers` are ids and nothing else: the price, the caption and what each
 * answer writes off are the server's to resolve, at fire time (К4c). The same
 * ids also decide whether this line merges with one already on the draft —
 * the server uses `variant|sorted ids|note` there, verbatim the key
 * `completeSale` merges a cart with.
 */
export function addLine(
  billId: number,
  line: { variant_id: number; quantity: number; modifiers?: number[]; note?: string }
): Promise<Bill> {
  return posRequest<Bill>('post', `/bills/${billId}/items`, line);
}

export function setQuantity(billId: number, itemId: number, quantity: number): Promise<Bill> {
  return posRequest<Bill>('patch', `/bills/${billId}/items/${itemId}`, { quantity });
}

/**
 * Retype a draft line from the sheet: another size of the same dish, other
 * answers, another note. Ids only, as at `addLine`; the server re-keys the
 * line and folds it into a twin when the change makes it one (К4m).
 */
export function updateLine(
  billId: number,
  itemId: number,
  patch: { variant_id?: number; modifiers?: number[]; note?: string }
): Promise<Bill> {
  return posRequest<Bill>('patch', `/bills/${billId}/items/${itemId}`, patch);
}

export function removeLine(billId: number, itemId: number): Promise<Bill> {
  return posRequest<Bill>('delete', `/bills/${billId}/items/${itemId}`);
}

/**
 * Send the draft to the kitchen.
 *
 * `client_uuid` is what makes a second tap on a bad connection harmless: the
 * server answers with the round the first one made rather than cooking dinner
 * twice (К4c). Generated per attempt-set by the caller, not per request.
 */
export function fireRound(billId: number, clientUuid: string): Promise<Bill> {
  return posRequest<Bill>('post', `/bills/${billId}/fire`, { client_uuid: clientUuid });
}

export function cancelRound(billId: number, roundId: number): Promise<Bill> {
  return posRequest<Bill>('post', `/bills/${billId}/rounds/${roundId}/cancel`);
}

export function moveBill(billId: number, tableId: number): Promise<Bill> {
  return posRequest<Bill>('post', `/bills/${billId}/move`, { table_id: tableId });
}

export function cancelBill(billId: number): Promise<Bill> {
  return posRequest<Bill>('post', `/bills/${billId}/cancel`);
}

// ── paying, and the pre-bill (К4g) ─────────────────────────────────────────

/** How one receipt of a split is paid. */
export interface PayPart {
  /** The lines this receipt covers. Absent = everything still owed. */
  line_ids?: number[];
  payments: Array<{ method: 'cash' | 'card' | 'qr'; amount_cents: number }>;
}

/**
 * Pay the bill, whole or in parts.
 *
 * One call carries both ways of dividing it, and the difference is the
 * server's to honour: a part with its own `line_ids` becomes its own sale
 * with its own fiscal receipt (dividing the dishes), while one part paid in
 * several rows stays one sale (dividing the sum). See §4.4 — a sale carries
 * at most one fiscal receipt, which is what makes these two different things
 * rather than one option.
 *
 * The answer is the bill as it stands afterwards; a part that fails leaves
 * the parts before it paid, so the screen re-reads rather than assumes.
 */
export function payBill(billId: number, parts: PayPart[]): Promise<{ bill: Bill; sale_ids: number[] }> {
  return posRequest<{ bill: Bill; sale_ids: number[] }>('post', `/bills/${billId}/pay`, { parts });
}

/**
 * Record that the pre-bill was printed.
 *
 * It binds nothing — the bill stays open and editable (§4.6); this only marks
 * that the sum was read out loud, so the table's tile can show it and the
 * next waiter does not print a second one. The printing itself is К4h.
 */
export function markPrecheck(billId: number): Promise<Bill> {
  return posRequest<Bill>('post', `/bills/${billId}/precheck`);
}

// ── the owner's hall editor (К4i) ──────────────────────────────────────────

export function createHall(name: string): Promise<PosHall> {
  return posRequest<PosHall>('post', '/halls', { name });
}

export function updateHall(
  hallId: number,
  patch: { name?: string; sort_order?: number; is_active?: boolean }
): Promise<PosHall> {
  return posRequest<PosHall>('patch', `/halls/${hallId}`, patch);
}

/** Only a hall nothing points at; the server says so in words when it is not. */
export function deleteHall(hallId: number): Promise<{ ok: boolean }> {
  return posRequest<{ ok: boolean }>('delete', `/halls/${hallId}`);
}

export interface TableDraft {
  hall_id?: number;
  name?: string;
  seats?: number;
  pos_x?: number;
  pos_y?: number;
  width?: number;
  height?: number;
  shape?: TableShape;
  is_active?: boolean;
}

export function createTable(table: TableDraft): Promise<PosTable> {
  return posRequest<PosTable>('post', '/tables', table);
}

export function updateTable(tableId: number, patch: TableDraft): Promise<PosTable> {
  return posRequest<PosTable>('patch', `/tables/${tableId}`, patch);
}

/**
 * Retire a table rather than delete it, wherever a bill ever sat at it — the
 * server refuses the delete in those words, because a deleted table would
 * take the history of what was sold at it with it.
 */
export function deleteTable(tableId: number): Promise<{ ok: boolean }> {
  return posRequest<{ ok: boolean }>('delete', `/tables/${tableId}`);
}

/**
 * Write the layout — the whole batch, in one transaction, after the owner
 * lets go (§6). N requests mid-drag would be both slower and, on a floor with
 * bad Wi-Fi, a half-saved room.
 */
export function moveTables(positions: TablePosition[]): Promise<{ tables: PosTable[] }> {
  return posRequest<{ tables: PosTable[] }>('patch', '/tables/positions', { positions });
}
