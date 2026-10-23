// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/crm.leads.test.ts — the site's lead form end to end through the
// real `POST /api/leads` (migration 070, TechDocs/CRM_LEADS.md): a person is a
// phone, every form is a touch of its own, the honeypot and the limits keep
// bots out, and the old `GET /api/admin/leads` that any LIVE token could read
// is gone.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { createServer } from '../api.js';
import { applyPosMigrations, hasDb } from './helpers/pos-fixtures.js';
import { LEAD_LIMITS, leadAllowed, resetLeadLimits } from '../crm/limits.js';
import * as leads from '../crm/leads.service.js';

/** Phones unique to this run, so a re-run never meets its own leftovers. */
const RUN = String(Date.now()).slice(-6);
const phone = (n: number) => `+38099${RUN}${String(n)}`.slice(0, 13);
const used: string[] = [];

describe.skipIf(!hasDb)('site leads (070)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await applyPosMigrations();
    app = await createServer();
  }, 60000);

  afterAll(async () => {
    await pool.query(`DELETE FROM crm_leads WHERE phone = ANY($1::text[])`, [used]);
    await app?.close();
  });

  beforeEach(() => resetLeadLimits());

  const send = (payload: Record<string, unknown>) => {
    if (typeof payload.phone === 'string') used.push(leads.normalizePhone(payload.phone) ?? payload.phone);
    return app.inject({ method: 'POST', url: '/api/leads', payload });
  };

  const touchesOf = async (p: string) =>
    (
      await pool.query(
        `SELECT t.* FROM crm_lead_touches t JOIN crm_leads l ON l.id = t.lead_id
         WHERE l.phone = $1 ORDER BY t.id`,
        [p]
      )
    ).rows;

  it('takes the old body an older page still sends', async () => {
    const res = await send({ phone: phone(1), name: 'Олена' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, id: expect.any(Number) });
    const [touch] = await touchesOf(phone(1));
    expect(touch).toMatchObject({ form_id: 'unknown', intent: null, product: null, journey: {} });
  });

  it('keeps every form as its own touch instead of overwriting the person', async () => {
    const p = phone(2);
    await send({
      phone: p,
      form_id: 'vertical-kafe',
      intent: 'demo',
      product: 'kafe',
      page_path: '/pos/kafe',
      journey: {
        first: { ref: 'https://www.google.com/search?q=secret', utm: { source: 'google', campaign: 'kafe' } },
        ctas: [{ id: 'pricing-fix-price', p: '/pos/kafe' }],
      },
    });
    await send({ phone: p, name: 'Іван', form_id: 'live-hero', intent: 'live-trial', product: 'live' });

    const people = await pool.query(`SELECT name, status FROM crm_leads WHERE phone = $1`, [p]);
    expect(people.rows).toEqual([{ name: 'Іван', status: 'new' }]);
    const touches = await touchesOf(p);
    expect(touches.map((t) => t.form_id)).toEqual(['vertical-kafe', 'live-hero']);
    // The search phrase in the referrer never reached the database.
    expect(touches[0].journey.first.ref).toBe('www.google.com/search');
    expect(JSON.stringify(touches[0].journey)).not.toContain('secret');
  });

  it('brings a «lost» person back to «new» when they write again, and leaves a client a client', async () => {
    const lost = phone(3);
    const client = phone(4);
    await send({ phone: lost });
    await send({ phone: client });
    await pool.query(`UPDATE crm_leads SET status = 'lost' WHERE phone = $1`, [lost]);
    await pool.query(`UPDATE crm_leads SET status = 'client' WHERE phone = $1`, [client]);
    await send({ phone: lost });
    await send({ phone: client });
    const rows = await pool.query(
      `SELECT phone, status FROM crm_leads WHERE phone = ANY($1::text[]) ORDER BY phone`,
      [[lost, client]]
    );
    expect(Object.fromEntries(rows.rows.map((r) => [r.phone, r.status]))).toEqual({ [lost]: 'new', [client]: 'client' });
  });

  it('thanks a bot that filled the hidden field, and stores nothing', async () => {
    const res = await send({ phone: phone(5), website: 'http://spam.example' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    expect(await touchesOf(phone(5))).toHaveLength(0);
  });

  it('refuses in words what it cannot take', async () => {
    expect((await send({})).json()).toEqual({ error: 'Введіть номер телефону' });
    const bad = await send({ phone: '123' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('Невірний формат номера');
    const long = await send({ phone: phone(6), name: 'x'.repeat(81) });
    expect(long.statusCode).toBe(400);
    expect(long.json().error).toMatch(/довше за 80/);
  });

  it('hears one phone five times an hour, then asks it to wait', async () => {
    const p = phone(7);
    for (let i = 0; i < LEAD_LIMITS.PHONE_MAX; i++) expect((await send({ phone: p })).statusCode).toBe(200);
    const sixth = await send({ phone: p });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error).toMatch(/Забагато заявок/);
  });

  it('caps the body: a journey cannot be a payload', async () => {
    const res = await send({ phone: phone(8), journey: { pages: [{ p: `/${'x'.repeat(9000)}` }] } });
    expect(res.statusCode).toBe(413);
  });

  it('no longer lists leads to a LIVE token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/leads' });
    expect(res.statusCode).toBe(404);
  });

  it('lists, reads and updates for the super admin', async () => {
    const p = phone(9);
    const sent = await send({
      phone: p,
      name: 'Марія',
      form_id: 'pos-bottom',
      intent: 'demo',
      // The page says only «pos»; what the person chose is what to call about.
      product: 'pos',
      business: 'kvity',
      journey: { first: { ref: 'chatgpt.com' }, visits: 2, ctas: [{ id: 'download-mac' }] },
    });
    const id = sent.json().id as number;

    const list = await leads.listLeads({ q: p.slice(-7), interest: 'kvity' });
    expect(list.items.map((i) => i.id)).toEqual([id]);
    expect(list.items[0]).toMatchObject({ name: 'Марія', interest: 'kvity', touches: 1, status: 'new' });
    expect(list.items[0]!.last).toMatchObject({
      form_id: 'pos-bottom',
      source: 'AI-асистент: ChatGPT',
      signals: ['Завантажив касу (macOS)', '2-й візит', 'Прийшов з ChatGPT'],
    });
    expect(list.counts.new).toBe(1);

    const card = await leads.updateLead(id, { status: 'contacted', note: '  передзвонити в понеділок ' });
    expect(card).toMatchObject({ status: 'contacted', note: 'передзвонити в понеділок', touches: 1 });
    expect(card!.history[0]!.first_source).toBe('AI-асистент: ChatGPT');

    const filtered = await leads.listLeads({ q: p.slice(-7), status: 'new' });
    expect(filtered.items).toHaveLength(0);
    // The chips still count every status over the other filters.
    expect(filtered.counts.contacted).toBe(1);

    await expect(leads.updateLead(id, { status: 'won' })).rejects.toThrow(/Невідомий статус/);
    await expect(leads.updateLead(id, { note: 'x'.repeat(2001) })).rejects.toThrow(/2000/);
    await expect(leads.updateLead(id, {})).rejects.toThrow(/Нічого/);
    await expect(leads.listLeads({ status: 'won' })).rejects.toThrow(/Невідомий статус/);
    expect(await leads.updateLead(2 ** 40, { status: 'new' })).toBeNull();
    expect(await leads.getLead(2 ** 40)).toBeNull();
  });
});

describe('the global ceiling', () => {
  beforeEach(() => resetLeadLimits());

  it('stops a flood across many phones, and opens again when the window has passed', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    for (let i = 0; i < LEAD_LIMITS.GLOBAL_MAX; i++) expect(leadAllowed(`+38050000${String(i).padStart(4, '0')}`, now)).toBe(true);
    expect(leadAllowed('+380509999999', now)).toBe(false);
    expect(leadAllowed('+380509999999', now + LEAD_LIMITS.GLOBAL_WINDOW_MS + 1)).toBe(true);
  });
});
