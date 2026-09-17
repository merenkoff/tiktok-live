// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import * as analyticsService from '../analytics.service.js';
import {
  assertSingleFiscalRemote,
  assertSingleVerticalRemote,
  ModuleRemoteConflictError,
  sanitizeEnabledModules,
  sanitizeModuleRemotes,
} from '../core/modules.js';
import { sanitizeNavOverrides } from '../core/nav.js';
import { getFiscalSettings } from '../fiscal/settings.service.js';
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
      auto_print_receipt?: boolean;
      enabled_modules?: unknown;
      module_remotes?: unknown;
      nav_overrides?: unknown;
      live_tiktok_username?: string | null;
      vertical?: unknown;
    };
    try {
      // What a store sells is not the owner's to change: it decides the product
      // attribute schema of a catalogue they have already filled in. Only the
      // super admin writes it (`PATCH /super/stores/:id`), which also relabels
      // every variant in the same transaction.
      if (body.vertical !== undefined) {
        return reply.code(400).send({ error: 'vertical is set by the super admin' });
      }
      const patch: analyticsService.StorePatch = {};
      if (body.enabled_modules !== undefined) {
        if (!Array.isArray(body.enabled_modules)) {
          return reply.code(400).send({ error: 'enabled_modules must be an array' });
        }
        patch.enabled_modules = sanitizeEnabledModules(body.enabled_modules);
      }
      if (body.module_remotes !== undefined) {
        if (
          body.module_remotes === null ||
          typeof body.module_remotes !== 'object' ||
          Array.isArray(body.module_remotes)
        ) {
          return reply.code(400).send({ error: 'module_remotes must be an object' });
        }
        const sanitized = sanitizeModuleRemotes(body.module_remotes);
        // Two fiscal-* entries would otherwise sit there silently: the desktop
        // cache only downloads strictly-newer versions of a given id, and a
        // route collision between two bundles resolves by array order with no
        // error anywhere. See TechDocs/POS_FISCAL_PRRO.md §11.4.
        const fiscalSettings = await getFiscalSettings(auth.storeId);
        try {
          assertSingleFiscalRemote(sanitized, fiscalSettings?.provider ?? null);
          // Same rule for the sell screen: one `vertical-*` bundle, and it has
          // to be the vertical the store is actually set to, or the module
          // downloads and is then never asked to render.
          assertSingleVerticalRemote(sanitized, auth.vertical);
        } catch (error) {
          if (error instanceof ModuleRemoteConflictError) {
            return reply.code(400).send({ error: errorMessage(error) });
          }
          throw error;
        }
        patch.module_remotes = sanitized;
      }
      if (body.nav_overrides !== undefined) {
        if (
          body.nav_overrides === null ||
          typeof body.nav_overrides !== 'object' ||
          Array.isArray(body.nav_overrides)
        ) {
          return reply.code(400).send({ error: 'nav_overrides must be an object' });
        }
        // Menu appearance only — labels, icon names and sort keys. It can never
        // add or remove an entry: which modules a store has is `enabled_modules`
        // and `module_remotes`, and both are gated above.
        patch.nav_overrides = sanitizeNavOverrides(body.nav_overrides);
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

      if (body.live_tiktok_username !== undefined) {
        // Owner-only (this whole route is): connecting the store to a TikTok
        // account is what lets any staff member mint a LIVE token for it.
        // `null` / '' clears the link; a leading `@` is stripped so both
        // "@shop" and "shop" store the same nickname.
        const raw = (body.live_tiktok_username ?? '').trim().replace(/^@/, '');
        if (raw && !/^[A-Za-z0-9._]{2,64}$/.test(raw)) {
          return reply.code(400).send({ error: 'live_tiktok_username is not a TikTok nickname' });
        }
        patch.live_tiktok_username = raw || null;
      }

      if (body.gtin_lookup_enabled !== undefined) patch.gtin_lookup_enabled = Boolean(body.gtin_lookup_enabled);
      if (body.auto_print_receipt !== undefined) patch.auto_print_receipt = Boolean(body.auto_print_receipt);
      return await analyticsService.updateStore(auth.storeId, patch);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
