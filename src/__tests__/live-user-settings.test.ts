// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/live-user-settings.test.ts
//
// `saveUserSettings` + the settings view. This is the code path shared by the
// LIVE admin SPA and (from here on) the POS `tiktok-live` module, and it used
// to lose data: every column was gated on truthiness, so nothing could be
// cleared, and the controller masked secrets as `'***'` — which a form posted
// straight back, writing the literal `'***'` over a real Telegram token.
//
// Needs the LIVE schema (`users` / `user_settings`) — `applyLiveMigrations()`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db.js';
import { toSettingsView } from '../users/settings.controller.js';
import {
  getUserSettings,
  saveUserSettings,
  ensureDefaultSettings,
} from '../users/users.service.js';
import { applyLiveMigrations, applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';

const REAL_TOKEN = '123456:AAH-real-bot-token';

describe.skipIf(!hasDb)('saveUserSettings', () => {
  const nickname = `set_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let userId: number;

  beforeAll(async () => {
    await applyPosMigrations();
    await applyLiveMigrations();
    const user = await pool.query(
      `INSERT INTO users (tiktok_username) VALUES ($1) RETURNING id`,
      [nickname]
    );
    userId = Number(user.rows[0].id);
    await ensureDefaultSettings(userId, nickname);
  }, 120000);

  beforeEach(async () => {
    await pool.query(
      `UPDATE user_settings
       SET telegram_bot_token = $2, telegram_channel_id = $3,
           novaposhta_api_key = $4, novaposhta_merchant_name = $5,
           reservation_timeout_minutes = 5
       WHERE user_id = $1`,
      [userId, REAL_TOKEN, '-1001234567890', 'np-key', 'Shop']
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE tiktok_username = $1`, [nickname]);
    await pool.end();
  });

  it('keeps a stored secret when the field is omitted', async () => {
    await saveUserSettings(userId, { reservation_timeout_minutes: 15 });
    const after = await getUserSettings(userId);
    expect(after!.telegram_bot_token).toBe(REAL_TOKEN);
    expect(after!.novaposhta_api_key).toBe('np-key');
    expect(after!.reservation_timeout_minutes).toBe(15);
  });

  it('never stores the mask placeholder over a real secret', async () => {
    // What an older cached client still posts back after loading a masked GET.
    await saveUserSettings(userId, { telegram_bot_token: '***', novaposhta_api_key: '***' });
    const after = await getUserSettings(userId);
    expect(after!.telegram_bot_token).toBe(REAL_TOKEN);
    expect(after!.novaposhta_api_key).toBe('np-key');
  });

  it('sets a new secret when one is supplied', async () => {
    await saveUserSettings(userId, { telegram_bot_token: '999:NEW-token' });
    expect((await getUserSettings(userId))!.telegram_bot_token).toBe('999:NEW-token');
  });

  it('trims incoming values', async () => {
    await saveUserSettings(userId, { novaposhta_merchant_name: '  Крамниця  ' });
    expect((await getUserSettings(userId))!.novaposhta_merchant_name).toBe('Крамниця');
  });

  it('clears a field on explicit null', async () => {
    await saveUserSettings(userId, { novaposhta_api_key: null });
    expect((await getUserSettings(userId))!.novaposhta_api_key).toBeNull();
  });

  it('clears a field on an empty or blank string', async () => {
    await saveUserSettings(userId, { novaposhta_merchant_name: '' });
    expect((await getUserSettings(userId))!.novaposhta_merchant_name).toBeNull();
    await saveUserSettings(userId, { telegram_bot_token: '   ' });
    expect((await getUserSettings(userId))!.telegram_bot_token).toBeNull();
  });

  it('clears the channel id, which the old truthiness gate could never do', async () => {
    await saveUserSettings(userId, { telegram_channel_id: null });
    expect((await getUserSettings(userId))!.telegram_channel_id).toBeNull();
  });

  it('keeps the channel id exact — it is a bigint, not a float', async () => {
    await saveUserSettings(userId, { telegram_channel_id: '-1009007199254740993' });
    const view = toSettingsView((await getUserSettings(userId))!);
    expect(view.telegram_channel_id).toBe('-1009007199254740993');
  });

  it('rejects a non-numeric channel id', async () => {
    await expect(saveUserSettings(userId, { telegram_channel_id: 'not-a-number' })).rejects.toThrow(
      /must be an integer/
    );
  });

  it('rejects an out-of-range reservation timer', async () => {
    await expect(saveUserSettings(userId, { reservation_timeout_minutes: 0 })).rejects.toThrow(
      /must be 1\.\.1440/
    );
    await expect(saveUserSettings(userId, { reservation_timeout_minutes: 5000 })).rejects.toThrow(
      /must be 1\.\.1440/
    );
  });

  it('is a no-op for an empty patch', async () => {
    const before = await getUserSettings(userId);
    const after = await saveUserSettings(userId, {});
    expect(after.telegram_bot_token).toBe(before!.telegram_bot_token);
    expect(after.reservation_timeout_minutes).toBe(before!.reservation_timeout_minutes);
  });

  it('creates the row when a user saves before ever loading settings', async () => {
    const fresh = `set_fresh_${Date.now()}`;
    const user = await pool.query(
      `INSERT INTO users (tiktok_username) VALUES ($1) RETURNING id`,
      [fresh]
    );
    const freshId = Number(user.rows[0].id);
    try {
      await saveUserSettings(freshId, { novaposhta_merchant_name: 'Нова' });
      expect((await getUserSettings(freshId))!.novaposhta_merchant_name).toBe('Нова');
    } finally {
      await pool.query(`DELETE FROM users WHERE tiktok_username = $1`, [fresh]);
    }
  });
});

describe.skipIf(!hasDb)('toSettingsView', () => {
  it('reports secrets as booleans and never ships their value', () => {
    const view = toSettingsView({
      user_id: 7,
      tiktok_username: 'shop',
      telegram_bot_token: REAL_TOKEN,
      telegram_channel_id: '-100123',
      novaposhta_api_key: 'np-key',
      novaposhta_merchant_name: 'Shop',
      reservation_timeout_minutes: 5,
    } as never);

    expect(view).toEqual({
      user_id: 7,
      tiktok_username: 'shop',
      telegram_bot_token_set: true,
      telegram_channel_id: '-100123',
      novaposhta_api_key_set: true,
      novaposhta_merchant_name: 'Shop',
      reservation_timeout_minutes: 5,
    });
    expect(JSON.stringify(view)).not.toContain(REAL_TOKEN);
    expect(JSON.stringify(view)).not.toContain('np-key');
    // The dead control is gone from the contract, not merely unused.
    expect(view).not.toHaveProperty('payment_timeout_minutes');
  });

  it('reports absent secrets as false', () => {
    const view = toSettingsView({
      user_id: 7,
      tiktok_username: null,
      telegram_bot_token: null,
      telegram_channel_id: null,
      novaposhta_api_key: null,
      novaposhta_merchant_name: null,
      reservation_timeout_minutes: 5,
    } as never);
    expect(view.telegram_bot_token_set).toBe(false);
    expect(view.novaposhta_api_key_set).toBe(false);
    expect(view.telegram_channel_id).toBeNull();
  });
});
