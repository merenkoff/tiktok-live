// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/round-print.routes.ts
//
// The print queue of a table's rounds for the kitchen and the bar
// (`round-print.service.ts`, TechDocs/POS_TABLES.md §11). A core group: the
// desktop polls it whenever its «Обладнання» has a kitchen printer, whatever
// modules the store runs. Only the desktop sends a device id, and a job is
// leased to the device that took it. A job is a round's ticket (`kind`
// `fire`) or its «СКАСОВАНО» (`cancel`), confirmed with `?kind=cancel`.

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
    // What the desktop can print. A desktop before 2.9.3 sends none and gets
    // only the fire tickets: it would print «СКАСОВАНО» as one more order.
    const rawKinds = String((request.query as { kinds?: unknown }).kinds ?? '').trim();
    const kinds = rawKinds ? rawKinds.split(',').map((s) => s.trim()) : ['fire'];
    if (!kinds.every(roundPrints.isRoundPrintKind)) {
      return reply.code(400).send({ error: 'Вид тікета — «fire» або «cancel»' });
    }
    return {
      jobs: await roundPrints.claimRoundPrintJobs(auth.storeId, deviceId, stations, [
        ...new Set(kinds as roundPrints.RoundPrintKind[]),
      ]),
    };
  });

  fastify.post('/kitchen/print-queue/:roundId/:station/printed', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const params = request.params as { roundId: string; station: string };
    const roundId = Number(params.roundId);
    // A desktop before 2.9.3 sends no kind: it only ever prints the fire ticket.
    const kind = (request.query as { kind?: unknown }).kind ?? 'fire';
    if (
      !Number.isInteger(roundId) ||
      roundId <= 0 ||
      !roundPrints.isRoundPrintStation(params.station) ||
      !roundPrints.isRoundPrintKind(kind)
    ) {
      return reply.code(404).send({ error: 'Тікет не знайдено' });
    }
    const ok = await roundPrints.markRoundPrinted(auth.storeId, roundId, params.station, kind);
    if (!ok) return reply.code(404).send({ error: 'Тікет не знайдено' });
    return { ok: true };
  });
}
