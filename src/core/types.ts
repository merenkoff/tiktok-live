// src/core/types.ts

export interface User {
  id: number;
  tiktok_username: string;
  created_at: Date;
  is_active: boolean;
  subscription_level: 'free' | 'pro' | 'enterprise';
}

export interface UserSettings {
  id: number;
  user_id: number;
  telegram_bot_token: string;
  telegram_channel_id: bigint;
  novaposhta_api_key?: string;
  novaposhta_merchant_name?: string;
  reservation_timeout_minutes: number;
  payment_timeout_minutes: number;
  created_at: Date;
  updated_at: Date;
  tiktok_username?: string; // Added for convenience
}

export interface Session {
  id: number;
  user_id: number;
  status: 'stopped' | 'running' | 'paused';
  started_at?: Date;
  stopped_at?: Date;
  created_at: Date;
}

export interface SessionLog {
  id: number;
  session_id: number;
  user_id: number;
  log_type: 'tiktok_comment' | 'telegram_message' | 'order' | 'error' | 'info';
  message: string;
  data?: Record<string, any>;
  created_at: Date;
}

export interface Order {
  id: number;
  user_id: number;
  session_id?: number;
  created_at: Date;
  updated_at: Date;
  tiktok_nickname: string;
  telegram_id?: bigint;
  product_code: string;
  size: string;
  status: 'pending' | 'reserved' | 'waiting_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  customer_name?: string;
  phone?: string;
  city?: string;
  nova_poshta_branch?: string;
  tracking_number?: string;
  payment_confirmed_at?: Date;
  shipped_at?: Date;
}

export interface Reservation {
  id: number;
  user_id: number;
  session_id?: number;
  created_at: Date;
  expires_at: Date;
  tiktok_nickname: string;
  product_code: string;
  size: string;
  order_id?: number;
}
