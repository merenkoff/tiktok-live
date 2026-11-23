// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.print-on-till.test.ts — a phone's receipt printed on the
// till's computer (TechDocs/POS_PHONE_TILL.md Т2, the owner's word of
// 2026-11-23).
//
// A sale rung with `print_on_till` waits in migration 090's queue for the
// computer, ten minutes and no longer (migration 113) — a table's receipt
// still waits twelve hours. «Друкувати ще раз» queues it again as a copy, but
// never a voided receipt or one with a return; the phone reads whether the
// paper came out from `print-status`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { forgetTillPollsForTests } from '../pos/receipt-print.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  seedProduct,
  type TestProduct,
  type TestStore,
} from './helpers/pos-fixtures.js';

const DESKTOP = { 'x-pos-device-id': 'desktop-evelin' };

describe.skipIf(!hasDb)('POS print on till', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let other: TestStore;
  let body: TestProduct;

  async function sell(extra: Record<string, unknown> = {}): Promise<number> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: body.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        ...extra,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    return Number(res.json().id);
  }

  async function take(): Promise<number[]> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pos/sales/print-queue',
      headers: { ...auth(store.sellerToken), ...DESKTOP },
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json().jobs.map((j: { id: number }) => j.id);
  }

  async function printed(id: number): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${id}/printed`,
      headers: { ...auth(store.sellerToken), ...DESKTOP },
    });
    expect(res.statusCode, res.body).toBe(200);
  }

  async function status(id: number, token = store.sellerToken) {
    return app.inject({ method: 'GET', url: `/api/pos/sales/${id}/print-status`, headers: auth(token) });
  }

  async function again(id: number, token = store.sellerToken) {
    return app.inject({ method: 'POST', url: `/api/pos/sales/${id}/print-request`, headers: auth(token) });
  }

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    store = await createTestStore('printtill');
    other = await createTestStore('printtill_x');
    body = await seedProduct(store.storeId, { name: 'Боді', quantity: 50 });
    forgetTillPollsForTests();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    await dropTestStore(other?.storeId);
    await pool.end();
  });

  it('queues a phone sale for the computer, which prints it once', async () => {
    const counter = await sell();
    const phone = await sell({ print_on_till: true });
    // No computer has asked yet: the phone says nothing about paper.
    expect((await status(phone)).json().till).toBe('none');

    expect(await take()).toEqual([phone]);
    expect((await status(counter)).json()).toEqual({
      requested_at: null,
      printed_at: null,
      expires_at: null,
      // The computer just asked for its receipts.
      till: 'online',
    });
    const waiting = (await status(phone)).json();
    expect(waiting.requested_at).not.toBeNull();
    expect(waiting.printed_at).toBeNull();
    // Ten minutes to live.
    const ttl = Date.parse(waiting.expires_at) - Date.parse(waiting.requested_at);
    expect(ttl).toBe(10 * 60 * 1000);

    await printed(phone);
    expect((await status(phone)).json().printed_at).not.toBeNull();
    expect(await take()).toEqual([]);
  });

  it('drops a phone receipt nobody printed in ten minutes, and keeps a table one for twelve hours', async () => {
    const phone = await sell({ print_on_till: true });
    const table = await sell();
    await pool.query(
      `UPDATE pos_sales SET print_requested_at = NOW() - INTERVAL '11 minutes',
                            print_expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1`,
      [phone]
    );
    // A table's receipt, as a bill payment queues it: no expiry of its own.
    await pool.query(`UPDATE pos_sales SET print_requested_at = NOW() - INTERVAL '11 minutes' WHERE id = $1`, [table]);
    expect(await take()).toEqual([table]);
    await printed(table);
  });

  it('prints again as a copy, and says so on the job', async () => {
    const phone = await sell({ print_on_till: true });
    expect(await take()).toEqual([phone]);
    await printed(phone);

    const res = await again(phone);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().printed_at).toBeNull();
    const jobs = await app.inject({
      method: 'GET',
      url: '/api/pos/sales/print-queue',
      headers: { ...auth(store.sellerToken), ...DESKTOP },
    });
    const job = jobs.json().jobs.find((j: { id: number }) => j.id === phone);
    expect(job.print_copy).toBe(true);
    await printed(phone);
  });

  it('queues the first print of an old counter receipt as the original', async () => {
    const counter = await sell();
    expect((await again(counter)).statusCode).toBe(200);
    const jobs = await app.inject({
      method: 'GET',
      url: '/api/pos/sales/print-queue',
      headers: { ...auth(store.sellerToken), ...DESKTOP },
    });
    const job = jobs.json().jobs.find((j: { id: number }) => j.id === counter);
    expect(job.print_copy).toBeUndefined();
    await printed(counter);
  });

  it('prints a copy from «Чеки» even when the queue never printed the receipt', async () => {
    const counter = await sell();
    const res = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${counter}/print-request`,
      headers: auth(store.sellerToken),
      payload: { copy: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    const jobs = await app.inject({
      method: 'GET',
      url: '/api/pos/sales/print-queue',
      headers: { ...auth(store.sellerToken), ...DESKTOP },
    });
    const job = jobs.json().jobs.find((j: { id: number }) => j.id === counter);
    expect(job.print_copy).toBe(true);
    await printed(counter);
  });

  it('refuses a voided receipt, one with a return, and another store', async () => {
    const voided = await sell();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/pos/sales/${voided}/void`,
          headers: auth(store.ownerToken),
          payload: {},
        })
      ).statusCode
    ).toBe(200);
    const refusedVoid = await again(voided);
    expect(refusedVoid.statusCode).toBe(409);
    expect(refusedVoid.json().error).toBe('Чек скасовано — друкувати нічого');

    const returned = await sell();
    const detail = await app.inject({
      method: 'GET',
      url: `/api/pos/sales/${returned}`,
      headers: auth(store.ownerToken),
    });
    const refund = await app.inject({
      method: 'POST',
      url: `/api/pos/sales/${returned}/refunds`,
      headers: auth(store.ownerToken),
      payload: {
        items: [{ sale_item_id: detail.json().items[0].id, quantity: 1 }],
        method: 'cash',
        reason_code: 'size',
      },
    });
    expect(refund.statusCode, refund.body).toBe(200);
    const refusedReturn = await again(returned);
    expect(refusedReturn.statusCode).toBe(409);
    expect(refusedReturn.json().error).toMatch(/повернення/);

    const mine = await sell({ print_on_till: true });
    expect((await again(mine, other.sellerToken)).statusCode).toBe(404);
    expect((await status(mine, other.sellerToken)).statusCode).toBe(404);
  });

  it('does not queue a replayed sale twice', async () => {
    const uuid = '6b1f4f7e-6c1e-4c8a-9a51-2b1f0b7f0e11';
    const first = await sell({ print_on_till: true, client_uuid: uuid });
    await printed(first);
    // The same request again (a timeout on the phone): the same sale, already printed.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/pos/sales/complete',
      headers: auth(store.sellerToken),
      payload: {
        items: [{ variant_id: body.variantId, quantity: 1 }],
        payments: [{ method: 'cash', amount_cents: 10000 }],
        print_on_till: true,
        client_uuid: uuid,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(first);
    expect(await take()).not.toContain(first);
  });
});
