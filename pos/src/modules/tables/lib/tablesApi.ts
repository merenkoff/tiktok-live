// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's calls into `/api/pos`, all through the host's one client so
// the token, the base URL and the version header stay the host's business
// (`lib/hostPlatform.ts`).

import { posRequest } from './hostPlatform';
import type { OpenBillSummary, PosHall } from './types';

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
