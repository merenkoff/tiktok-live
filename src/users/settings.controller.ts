// src/users/settings.controller.ts

import { FastifyInstance } from 'fastify';
import * as usersService from './users.service.js';
import { ensureAuth } from '../core/auth.js';
import { logger } from '../logger.js';
import type { UserSettings } from '../core/types.js';

export async function registerSettingsRoutes(fastify: FastifyInstance) {
  /**
   * Get settings
   */
  fastify.get(
    '/api/settings',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);
        const settings = await usersService.getUserSettings(userId);

        if (!settings) {
          reply.status(404).send({ error: 'Settings not found' });
          return;
        }

        // Hide sensitive data
        const safe = { ...settings };
        if (safe.telegram_bot_token) {
          safe.telegram_bot_token = '***' as any;
        }
        if (safe.novaposhta_api_key) {
          safe.novaposhta_api_key = '***' as any;
        }

        reply.send(safe);
      } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
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
        // Type the request body properly
        const body = request.body as Partial<UserSettings>;
        const settings = await usersService.saveUserSettings(userId, body);

        // Hide sensitive data in response
        const safe = { ...settings };
        if (safe.telegram_bot_token) {
          safe.telegram_bot_token = '***' as any;
        }
        if (safe.novaposhta_api_key) {
          safe.novaposhta_api_key = '***' as any;
        }

        reply.send(safe);
      } catch (error) {
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
        logger.error('Telegram test error', { error });
        reply.status(500).send({ error: 'Test failed' });
      }
    }
  );
}
