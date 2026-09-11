// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/status.ts
//
// The `offline` and `holder` blocks of `GET /fiscal/status`. Composed in the
// route next to `shifts.getStatus` rather than inside it, so the shift
// service does not import the pool (which imports the shift service).

import { pool } from '../../../db.js';
import { countSessionDocuments, type SessionDocumentCounts } from '../ledger.js';
import { getFiscalSettings, isOfflineCapable } from '../settings.service.js';
import { getHolder, touchHolder, type HolderView } from './holder.js';
import { countCodes } from './pool.js';
import type { OfflineSessionRow } from './session.js';

export interface OfflineSessionView {
  id: number;
  holder: 'server' | 'device';
  device_id: string | null;
  status: 'open' | 'replaying' | 'closed' | 'stuck';
  started_at: string;
  ended_at: string | null;
  /** The replay has sent `go-offline`; documents follow. */
  go_offline_sent: boolean;
  last_go_online_at: string | null;
  documents: SessionDocumentCounts;
  error_code: string | null;
  error_message: string | null;
}

export async function sessionView(row: OfflineSessionRow): Promise<OfflineSessionView> {
  return {
    id: row.id,
    holder: row.holder,
    device_id: row.device_id ?? null,
    status: row.status,
    started_at: new Date(row.started_at).toISOString(),
    ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    go_offline_sent: row.go_offline_tx_id != null,
    last_go_online_at: row.last_go_online_at ? new Date(row.last_go_online_at).toISOString() : null,
    documents: await countSessionDocuments(row.id),
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
  };
}

export interface OfflineStatusBlock {
  capable: boolean;
  enabled: boolean;
  codes_target: number;
  codes: { free: number; leased: number; used: number } | null;
  session: OfflineSessionView | null;
}

export interface HolderStatusBlock extends HolderView {
  /** True when the caller's own device id is the holder. */
  is_me: boolean;
}

export interface OfflineStatus {
  offline: OfflineStatusBlock;
  holder: HolderStatusBlock | null;
}

function readRegisterKey(config: Record<string, unknown>): string {
  const value = config.cashRegisterKey;
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
}

/**
 * Cheap and DB-only: no provider call. `deviceId` is the caller's, used both
 * for `is_me` and to record the holder's heartbeat.
 */
export async function getOfflineStatus(
  storeId: number,
  deviceId: string | null
): Promise<OfflineStatus> {
  const settings = await getFiscalSettings(storeId);
  const capable = isOfflineCapable(settings?.provider);
  const enabled = Boolean(settings?.enabled && settings.offline_mode && capable);
  const block: OfflineStatusBlock = {
    capable,
    enabled,
    codes_target: settings?.offline_codes_target ?? 0,
    codes: null,
    session: null,
  };
  if (!settings || !enabled) return { offline: block, holder: null };

  const registerKey = readRegisterKey(settings.config);
  const counts = await countCodes(storeId, registerKey);
  block.codes = { free: counts.free, leased: counts.leased, used: counts.used };

  const live = await pool.query(
    `SELECT * FROM pos_fiscal_offline_sessions
     WHERE store_id = $1 AND cash_register_key = $2 AND status IN ('open', 'replaying', 'stuck')
     ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'replaying' THEN 1 ELSE 2 END, started_at DESC
     LIMIT 1`,
    [storeId, registerKey]
  );
  const s = live.rows[0] as Record<string, unknown> | undefined;
  if (s) {
    block.session = await sessionView({
      ...(s as unknown as OfflineSessionRow),
      id: Number(s.id),
      store_id: Number(s.store_id),
      shift_id: s.shift_id == null ? null : Number(s.shift_id),
    });
  }

  // Heartbeat before reading, so the holder's own poll never reports itself
  // stale. `touchHolder` only writes when its throttle says so.
  if (deviceId) await touchHolder(storeId, deviceId);
  const holder = await getHolder(storeId);
  return {
    offline: block,
    holder: holder ? { ...holder, is_me: holder.device_id === deviceId } : null,
  };
}
