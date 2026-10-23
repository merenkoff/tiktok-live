// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/crm/leads.service.ts — the site's leads as the super admin's CRM reads
// them (migration 070, TechDocs/CRM_LEADS.md).
//
// A person is a phone (`crm_leads`); every form they send is a touch of its
// own (`crm_lead_touches`), so a second request from another page adds to the
// story instead of overwriting it. Where they came from and what they did is
// the touch's journey, cleaned by `sanitizeJourney`; the labels a salesperson
// reads («Google Ads», «Дивився ціни») are computed on read by `sources.ts`.

import { pool } from '../db.js';
import { type Journey, cleanPath, sanitizeJourney } from './journey.js';
import { daysToLead, signalsOf, sourceOf } from './sources.js';

export const LEAD_STATUSES = ['new', 'contacted', 'demo', 'client', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_INTENTS = ['demo', 'waitlist', 'question', 'callback', 'live-trial'] as const;
/** What a page sells: the POS as a whole, a vertical's landing, or the TikTok LIVE module. */
export const LEAD_PRODUCTS = ['pos', 'odyah', 'kvity', 'kafe', 'restoran', 'produkty', 'live'] as const;
/** What the visitor said about themselves on a page that could not tell («Ваш бізнес»). */
export const LEAD_BUSINESSES = ['odyah', 'kvity', 'kafe', 'restoran', 'produkty', 'live', 'other'] as const;

const MAX_NAME = 80;
const MAX_NOTE = 2000;
const FORM_ID = /^[a-z0-9][a-z0-9:_.-]{0,79}$/;

export class LeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadValidationError';
  }
}

/** `067 123 45 67` / `80671234567` / `+380671234567` → `+380671234567`; null if it is not a phone. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('80') && digits.length === 11) return `+3${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export interface LeadInput {
  phone: string;
  name?: unknown;
  form_id?: unknown;
  intent?: unknown;
  product?: unknown;
  business?: unknown;
  page_path?: unknown;
  journey?: unknown;
}

/** A form as the database keeps it; everything optional degrades to null, never to an error. */
export interface CleanLeadInput {
  phone: string;
  name: string | null;
  formId: string;
  intent: (typeof LEAD_INTENTS)[number] | null;
  product: (typeof LEAD_PRODUCTS)[number] | null;
  business: (typeof LEAD_BUSINESSES)[number] | null;
  pagePath: string | null;
  journey: Journey;
}

/**
 * Validate a form from the site. Only the phone can refuse it — a lead with a
 * broken journey or an unknown form id is still a person who wants a call.
 */
export function cleanLeadInput(input: LeadInput): CleanLeadInput {
  const phone = normalizePhone(String(input.phone ?? ''));
  if (!phone) throw new LeadValidationError('Невірний формат номера');
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length > MAX_NAME) throw new LeadValidationError(`Ім'я довше за ${MAX_NAME} символів`);
  return {
    phone,
    name: name || null,
    formId: typeof input.form_id === 'string' && FORM_ID.test(input.form_id) ? input.form_id : 'unknown',
    intent: oneOf(input.intent, LEAD_INTENTS),
    product: oneOf(input.product, LEAD_PRODUCTS),
    business: oneOf(input.business, LEAD_BUSINESSES),
    pagePath: cleanPath(input.page_path) ?? null,
    journey: sanitizeJourney(input.journey),
  };
}

/**
 * One form: the person (by phone) and a new touch, in one transaction. A
 * person the super admin had marked «lost» who writes again is a new chance,
 * so they go back to «new»; every other status stays as it was.
 */
