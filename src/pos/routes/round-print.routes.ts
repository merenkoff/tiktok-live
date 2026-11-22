// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/round-print.routes.ts
//
// The print queue of a table's rounds for the kitchen and the bar
// (`round-print.service.ts`, TechDocs/POS_TABLES.md §11). A core group: the
// desktop polls it whenever its «Обладнання» has a kitchen printer, whatever
// modules the store runs. Only the desktop sends a device id, and a job is
// leased to the device that took it.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth } from '../core/auth.js';
import * as roundPrints from '../round-print.service.js';
import type { TagStation } from '../tags.service.js';
import { readDeviceId } from './_shared.js';

export function registerRoundPrintRoutes(fastify: FastifyInstance): void {
  fastify.get('/kitchen/print-queue', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = readDeviceId(request);
    if (!deviceId) {
      return reply.code(400).send({
        error: 'device_id_required',
        message: 'Потрібен заголовок X-POS-Device-ID (касовий застосунок)',
      });
    }
    const raw = String((request.query as { stations?: unknown }).stations ?? '').trim();
    const asked = raw ? raw.split(',').map((s) => s.trim()) : [...roundPrints.ROUND_PRINT_STATIONS];
    if (!asked.every(roundPrints.isRoundPrintStation)) {
      return reply.code(400).send({ error: 'Станція — «kitchen» або «bar»' });
    }
    const stations = [...new Set(asked as TagStation[])];
    return { jobs: await roundPrints.claimRoundPrintJobs(auth.storeId, deviceId, stations) };
  });

  fastify.post('/kitchen/print-queue/:roundId/:station/printed', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const params = request.params as { roundId: string; station: string };
    const roundId = Number(params.roundId);
    if (!Number.isInteger(roundId) || roundId <= 0 || !roundPrints.isRoundPrintStation(params.station)) {
      return reply.code(404).send({ error: 'Тікет не знайдено' });
    }
    const ok = await roundPrints.markRoundPrinted(auth.storeId, roundId, params.station);
    if (!ok) return reply.code(404).send({ error: 'Тікет не знайдено' });
    return { ok: true };
  });
}
