// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/tables.routes.ts — halls and tables (phase К4a).
//
// Core rather than a module, for the reason `registerKitchenRoutes` gives:
// the `tables` module that draws the hall map opts in through
// `pos_stores.module_remotes`, not `enabled_modules`, so `ensureModule` has
// nothing to check. The module's presence IS the "restaurant" switch — there
// is no `pos_stores.service_mode` column and there is not going to be one
// (TechDocs/POS_TABLES.md §4.11, §8.4).
//
// Reading the map is `ensurePosAuth`: the waiter with a tablet is a seller,
// and §4.7 says everyone sees every table. Changing the furniture is
// `ensurePosOwner` — a floor plan is not a shift-time decision.
//
// The bill endpoints (К4b) live here too, under the same core group: they
// are the same module's server surface, and one registration is easier to
// reason about than two. They are all `ensurePosAuth` — seating a table,
// adding to the draft and moving a bill are the waiter's job, not the
// owner's — and they refuse with 409 «Столи не налаштовано» while the store
// has no hall, which `GET /halls` deliberately does not (§8.4).
//
// Answers are the shapes the rest of this backend uses: 400 in the service's
// own words for input that cannot be right, 404 (never 403) for a hall or
// table belonging to another store, 409 for a delete that would take a
// recorded evening with it.

import type { FastifyInstance } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import * as bills from '../bills.service.js';
import * as billPayment from '../bill-payment.service.js';
import * as rounds from '../rounds.service.js';
import { CompositeError } from '../composites.service.js';
import { ModifierError } from '../modifiers.service.js';
import * as tables from '../tables.service.js';
import { errorMessage } from './_shared.js';

function idOf(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Map a service error onto its status. Anything else is a real 500. */
function sendError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof bills.BillNotFound) {
    return reply.code(404).send({ error: errorMessage(error) });
  }
  if (error instanceof bills.BillConflict) {
    return reply.code(409).send({ error: errorMessage(error) });
  }
  if (error instanceof bills.BillError) {
    return reply.code(400).send({ error: errorMessage(error) });
  }
  if (error instanceof tables.TablesNotFound) {
    return reply.code(404).send({ error: errorMessage(error) });
  }
  if (error instanceof tables.TablesConflict) {
    return reply.code(409).send({ error: errorMessage(error) });
  }
  if (error instanceof tables.TablesError) {
    return reply.code(400).send({ error: errorMessage(error) });
  }
  // A draft line carries the same answers and the same composition a sale
  // does, and validates them through the same two services — whose refusals
  // are the client's fault, not ours. Without this they escaped as 500s and
  // the waiter saw «Internal Server Error» for a modifier that simply is not
  // on that dish.
  if (error instanceof ModifierError || error instanceof CompositeError) {
    return reply.code(400).send({ error: errorMessage(error) });
  }
  throw error;
}

function readPositions(body: unknown): tables.TablePosition[] {
  const rows = (body as { positions?: unknown })?.positions;
  if (!Array.isArray(rows)) {
    throw new tables.TablesError('positions має бути масивом');
  }
  return rows.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    const id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0) throw new tables.TablesNotFound('Стіл не знайдено');
    const position: tables.TablePosition = {
      id,
      pos_x: Number(item.pos_x),
      pos_y: Number(item.pos_y),
      width: Number(item.width),
      height: Number(item.height),
    };
    if (item.hall_id !== undefined) position.hall_id = Number(item.hall_id);
    return position;
  });
}

