// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

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

/** Row shape of the `orders` table (see migrations/001_create_schema.sql). */
export interface Order {
  id: number;
  user_id: number;
  session_id?: number;
  created_at: Date;
  updated_at: Date;
  order_code?: string;
  tiktok_nickname: string;
  telegram_user_id?: bigint;
  product_code: string;
  size: string;
  quantity: number;
  status: 'pending' | 'reserved' | 'waiting_payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'unpaid' | 'paid' | 'refunded';
  customer_name?: string;
  phone_number?: string;
  city?: string;
  branch?: string;
  tracking_number?: string;
}

/** Row shape of the `reservations` table. */
export interface Reservation {
  id: number;
  user_id: number;
  session_id: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  tiktok_nickname: string;
  product_code: string;
  size: string;
  status: 'reserved' | 'expired' | 'ordered' | 'cancelled';
  converted_to_order_id?: number;
}
