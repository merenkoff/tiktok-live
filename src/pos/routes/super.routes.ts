// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/super.routes.ts — `/api/pos/super/*`, the cross-store admin
// (TechDocs/POS_SUPER_ADMIN.md). Core group (`moduleId: null`): it belongs to
// no store, so neither `ensureModule` nor `ensurePosAuth` apply — the gate is
// `ensureSuper` and the password in `POS_SUPER_PASSWORD`.
//
// Besides the stores, the super admin reads the marketing site's leads
// (`/super/leads`, TechDocs/CRM_LEADS.md): the one place they can be listed —
// the old `GET /api/admin/leads`, which any LIVE token could read, is gone.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../logger.js';
import {
  ensureSuper,
  isMenuWallKey,
  isSuperConfigured,
  issueSuperToken,
  loginAttemptAllowed,
  menuWallKey,
  recordLoginFailure,
  recordLoginSuccess,
  verifySuperPassword,
} from '../core/superAuth.js';
import { menuScansSummary, menuWallSnapshot } from '../menu-opens.service.js';
import * as printerProfiles from '../printer-profiles.service.js';
import * as superService from '../super.service.js';
import * as menuImport from '../import/menu-import.service.js';
import { MenuImportError } from '../import/choiceqr.js';
import * as leads from '../../crm/leads.service.js';
import * as licenses from '../license/activations.service.js';
import { errorMessage } from './_shared.js';