export async function recordLead(input: CleanLeadInput): Promise<{ leadId: number; touchId: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lead = await client.query(
      `INSERT INTO crm_leads (phone, name)
       VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, crm_leads.name),
         status = CASE WHEN crm_leads.status = 'lost' THEN 'new' ELSE crm_leads.status END,
         last_touch_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [input.phone, input.name]
    );
    const leadId = Number(lead.rows[0].id);
    const touch = await client.query(
      `INSERT INTO crm_lead_touches
         (lead_id, form_id, intent, product, business, page_path, name_given, journey)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        leadId,
        input.formId,
        input.intent,
        input.product,
        input.business,
        input.pagePath,
        input.name,
        JSON.stringify(input.journey),
      ]
    );
    await client.query('COMMIT');
    return { leadId, touchId: Number(touch.rows[0].id) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── reading (the super admin) ─────────────────────────────────────────

export interface LeadTouch {
  id: number;
  created_at: string;
  form_id: string;
  intent: string | null;
  product: string | null;
  business: string | null;
  page_path: string | null;
  name_given: string | null;
  journey: Journey;
  /** Where the visit with the form came from, and where the person first came from. */
  source: string;
  first_source: string;
  signals: string[];
  days_to_lead: number | null;
}

export interface LeadRow {
  id: number;
  phone: string;
  name: string | null;
  status: LeadStatus;
  note: string;
  created_at: string;
  last_touch_at: string;
  touches: number;
  /**
   * What to call about: the latest touch that named one, the person's own
   * «Ваш бізнес» before the page's product — on `/pos` the page says only
   * «pos», the chip says «kafe».
   */
  interest: string | null;
  last: LeadTouch | null;
}

export interface LeadList {
  items: LeadRow[];
  total: number;
  /** Per status, over the same filters except the status itself — the chips' counts. */
  counts: Record<LeadStatus, number>;
}

function toTouch(row: Record<string, unknown>): LeadTouch {
  const journey = (row.journey ?? {}) as Journey;
  const createdAt = new Date(String(row.created_at));
  return {
    id: Number(row.id),
    created_at: createdAt.toISOString(),
    form_id: String(row.form_id),
    intent: (row.intent as string | null) ?? null,
    product: (row.product as string | null) ?? null,
    business: (row.business as string | null) ?? null,
    page_path: (row.page_path as string | null) ?? null,
    name_given: (row.name_given as string | null) ?? null,
    journey,
    source: row.form_id === 'imported' ? 'Стара таблиця (до 070)' : sourceOf(journey.last ?? journey.first),
    first_source: row.form_id === 'imported' ? 'Невідомо' : sourceOf(journey.first ?? journey.last),
    signals: signalsOf(journey),
    days_to_lead: daysToLead(journey, createdAt),
  };
}

const LAST_TOUCH = `
  LEFT JOIN LATERAL (
    SELECT t.* FROM crm_lead_touches t
    WHERE t.lead_id = l.id ORDER BY t.created_at DESC, t.id DESC LIMIT 1
  ) lt ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(t.business, t.product) AS interest FROM crm_lead_touches t
    WHERE t.lead_id = l.id AND COALESCE(t.business, t.product) IS NOT NULL
    ORDER BY t.created_at DESC, t.id DESC LIMIT 1
  ) li ON TRUE`;

export interface LeadFilter {
  status?: unknown;
  interest?: unknown;
  q?: unknown;
  limit?: unknown;
  offset?: unknown;
}

function pageNumber(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
}

/** The CRM list: newest activity first, with the latest touch read out. */
export async function listLeads(filter: LeadFilter = {}): Promise<LeadList> {
  const status = filter.status === undefined || filter.status === '' ? null : oneOf(filter.status, LEAD_STATUSES);
  if (filter.status !== undefined && filter.status !== '' && !status) {
    throw new LeadValidationError('Невідомий статус');
  }
  const interest =
    typeof filter.interest === 'string' && filter.interest !== ''
      ? oneOf(filter.interest, [...new Set([...LEAD_PRODUCTS, ...LEAD_BUSINESSES])])
      : null;
  const q = typeof filter.q === 'string' ? filter.q.trim().slice(0, 80) : '';
  const digits = q.replace(/\D/g, '');
  const limit = pageNumber(filter.limit, 50, 200) || 50;
  const offset = pageNumber(filter.offset, 0, 100_000);

  // Everything but the status: the chips count what each status WOULD show.
  const where: string[] = [];
  const params: unknown[] = [];
  if (interest) {
    params.push(interest);
    where.push(`EXISTS (SELECT 1 FROM crm_lead_touches t WHERE t.lead_id = l.id
                 AND (t.product = $${params.length} OR t.business = $${params.length}))`);
  }
  if (q) {
    params.push(`%${q}%`);
    const byName = `l.name ILIKE $${params.length}`;
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      where.push(`(${byName} OR regexp_replace(l.phone, '\\D', '', 'g') LIKE $${params.length})`);
    } else {
      where.push(byName);
    }
  }
  const base = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const counts = await pool.query(
    `SELECT l.status, COUNT(*)::int AS n FROM crm_leads l ${base} GROUP BY l.status`,
    params
  );
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const row of counts.rows) byStatus[row.status as LeadStatus] = Number(row.n);

  const listParams = [...params];
  let listWhere = base;
  if (status) {
    listParams.push(status);
    listWhere = `${base ? `${base} AND` : 'WHERE'} l.status = $${listParams.length}`;
  }
  listParams.push(limit, offset);
  const rows = await pool.query(
    `SELECT l.id, l.phone, l.name, l.status, l.note, l.created_at, l.last_touch_at,
            (SELECT COUNT(*)::int FROM crm_lead_touches t WHERE t.lead_id = l.id) AS touches,
            li.interest,
            lt.id AS t_id, lt.created_at AS t_created_at, lt.form_id AS t_form_id, lt.intent AS t_intent,
            lt.product AS t_product, lt.business AS t_business, lt.page_path AS t_page_path,
            lt.name_given AS t_name_given, lt.journey AS t_journey,
            COUNT(*) OVER () AS total
     FROM crm_leads l
     ${LAST_TOUCH}
     ${listWhere}
     ORDER BY l.last_touch_at DESC, l.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return {
    items: rows.rows.map((row) => ({
      id: Number(row.id),
      phone: String(row.phone),
      name: row.name ?? null,
      status: row.status as LeadStatus,
      note: String(row.note ?? ''),
      created_at: new Date(row.created_at).toISOString(),
      last_touch_at: new Date(row.last_touch_at).toISOString(),
      touches: Number(row.touches),
      interest: row.interest ?? null,
      last:
        row.t_id == null
          ? null
          : toTouch({
              id: row.t_id,
              created_at: row.t_created_at,
              form_id: row.t_form_id,
              intent: row.t_intent,
              product: row.t_product,
              business: row.t_business,
              page_path: row.t_page_path,
              name_given: row.t_name_given,
              journey: row.t_journey,
            }),
    })),
    total: rows.rows.length ? Number(rows.rows[0].total) : 0,
    counts: byStatus,
  };
}

export interface LeadCard extends Omit<LeadRow, 'last'> {
  /** Every form this person sent, newest first. */
  history: LeadTouch[];
}

export async function getLead(id: number): Promise<LeadCard | null> {
  const lead = await pool.query(
    `SELECT l.id, l.phone, l.name, l.status, l.note, l.created_at, l.last_touch_at, li.interest
     FROM crm_leads l ${LAST_TOUCH} WHERE l.id = $1`,
    [id]
  );
  if (lead.rows.length === 0) return null;
  const touches = await pool.query(
    `SELECT id, created_at, form_id, intent, product, business, page_path, name_given, journey
     FROM crm_lead_touches WHERE lead_id = $1 ORDER BY created_at DESC, id DESC`,
    [id]
  );
  const row = lead.rows[0];
  return {
    id: Number(row.id),
    phone: String(row.phone),
    name: row.name ?? null,
    status: row.status as LeadStatus,
    note: String(row.note ?? ''),
    created_at: new Date(row.created_at).toISOString(),
    last_touch_at: new Date(row.last_touch_at).toISOString(),
    touches: touches.rows.length,
    interest: row.interest ?? null,
    history: touches.rows.map(toTouch),
  };
}

/** The super admin's two writes: the status and the note. Absent means «leave». */
export async function updateLead(
  id: number,
  patch: { status?: unknown; note?: unknown }
): Promise<LeadCard | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.status !== undefined) {
    const status = oneOf(patch.status, LEAD_STATUSES);
    if (!status) throw new LeadValidationError('Невідомий статус');
    params.push(status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.note !== undefined) {
    if (typeof patch.note !== 'string') throw new LeadValidationError('Нотатка має бути текстом');
    const note = patch.note.trim();
    if (note.length > MAX_NOTE) throw new LeadValidationError(`Нотатка довша за ${MAX_NOTE} символів`);
    params.push(note);
    sets.push(`note = $${params.length}`);
  }
  if (sets.length === 0) throw new LeadValidationError('Нічого змінювати');
  params.push(id);
  const updated = await pool.query(
    `UPDATE crm_leads SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id`,
    params
  );
  if (updated.rowCount === 0) return null;
  return getLead(id);
}
