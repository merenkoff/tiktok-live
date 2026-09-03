// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import * as analyticsService from '../analytics.service.js';
import { sanitizeEnabledModules } from '../core/modules.js';
import { errorMessage } from './_shared.js';

export function registerStoreRoutes(fastify: FastifyInstance): void {
  fastify.get('/store', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return analyticsService.getStore(auth.storeId);
  });

  fastify.patch('/store', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = request.body as {
      name?: string;
      qr_payment_enabled?: boolean;
      qr_payment_mode?: string;
      qr_static_image_url?: string | null;
      qr_purpose_template?: string | null;
      qr_iban?: string | null;
      qr_edrpou?: string | null;
      qr_recipient?: string | null;
      gtin_lookup_enabled?: boolean;
      gtin_api_key?: string | null;
      gtin_daily_limit?: number | null;
      auto_print_receipt?: boolean;
      enabled_modules?: unknown;
    };
    try {
      const patch: analyticsService.StorePatch = {};
      if (body.enabled_modules !== undefined) {
        if (!Array.isArray(body.enabled_modules)) {
          return reply.code(400).send({ error: 'enabled_modules must be an array' });
        }
        patch.enabled_modules = sanitizeEnabledModules(body.enabled_modules);
      }
      if (body.name !== undefined) {
        if (!body.name.trim()) return reply.code(400).send({ error: 'name required' });
        patch.name = body.name;
      }
      if (body.qr_payment_mode !== undefined) {
        if (body.qr_payment_mode !== 'static' && body.qr_payment_mode !== 'dynamic') {
          return reply.code(400).send({ error: 'qr_payment_mode must be static or dynamic' });
        }
        patch.qr_payment_mode = body.qr_payment_mode;
      }
      if (body.qr_payment_enabled !== undefined) patch.qr_payment_enabled = Boolean(body.qr_payment_enabled);
      if (body.qr_static_image_url !== undefined) patch.qr_static_image_url = body.qr_static_image_url;
      if (body.qr_purpose_template !== undefined) patch.qr_purpose_template = body.qr_purpose_template;
      if (body.qr_iban !== undefined) patch.qr_iban = body.qr_iban;
      if (body.qr_edrpou !== undefined) patch.qr_edrpou = body.qr_edrpou;
      if (body.qr_recipient !== undefined) patch.qr_recipient = body.qr_recipient;

      if (body.gtin_lookup_enabled !== undefined) patch.gtin_lookup_enabled = Boolean(body.gtin_lookup_enabled);
      if (body.auto_print_receipt !== undefined) patch.auto_print_receipt = Boolean(body.auto_print_receipt);
      // Secret: only a non-empty string sets it; explicit null / "" clears it; anything else leaves it unchanged.
      if (typeof body.gtin_api_key === 'string' && body.gtin_api_key.trim()) {
        patch.gtin_api_key = body.gtin_api_key.trim();
      } else if (body.gtin_api_key === null || body.gtin_api_key === '') {
        patch.gtin_api_key = null;
      }
      if (body.gtin_daily_limit === null) {
        patch.gtin_daily_limit = null;
      } else if (body.gtin_daily_limit !== undefined) {
        const n = Number(body.gtin_daily_limit);
        if (!Number.isInteger(n) || n <= 0) {
          return reply.code(400).send({ error: 'gtin_daily_limit must be a positive integer' });
        }
        patch.gtin_daily_limit = n;
      }
      return await analyticsService.updateStore(auth.storeId, patch);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
