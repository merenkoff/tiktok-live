// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/printer-profiles.routes.ts
//
// Shared printer profiles, the till's half (TechDocs/POS_PRINTER_PROFILES.md):
// the desktop reports the profile its owner picked once three documents
// printed with it, and reads the profiles the super admin approved. A core
// group: every store prints, whatever modules it runs. Staff level — the
// cashier's till prints and reports as much as the owner's; a marketer has no
// printer and is refused by the default deny.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import { listSharedProfiles, PrinterProfileError, reportProfile } from '../printer-profiles.service.js';

export function registerPrinterProfileRoutes(fastify: FastifyInstance): void {
  fastify.get('/printer-profiles', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return { profiles: await listSharedProfiles() };
  });

  fastify.post('/printer-profiles/report', { bodyLimit: 2048 }, async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      await reportProfile(auth.storeId, request.body);
      return { ok: true };
    } catch (error) {
      if (error instanceof PrinterProfileError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });
}