export function registerSuperRoutes(fastify: FastifyInstance): void {
  fastify.post('/super/login', async (request, reply) => {
    if (!isSuperConfigured()) {
      // Distinct from 401: the operator has to set the variable, not retype.
      return reply.code(503).send({ error: 'super_not_configured' });
    }
    const gate = loginAttemptAllowed(request.ip);
    if (!gate.allowed) {
      reply.header('Retry-After', String(Math.ceil(gate.retryAfterMs / 1000)));
      return reply.code(429).send({ error: 'Too many attempts, try again later' });
    }
    const { password } = (request.body ?? {}) as { password?: unknown };
    if (typeof password !== 'string' || !verifySuperPassword(password)) {
      recordLoginFailure(request.ip);
      logger.warn('pos super: failed login', { ip: request.ip });
      return reply.code(401).send({ error: 'Invalid password' });
    }
    recordLoginSuccess(request.ip);
    const issued = issueSuperToken();
    if (!issued) return reply.code(503).send({ error: 'super_not_configured' });
    logger.info('pos super: login', { ip: request.ip });
    return { token: issued.token, expires_at: issued.expiresAt.toISOString() };
  });

  fastify.get('/super/stores', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    return superService.listStores();
  });

  // A store for a new client (TechDocs/POS_ONBOARDING.md, O1). The body carries
  // the owner's password, so nothing of the body is logged but the store code.
  fastify.post('/super/stores', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    try {
      const created = await superService.createStore((request.body ?? {}) as superService.CreateStoreInput);
      logger.info('pos super: new store', { ip: request.ip, storeId: created.id, slug: created.slug });
      return reply.code(201).send(created);
    } catch (error) {
      if (error instanceof superService.SuperValidationError) {
        return reply.code(400).send({ error: errorMessage(error) });
      }
      if (error instanceof superService.SuperConflictError) {
        return reply.code(409).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  fastify.patch('/super/stores/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const storeId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return reply.code(400).send({ error: 'bad store id' });
    }
    const body = (request.body ?? {}) as {
      enabled_modules?: unknown;
      module_remotes?: unknown;
      vertical?: unknown;
    };
    try {
      const updated = await superService.patchStoreModules(storeId, body);
      if (!updated) return reply.code(404).send({ error: 'Store not found' });
      logger.info('pos super: store modules patched', {
        ip: request.ip,
        storeId,
        fields: Object.keys(body),
      });
      return updated;
    } catch (error) {
      if (error instanceof superService.SuperValidationError) {
        return reply.code(400).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  // «Імпорт з ChoiceQR» (TechDocs/POS_ONBOARDING.md, O2): without `apply` the
  // plan, with it one chunk of `limit` cards from `offset` — the client walks
  // the chunks, so no single request outlives a proxy timeout.
  fastify.post('/super/stores/:id/import/choiceqr', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const storeId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return reply.code(400).send({ error: 'bad store id' });
    }
    const body = (request.body ?? {}) as { url?: unknown; apply?: unknown; offset?: unknown; limit?: unknown };
    if (typeof body.url !== 'string' || !body.url.trim()) {
      return reply.code(400).send({ error: 'Вставте посилання на меню ChoiceQR' });
    }
    try {
      if (body.apply !== true) return await menuImport.previewChoiceQrImport(storeId, body.url);
      const chunk = await menuImport.applyChoiceQrImport(storeId, body.url, { offset: body.offset, limit: body.limit });
      logger.info('pos super: menu import chunk', { ip: request.ip, storeId, next: chunk.next_offset, done: chunk.done });
      return chunk;
    } catch (error) {
      if (error instanceof MenuImportError) return reply.code(400).send({ error: errorMessage(error) });
      throw error;
    }
  });

  fastify.post('/super/module-remotes/repoint', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const body = (request.body ?? {}) as { module_id?: unknown; url?: unknown; store_ids?: unknown };
    if (typeof body.module_id !== 'string' || typeof body.url !== 'string') {
      return reply.code(400).send({ error: 'module_id and url required' });
    }
    try {
      const report = await superService.repointModuleRemote({
        moduleId: body.module_id,
        url: body.url,
        storeIds: body.store_ids as number[] | undefined,
      });
      logger.info('pos super: module remote repointed', {
        ip: request.ip,
        moduleId: body.module_id,
        updated: report.updated.map((s) => s.id),
        failed: report.failed.map((s) => s.id),
      });
      return report;
    } catch (error) {
      if (error instanceof superService.SuperValidationError) {
        return reply.code(400).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  // The QR menu's opens (track W, TechDocs/POS_MENU_WALL.md): the tab's
  // summary under the super token, and the office television's snapshot
  // under a read-only key — the screen runs for days and never logs in.
  fastify.get('/super/menu-scans', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    return menuScansSummary();
  });

  fastify.get('/super/menu-wall-key', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const key = menuWallKey();
    if (!key) return reply.code(503).send({ error: 'super_not_configured' });
    // The key alone: the television's page lives on the POS web's origin,
    // which is not PUBLIC_BASE_URL (the API's), so the client builds the address.
    return { key };
  });

  fastify.get('/super/menu-wall', async (request, reply) => {
    if (!isSuperConfigured()) return reply.code(503).send({ error: 'super_not_configured' });
    const q = (request.query ?? {}) as { key?: unknown; after?: unknown };
    if (!isMenuWallKey(q.key)) return reply.code(403).send({ error: 'Invalid wall key' });
    const after = typeof q.after === 'string' && /^\d{1,18}$/.test(q.after) ? Number(q.after) : 0;
    reply.header('Cache-Control', 'no-store');
    return menuWallSnapshot({ after });
  });

  fastify.get('/super/leads', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    try {
      return await leads.listLeads((request.query ?? {}) as leads.LeadFilter);
    } catch (error) {
      if (error instanceof leads.LeadValidationError) {
        return reply.code(400).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  fastify.get('/super/leads/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'bad lead id' });
    const lead = await leads.getLead(id);
    if (!lead) return reply.code(404).send({ error: 'Лід не знайдено' });
    return lead;
  });

  // Licence activations (TechDocs/POS_LICENSING.md, phase 2F): who runs the
  // software, how many copies, over the limit, cloned. This surface counts and
  // shows, it never disables a copy; the one write forgets a licence's pings.
  fastify.get('/super/licenses', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    return licenses.listLicenses();
  });

  fastify.get('/super/licenses/:fingerprint', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const fp = String((request.params as { fingerprint: string }).fingerprint);
    const detail = await licenses.getLicense(fp);
    if (!detail) return reply.code(404).send({ error: 'Ліцензію не знайдено' });
    return detail;
  });

  fastify.delete('/super/licenses/:fingerprint', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const fp = String((request.params as { fingerprint: string }).fingerprint);
    const deleted = await licenses.deleteLicense(fp);
    if (deleted === 0) return reply.code(404).send({ error: 'Ліцензію не знайдено' });
    logger.info('super: licence activations deleted', { fingerprint: fp, deleted });
    return { deleted };
  });

  fastify.patch('/super/leads/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'bad lead id' });
    const body = (request.body ?? {}) as { status?: unknown; note?: unknown };
    try {
      const lead = await leads.updateLead(id, { status: body.status, note: body.note });
      if (!lead) return reply.code(404).send({ error: 'Лід не знайдено' });
      logger.info('pos super: lead updated', { ip: request.ip, leadId: id, fields: Object.keys(body) });
      return lead;
    } catch (error) {
      if (error instanceof leads.LeadValidationError) {
        return reply.code(400).send({ error: errorMessage(error) });
      }
      throw error;
    }
  });

  // Shared printer profiles (TechDocs/POS_PRINTER_PROFILES.md): what the tills
  // reported and what is approved for every till on that driver.
  async function profileCall<T>(reply: FastifyReply, run: () => Promise<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof printerProfiles.PrinterProfileError) {
        await reply.code(error.status).send({ error: error.message });
        return undefined;
      }
      throw error;
    }
  }
  const idOf = (request: FastifyRequest) => Number((request.params as { id: string }).id);

  fastify.get('/super/printer-profiles', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    return printerProfiles.superPrinterProfiles();
  });

  fastify.post('/super/printer-profiles/reports/:id/approve', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = idOf(request);
    if (!Number.isInteger(id) || id <= 0) return reply.code(404).send({ error: 'Звіт не знайдено.' });
    const title = (request.body as { title?: unknown } | undefined)?.title;
    const profile = await profileCall(reply, () => printerProfiles.approveReport(id, title));
    if (profile) logger.info('pos super: printer profile approved', { ip: request.ip, reportId: id, driver: profile.driver });
    return profile;
  });

  fastify.delete('/super/printer-profiles/reports/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = idOf(request);
    if (!Number.isInteger(id) || id <= 0) return reply.code(404).send({ error: 'Звіт не знайдено.' });
    const done = await profileCall(reply, async () => {
      await printerProfiles.removeReport(id);
      return { ok: true };
    });
    return done;
  });

  fastify.patch('/super/printer-profiles/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = idOf(request);
    if (!Number.isInteger(id) || id <= 0) return reply.code(404).send({ error: 'Профіль не знайдено.' });
    const title = (request.body as { title?: unknown } | undefined)?.title;
    return profileCall(reply, () => printerProfiles.renameProfile(id, title));
  });

  fastify.delete('/super/printer-profiles/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const id = idOf(request);
    if (!Number.isInteger(id) || id <= 0) return reply.code(404).send({ error: 'Профіль не знайдено.' });
    const done = await profileCall(reply, async () => {
      await printerProfiles.removeProfile(id);
      return { ok: true };
    });
    if (done) logger.info('pos super: printer profile removed', { ip: request.ip, profileId: id });
    return done;
  });
}
