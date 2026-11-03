// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/receipt-print.routes.ts
//
// The «Чеки столів» print queue (track ДК, Д13; `receipt-print.service.ts`).
// A core group: the desktop shell polls it whenever its «Обладнання» has that
// printer, whatever modules the store runs. Only the desktop sends a device id,
// and a job is leased to the device that took it.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as printQueue from '../receipt-print.service.js';
import { readDeviceId } from './_shared.js';

export function registerReceiptPrintRoutes(fastify: FastifyInstance): void {
  fastify.get('/sales/print-queue', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = readDeviceId(request);
    if (!deviceId) {
      return reply.code(400).send({
        error: 'device_id_required',
        message: 'Потрібен заголовок X-POS-Device-ID (касовий застосунок)',
      });
    }
    return { jobs: await printQueue.claimPrintJobs(auth.storeId, deviceId) };
  });

  fastify.post('/sales/:id/printed', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const saleId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(saleId) || saleId <= 0) return reply.code(404).send({ error: 'Чек не знайдено' });
    const ok = await printQueue.markPrinted(auth.storeId, saleId);
    if (!ok) return reply.code(404).send({ error: 'Чек не знайдено' });
    return { ok: true };
  });
}
