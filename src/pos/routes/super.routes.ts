// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/super.routes.ts — `/api/pos/super/*`, the cross-store admin
// (TechDocs/POS_SUPER_ADMIN.md). Core group (`moduleId: null`): it belongs to
// no store, so neither `ensureModule` nor `ensurePosAuth` apply — the gate is
// `ensureSuper` and the password in `POS_SUPER_PASSWORD`.

import type { FastifyInstance } from 'fastify';
import { logger } from '../../logger.js';
import {
  ensureSuper,
  isSuperConfigured,
  issueSuperToken,
  loginAttemptAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  verifySuperPassword,
} from '../core/superAuth.js';
import * as superService from '../super.service.js';
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

  fastify.patch('/super/stores/:id', async (request, reply) => {
    if (!(await ensureSuper(request, reply))) return;
    const storeId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      return reply.code(400).send({ error: 'bad store id' });
    }
    const body = (request.body ?? {}) as { enabled_modules?: unknown; module_remotes?: unknown };
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
}
