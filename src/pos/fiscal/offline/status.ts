// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/offline/status.ts
//
// The `offline` and `holder` blocks of `GET /fiscal/status`. Composed in the
// route next to `shifts.getStatus` rather than inside it, so the shift
// service does not import the pool (which imports the shift service).

import { pool } from '../../../db.js';
import { getFiscalSettings, isOfflineCapable } from '../settings.service.js';
import { getHolder, touchHolder, type HolderView } from './holder.js';
import { countCodes } from './pool.js';

export interface OfflineSessionView {
  id: number;
  holder: 'server' | 'device';
  device_id: string | null;
  status: 'open' | 'replaying' | 'closed' | 'stuck';
  started_at: string;
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
    `SELECT id, holder, device_id, status, started_at
     FROM pos_fiscal_offline_sessions
     WHERE store_id = $1 AND cash_register_key = $2 AND status IN ('open', 'replaying', 'stuck')
     ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'replaying' THEN 1 ELSE 2 END, started_at DESC
     LIMIT 1`,
    [storeId, registerKey]
  );
  const s = live.rows[0];
  if (s) {
    block.session = {
      id: Number(s.id),
      holder: s.holder,
      device_id: s.device_id ?? null,
      status: s.status,
      started_at: new Date(s.started_at).toISOString(),
    };
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
