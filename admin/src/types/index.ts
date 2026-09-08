// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export interface User {
    id: number;
    tiktok_username: string;
    created_at: string;
    is_active: boolean;
    subscription_level: 'free' | 'pro' | 'enterprise';
  }
  
  /**
   * What `GET /api/settings` returns. Secrets are **omitted**, and their
   * presence reported as `*_set` — the API used to mask them as `'***'`, which
   * this form posted back and wrote over the real token.
   *
   * `payment_timeout_minutes` is gone from the contract: nothing read it.
   */
  export interface UserSettings {
    user_id: number;
    tiktok_username: string | null;
    telegram_bot_token_set: boolean;
    /** `bigint` column — a string all the way, so precision survives. */
    telegram_channel_id: string | null;
    novaposhta_api_key_set: boolean;
    novaposhta_merchant_name: string | null;
    reservation_timeout_minutes: number;
  }

  /**
   * What `PUT /api/settings` accepts. Three states per field:
   * omit to keep, `null` or `''` to clear, a value to set.
   */
  export interface UserSettingsPatch {
    telegram_bot_token?: string | null;
    telegram_channel_id?: string | null;
    novaposhta_api_key?: string | null;
    novaposhta_merchant_name?: string | null;
    reservation_timeout_minutes?: number;
  }
  
  export interface Session {
    id: number;
    user_id: number;
    status: 'stopped' | 'running' | 'paused';
    started_at?: string;
    stopped_at?: string;
    created_at: string;
  }
  
  export interface SessionLog {
    id: number;
    session_id: number;
    user_id: number;
    log_type: 'tiktok_comment' | 'telegram_message' | 'order' | 'error' | 'info';
    message: string;
    data?: Record<string, any>;
    created_at: string;
  }
  
  export interface AuthResponse {
    token: string;
    user: User;
  }