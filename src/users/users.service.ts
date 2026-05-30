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
    let user = await getUserByUsername(tiktok_username);
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

export async function saveUserSettings(
  user_id: number,
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if settings exist
      const existing = await client.query(
        'SELECT id FROM user_settings WHERE user_id = $1',
        [user_id]
      );

      let result;
      if (existing.rows.length === 0) {
        // Insert new
        result = await client.query(
          `INSERT INTO user_settings (
            user_id, telegram_bot_token, telegram_channel_id,
            novaposhta_api_key, novaposhta_merchant_name,
            reservation_timeout_minutes, payment_timeout_minutes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            user_id,
            settings.telegram_bot_token,
            settings.telegram_channel_id,
            settings.novaposhta_api_key,
            settings.novaposhta_merchant_name,
            settings.reservation_timeout_minutes || 5,
            settings.payment_timeout_minutes || 10,
          ]
        );
      } else {
        // Update existing
        const updates = [];
        const values: any[] = [user_id];
        let paramCount = 2;

        if (settings.telegram_bot_token) {
          updates.push(`telegram_bot_token = $${paramCount++}`);
          values.push(settings.telegram_bot_token);
        }
        if (settings.telegram_channel_id) {
          updates.push(`telegram_channel_id = $${paramCount++}`);
          values.push(settings.telegram_channel_id);
        }
        if (settings.novaposhta_api_key) {
          updates.push(`novaposhta_api_key = $${paramCount++}`);
          values.push(settings.novaposhta_api_key);
        }
        if (settings.novaposhta_merchant_name) {
          updates.push(`novaposhta_merchant_name = $${paramCount++}`);
          values.push(settings.novaposhta_merchant_name);
        }
        if (settings.reservation_timeout_minutes) {
          updates.push(`reservation_timeout_minutes = $${paramCount++}`);
          values.push(settings.reservation_timeout_minutes);
        }

        updates.push(`updated_at = NOW()`);

        result = await client.query(
          `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $1
           RETURNING *`,
          values
        );
      }

      await client.query('COMMIT');
      logger.info(`Settings saved for user ${user_id}`);
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to save user settings', { error, user_id });
    throw error;
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
