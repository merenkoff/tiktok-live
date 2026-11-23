// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/receipt-print.routes.ts
//
// The receipt print queue (track ДК, Д13, and a phone's receipts, Т2;
// `receipt-print.service.ts`).
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
    printQueue.noteTillPoll(auth.storeId);
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

  // A phone's «Друкувати на касі» / «Друкувати ще раз» (TechDocs/POS_PHONE_TILL.md
  // Т2): the receipt goes into the queue again, a copy once one has printed.
  fastify.post('/sales/:id/print-request', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const saleId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(saleId) || saleId <= 0) return reply.code(404).send({ error: 'Чек не знайдено' });
    try {
      const status = await printQueue.requestReprint(auth.storeId, saleId);
      if (!status) return reply.code(404).send({ error: 'Чек не знайдено' });
      return status;
    } catch (error) {
      if (error instanceof printQueue.PrintRefusal) return reply.code(409).send({ error: error.message });
      throw error;
    }
  });

  // Whether the paper came out — the phone polls it for half a minute after a sale.
  fastify.get('/sales/:id/print-status', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const saleId = Number((request.params as { id: string }).id);
    if (!Number.isInteger(saleId) || saleId <= 0) return reply.code(404).send({ error: 'Чек не знайдено' });
    const status = await printQueue.printStatus(auth.storeId, saleId);
    if (!status) return reply.code(404).send({ error: 'Чек не знайдено' });
    return status;
  });
}
