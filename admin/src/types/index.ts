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
  
  export interface UserSettings {
    id: number;
    user_id: number;
    telegram_bot_token?: string;
    telegram_channel_id?: number;
    novaposhta_api_key?: string;
    novaposhta_merchant_name?: string;
    tiktok_username?: string;
    reservation_timeout_minutes: number;
    payment_timeout_minutes: number;
    created_at: string;
    updated_at: string;
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