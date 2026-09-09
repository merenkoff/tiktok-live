// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The stocktake module's own IndexedDB (roadmap #12 track 3). Deliberately a
 * separate database, not tables inside the shell's `cloth-pos-offline`: Dexie
 * versions a database as one schema, and a module that ships on its own
 * cadence cannot take part in the shell's version history. This one is
 * versioned here, by this module, and nobody else opens it.
 *
 * `dexie` is an external in the remote build — the host's copy, via the import
 * map — so no second Dexie ships in the chunk.
 */

import Dexie, { type Table } from 'dexie';

export type SheetStatus =
  /** Being counted on this till. */
  | 'counting'
  /** Finished; waiting for the network. */
  | 'queued'
  /** A submission failed with a retryable error; will be retried with backoff. */
  | 'error'
  /** On the server as a draft `inventory` document. */
  | 'synced'
  /** The server will never accept it; needs a person. */
  | 'dead';

export interface SheetRow {
  /** UUID — also the `client_uuid` the server dedupes on. */
  id: string;
  storeId: number;
  staffId: number;
  status: SheetStatus;
  note: string | null;
  createdAt: number;
  finishedAt?: number;
  serverDocId?: number;
  serverDocNumber?: string;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  deadReason?: 'rejected' | 'attempts_exhausted';
}

export interface LineRow {
  sheetId: string;
  variantId: number;
  countedQty: number;
  /** "Product · size · color" captured at scan time — the list renders without the catalog. */
  label: string;
  barcode: string | null;
  updatedAt: number;
}

class StocktakeDB extends Dexie {
  sheets!: Table<SheetRow, string>;
  lines!: Table<LineRow, [string, number]>;

  constructor() {
    super('cloth-pos-module-stocktake');
    this.version(1).stores({
      sheets: 'id, storeId, status, createdAt',
      lines: '[sheetId+variantId], sheetId',
    });
  }
}

export const db = new StocktakeDB();
