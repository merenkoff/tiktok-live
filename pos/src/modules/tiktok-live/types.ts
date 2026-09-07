// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Local mirrors of the TikTok LIVE side's wire types. Deliberately NOT imported
// from the root backend or from `admin/`: this module is built as a standalone
// remote chunk with only `@pos/platform` shared, so everything it needs beyond
// that surface lives inside its own folder.

export type SessionLogType =
  | 'tiktok_comment'
  | 'telegram_message'
  | 'order'
  | 'error'
  | 'info';

export interface SessionLog {
  id: number;
  session_id: number;
  user_id: number;
  log_type: SessionLogType;
  message: string;
  data?: Record<string, unknown>;
  created_at: string;
}

export interface LiveSession {
  id: number;
  user_id: number;
  status: 'stopped' | 'running' | 'paused';
  started_at?: string | null;
  stopped_at?: string | null;
  created_at?: string;
}

/**
 * Response of the POS→LIVE bridge (`POST /api/pos/live/session-token`).
 * Declared locally rather than imported from the host's `types.ts`: the module
 * owns its view of the wire format, so a host type change can't silently
 * retype it. See `lib/hostPlatform.ts`.
 */
export interface BridgeTokenResponse {
  token: string;
  user: { id: number; tiktok_username: string };
  expiresAt: string;
}