export function registerTablesRoutes(fastify: FastifyInstance): void {
  // The hall map. A store with no halls gets an empty list, not a 409: that
  // store is exactly the one whose owner is about to create the first hall.
  // The endpoints that need a room to exist are the bill ones (К4b).
  fastify.get('/halls', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return { halls: await tables.listHalls(auth.storeId) };
  });

  fastify.post('/halls', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return await tables.createHall(auth.storeId, (request.body ?? {}) as tables.HallInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/halls/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Зал не знайдено' });
    try {
      return await tables.updateHall(auth.storeId, id, (request.body ?? {}) as tables.HallInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/halls/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Зал не знайдено' });
    try {
      await tables.deleteHall(auth.storeId, id);
      return { ok: true };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/tables', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return await tables.createTable(auth.storeId, (request.body ?? {}) as tables.TableInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // The whole layout at once, after the owner lets go of a table. One
  // transaction, one round-trip — N PATCHes mid-drag is the anti-pattern the
  // design doc's speed budget is against (§6).
  fastify.patch('/tables/positions', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    try {
      return { tables: await tables.moveTables(auth.storeId, readPositions(request.body)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/tables/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Стіл не знайдено' });
    try {
      return await tables.updateTable(auth.storeId, id, (request.body ?? {}) as tables.TableInput);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/tables/:id', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Стіл не знайдено' });
    try {
      await tables.deleteTable(auth.storeId, id);
      return { ok: true };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // ── Bills (К4b) ──────────────────────────────────────────────────────────

  // The hall map's overlay: which tables are seated, for how much, and what
  // they are waiting for. One query behind it, no N+1 over the room.
  fastify.get('/bills', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    return { bills: await bills.listOpenBills(auth.storeId) };
  });

  // Seat a table. Tapping an occupied one opens the bill already there —
  // «show me it», never «start a second one» (bills.service.ts rule 1).
  fastify.post('/bills', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const tableId = Number(body.table_id);
    if (!Number.isInteger(tableId) || tableId <= 0) {
      return reply.code(404).send({ error: 'Стіл не знайдено' });
    }
    try {
      const opened = await bills.openBill({
        storeId: auth.storeId,
        staffId: auth.staffId,
        tableId,
        guests: body.guests,
        note: body.note,
        customerId: body.customer_id == null ? null : Number(body.customer_id),
        clientUuid: body.client_uuid,
      });
      return opened;
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get('/bills/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    try {
      return await bills.getBill(auth.storeId, id);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/bills/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    try {
      return await bills.updateBill(auth.storeId, id, (request.body ?? {}) as Record<string, unknown>);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/bills/:id/items', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    try {
      return await bills.addDraftItem(
        auth.storeId,
        auth.staffId,
        id,
        (request.body ?? {}) as bills.DraftItemInput
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/bills/:id/items/:itemId', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const params = request.params as { id: string; itemId: string };
    const id = idOf(params.id);
    const itemId = idOf(params.itemId);
    if (id == null || itemId == null) {
      return reply.code(404).send({ error: 'Позицію не знайдено' });
    }
    const quantity = Number((request.body as { quantity?: unknown })?.quantity);
    try {
      return await bills.setDraftQuantity(auth.storeId, id, itemId, quantity);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.delete('/bills/:id/items/:itemId', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const params = request.params as { id: string; itemId: string };
    const id = idOf(params.id);
    const itemId = idOf(params.itemId);
    if (id == null || itemId == null) {
      return reply.code(404).send({ error: 'Позицію не знайдено' });
    }
    try {
      return await bills.removeDraftItem(auth.storeId, id, itemId);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/bills/:id/move', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    const tableId = Number((request.body as { table_id?: unknown })?.table_id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    if (!Number.isInteger(tableId) || tableId <= 0) {
      return reply.code(404).send({ error: 'Стіл не знайдено' });
    }
    try {
      return await bills.moveBill(auth.storeId, id, tableId);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/bills/:id/cancel', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    try {
      return await bills.cancelBill(auth.storeId, auth.staffId, id);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // «На кухню»: everything in the draft becomes one round — price locked,
  // stock moved, ticket on the pass (К4c). Idempotent on `client_uuid`,
  // because a second tap on a bad connection must not cook dinner twice.
  fastify.post('/bills/:id/fire', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    try {
      return await rounds.fireRound({
        storeId: auth.storeId,
        staffId: auth.staffId,
        billId: id,
        clientUuid: (request.body as { client_uuid?: unknown })?.client_uuid,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/bills/:id/rounds/:roundId/cancel', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const params = request.params as { id: string; roundId: string };
    const id = idOf(params.id);
    const roundId = idOf(params.roundId);
    if (id == null || roundId == null) {
      return reply.code(404).send({ error: 'Раунд не знайдено' });
    }
    try {
      return await rounds.cancelRound({
        storeId: auth.storeId,
        staffId: auth.staffId,
        billId: id,
        roundId,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // Pay the bill — as one receipt, or as several. A part with its own
  // `line_ids` is a split by dishes (its own sale, its own fiscal receipt);
  // one part with several payments is a split by sum (§4.4).
  fastify.post('/bills/:id/pay', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const parts = Array.isArray(body.parts)
      ? (body.parts as billPayment.BillPaymentPart[])
      : [{ payments: (body.payments ?? []) as never[] }];
    try {
      return await billPayment.payBill({
        storeId: auth.storeId,
        staffId: auth.staffId,
        billId: id,
        parts,
        cart_discount: (body.cart_discount ?? null) as never,
        customer_id: body.customer_id == null ? null : Number(body.customer_id),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // A pre-bill is printed, not binding: this only records that the sum was
  // read out loud, so the table tile can show it (§4.6).
  fastify.post('/bills/:id/precheck', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: 'Рахунок не знайдено' });
    try {
      return await bills.markPrecheckPrinted(auth.storeId, id);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
