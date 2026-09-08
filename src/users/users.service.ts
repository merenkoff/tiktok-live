// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/users/users.service.ts

import { pool } from '../db.js';
import type { User, UserSettings } from '../core/types.js';
import { logger } from '../logger.js';

export async function getUserByUsername(tiktok_username: string): Promise<User | null> {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE tiktok_username = $1',
      [tiktok_username]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get user by username', { error, tiktok_username });
    throw error;
  }
}

export async function getUserById(user_id: number): Promise<User | null> {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [user_id]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get user by id', { error, user_id });
    throw error;
  }
}

export async function createOrGetUser(tiktok_username: string): Promise<User> {
  try {
    // Try to get existing user
    logger.info(`TikTok getUserByUsername ${tiktok_username}`);
    const user = await getUserByUsername(tiktok_username);
    if (user) {
      logger.info(`TikTok user ${user}`);
      return user;
    }

    logger.info(`TikTok INSERT ${tiktok_username}`);
    // Create new user
    const result = await pool.query(
      `INSERT INTO users (tiktok_username, is_active, subscription_level)
       VALUES ($1, true, 'free')
       RETURNING *`,
      [tiktok_username]
    );

    logger.info(`New user created: ${tiktok_username}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create or get user', { error, tiktok_username });
    throw error;
  }
}

export async function getUserSettings(user_id: number): Promise<UserSettings | null> {
  try {
    const result = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [user_id]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get user settings', { error, user_id });
    throw error;
  }
}

/** Create empty settings row if missing (needed before session start). */
export async function ensureDefaultSettings(
  user_id: number,
  tiktok_username?: string
): Promise<UserSettings> {
  const existing = await getUserSettings(user_id);
  if (existing) return existing;

  try {
    const result = await pool.query(
      `INSERT INTO user_settings (
        user_id, tiktok_username,
        reservation_timeout_minutes, payment_timeout_minutes
      ) VALUES ($1, $2, 5, 10)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
      RETURNING *`,
      [user_id, tiktok_username || null]
    );
    logger.info(`Default settings created for user ${user_id}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to ensure default settings', { error, user_id });
    throw error;
  }
}

/**
 * A settings write. Three states per field, and the distinction matters:
 *
 *   `undefined`      keep whatever is stored
 *   `null` or `''`   clear the column
 *   a non-empty value set it
 *
 * The old shape gated every column on truthiness, so nothing could ever be
 * cleared, and combined with the controller masking secrets as `'***'` it let a
 * form round-trip write the literal `'***'` over a real Telegram token. Same
 * three-state rule the POS store patch already uses (`src/pos/routes/store.routes.ts`).
 */
export interface UserSettingsPatch {
  telegram_bot_token?: string | null;
  /** `bigint` column — carried as a string end to end so precision survives. */
  telegram_channel_id?: string | number | null;
  novaposhta_api_key?: string | null;
  novaposhta_merchant_name?: string | null;
  reservation_timeout_minutes?: number | null;
}

/**
 * Placeholder an older client may still echo back at us.
 *
 * The API no longer sends it — secrets are omitted and reported through
 * `*_set` booleans instead. But a browser holding a cached copy of the previous
 * admin build still hydrates `'***'` into its form and posts it on save, so
 * treating it as "unchanged" stays load-bearing until those clients are gone.
 * A user who genuinely wants `'***'` as their token cannot have it; that is the
 * right trade.
 */
const MASK_PLACEHOLDER = '***';

/** `undefined` → keep, `null`/blank → clear, otherwise set. */
function textPatch(value: string | null | undefined): { set: true; value: string | null } | null {
  if (value === undefined) return null;
  if (value === null) return { set: true, value: null };
  const trimmed = value.trim();
  if (!trimmed) return { set: true, value: null };
  if (trimmed === MASK_PLACEHOLDER) return null;
  return { set: true, value: trimmed };
}

/** Same three states, for the `bigint` channel id. Rejects non-numeric input. */
function channelPatch(
  value: string | number | null | undefined
): { set: true; value: string | null } | null {
  if (value === undefined) return null;
  if (value === null) return { set: true, value: null };
  const trimmed = String(value).trim();
  if (!trimmed) return { set: true, value: null };
  if (!/^-?\d{1,19}$/.test(trimmed)) {
    throw new Error('telegram_channel_id must be an integer');
  }
  return { set: true, value: trimmed };
}

export async function saveUserSettings(
  user_id: number,
  settings: UserSettingsPatch
): Promise<UserSettings> {
  const updates: string[] = [];
  const values: any[] = [user_id];
  let paramCount = 2;

  function add(column: string, patch: { set: true; value: unknown } | null) {
    if (!patch) return;
    updates.push(`${column} = $${paramCount++}`);
    values.push(patch.value);
  }

  add('telegram_bot_token', textPatch(settings.telegram_bot_token));
  add('telegram_channel_id', channelPatch(settings.telegram_channel_id));
  add('novaposhta_api_key', textPatch(settings.novaposhta_api_key));
  add('novaposhta_merchant_name', textPatch(settings.novaposhta_merchant_name));

  if (settings.reservation_timeout_minutes !== undefined) {
    const minutes = Number(settings.reservation_timeout_minutes);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) {
      throw new Error('reservation_timeout_minutes must be 1..1440');
    }
    add('reservation_timeout_minutes', { set: true, value: minutes });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // One statement, so a first-ever save races safely against a concurrent
    // `ensureDefaultSettings` from `loginUser`.
    await client.query(
      `INSERT INTO user_settings (user_id, reservation_timeout_minutes, payment_timeout_minutes)
       VALUES ($1, 5, 10)
       ON CONFLICT (user_id) DO NOTHING`,
      [user_id]
    );

    if (updates.length === 0) {
      const current = await client.query(`SELECT * FROM user_settings WHERE user_id = $1`, [
        user_id,
      ]);
      await client.query('COMMIT');
      return current.rows[0];
    }

    updates.push('updated_at = NOW()');
    const result = await client.query(
      `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $1 RETURNING *`,
      values
    );

    await client.query('COMMIT');
    logger.info(`Settings saved for user ${user_id}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to save user settings', { error, user_id });
    throw error;
  } finally {
    client.release();
  }
}

export async function getFullUserData(user_id: number): Promise<{
  user: User;
  settings: UserSettings | null;
} | null> {
  try {
    const user = await getUserById(user_id);
    if (!user) return null;

    const settings = await getUserSettings(user_id);
    return { user, settings };
  } catch (error) {
    logger.error('Failed to get full user data', { error, user_id });
    throw error;
  }
}
