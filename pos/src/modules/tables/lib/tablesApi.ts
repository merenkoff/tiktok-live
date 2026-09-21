// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's calls into `/api/pos`, all through the host's one client so
// the token, the base URL and the version header stay the host's business
// (`lib/hostPlatform.ts`).

import { posRequest } from './hostPlatform';
import type { Bill, OpenBillSummary, PosHall } from './types';

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
