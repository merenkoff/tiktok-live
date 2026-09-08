// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/users/settings.controller.ts

import { FastifyInstance } from 'fastify';
import * as usersService from './users.service.js';
import { ensureAuth, isUnauthorizedError } from '../core/auth.js';
import { logger } from '../logger.js';
import type { UserSettings } from '../core/types.js';
import type { UserSettingsPatch } from './users.service.js';

/**
 * What a client is allowed to see.
 *
 * Secrets are **omitted**, not masked. Masking them as `'***'` meant the value
 * round-tripped through the form and was written back over the real token, so
 * an operator who changed only the reservation timer silently destroyed their
 * Telegram bot credential. Reporting presence as a boolean mirrors
 * `gtin_api_key_set` on the POS store payload.
 *
 * `payment_timeout_minutes` is deliberately absent: nothing reads it at
 * runtime, so exposing it would only offer a control that does nothing.
 */
export interface UserSettingsView {
  user_id: number;
  tiktok_username: string | null;
  telegram_bot_token_set: boolean;
  telegram_channel_id: string | null;
  novaposhta_api_key_set: boolean;
  novaposhta_merchant_name: string | null;
  reservation_timeout_minutes: number;
}

export function toSettingsView(settings: UserSettings): UserSettingsView {
  return {
    user_id: Number(settings.user_id),
    tiktok_username: settings.tiktok_username ?? null,
    telegram_bot_token_set: Boolean(settings.telegram_bot_token),
    // `bigint` column: node-pg hands it back as a string, and it stays one all
    // the way to the client so precision cannot be lost to a float.
    telegram_channel_id:
      settings.telegram_channel_id == null ? null : String(settings.telegram_channel_id),
    novaposhta_api_key_set: Boolean(settings.novaposhta_api_key),
    novaposhta_merchant_name: settings.novaposhta_merchant_name ?? null,
    reservation_timeout_minutes: Number(settings.reservation_timeout_minutes),
  };
}

export async function registerSettingsRoutes(fastify: FastifyInstance) {
  /**
   * Get settings
   */
  fastify.get(
    '/api/settings',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);
        let settings = await usersService.getUserSettings(userId);

        if (!settings) {
          settings = await usersService.ensureDefaultSettings(userId);
        }

        reply.send(toSettingsView(settings));
      } catch (error) {
        if (isUnauthorizedError(error)) {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }
        logger.error('Settings get error', { error });
        reply.status(500).send({ error: 'Failed to get settings' });
      }
    }
  );

  /**
   * Save settings
   */
  fastify.put(
    '/api/settings',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);
        const body = request.body as UserSettingsPatch;
        const settings = await usersService.saveUserSettings(userId, body);
        reply.send(toSettingsView(settings));
      } catch (error) {
        if (isUnauthorizedError(error)) {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }
        // Field-level validation (`saveUserSettings`) is the caller's fault, not ours.
        const message = error instanceof Error ? error.message : '';
        if (message.includes('must be')) {
          reply.status(400).send({ error: message });
          return;
        }
        logger.error('Settings save error', { error });
        reply.status(500).send({ error: 'Failed to save settings' });
      }
    }
  );

  /**
   * Test Telegram
   */
  fastify.post(
    '/api/settings/test-telegram',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);
        const settings = await usersService.getUserSettings(userId);

        if (!settings?.telegram_bot_token) {
          reply.status(400).send({ error: 'Telegram token not set' });
          return;
        }

        const response = await fetch(
          `https://api.telegram.org/bot${settings.telegram_bot_token}/getMe`
        );

        if (response.ok) {
          reply.send({ ok: true, message: 'Telegram bot is working' });
        } else {
          reply.status(400).send({ error: 'Invalid Telegram token' });
        }
      } catch (error) {
        if (isUnauthorizedError(error)) {
          reply.status(401).send({ error: 'Unauthorized' });
          return;
        }
        logger.error('Telegram test error', { error });
        reply.status(500).send({ error: 'Test failed' });
      }
    }
  );
}
