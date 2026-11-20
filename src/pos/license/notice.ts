// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The notice a copy without a valid licence key shows its users
// (TechDocs/POS_LICENSING.md, phase 2G; migration 107).
//
// It is a NOTICE, never a lever: nothing in this file blocks, slows or switches
// off anything. OwnNet 1.1 §1.12(a) forbids a kill switch and allows
// «license-compliance checks that do not disable software the user already
// lawfully runs» — a strip of text is on the allowed side of that line, and
// stays there only while it is nothing more than text. It is also disclosed:
// README.md and NOTICE say what a copy counts, what it shows and what the
// author's server may answer.
//
// Two halves, as with 094/095. THE COPY counts client launches while it has no
// valid key and decides locally whether the notice is due; THE AUTHOR's server
// only supplies the settings (a threshold, a text, whether guests see it) in
// its answer to the ping. A copy that never hears from the server uses the
// built-in threshold and text, so blocking the server does not silence it — and
// a copy with a valid key verifies it locally and never warns, whether or not
// the author's server still exists.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import { verifyLicenseToken } from './token.js';

/** Client launches a copy without a key serves before it says so. 0 = never. */
export const DEFAULT_WARN_AFTER = 30;

/**
 * Said to a copy whose author's server sent no text of its own. True of every
 * copy it is shown on — it runs without a key — and of nothing more: the public
 * licence lets a small business run without one, so the text does not call
 * anybody a thief.
 */
export const DEFAULT_NOTICE_TEXT =
  'Ця копія працює без ліцензійного ключа. Комерційне використання потребує ліцензії — the-live.shop';

export const NOTICE_TEXT_MAX = 300;
export const WARN_AFTER_MAX = 1_000_000;

/** What the author's server answers a ping with, and what a copy keeps. */
export interface NoticePolicy {
  /** Launches after which the notice is due; 0 = no notice. */
  warn_after: number;
  /** The text to show; null = the built-in one. */
  text: string | null;
  /** Also under each dish of the guest QR menu. */
  guests: boolean;
}

/** What a session answer carries for the POS strip. */
export interface LicenseNotice {
  text: string;
}

export const DEFAULT_POLICY: NoticePolicy = { warn_after: DEFAULT_WARN_AFTER, text: null, guests: false };

/**
 * A notice text as it may be kept and shown: one paragraph of plain text. It is
 * text that arrives from another server and is drawn on a till and on a public
 * page, so it is cut to a length and stripped of control characters here, and
 * escaped again by whoever draws it (React, `escapeHtml`) — never markup.
 */
export function cleanNoticeText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, NOTICE_TEXT_MAX) : null;
}

function cleanWarnAfter(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= WARN_AFTER_MAX ? raw : null;
}

/** A policy off the wire or out of the row, or null when it is not one. */
export function cleanPolicy(raw: unknown): NoticePolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const warnAfter = cleanWarnAfter(value.warn_after);
  if (warnAfter === null) return null;
  return { warn_after: warnAfter, text: cleanNoticeText(value.text), guests: value.guests === true };
}

/**
 * Is the notice due, and what does it say? Pure. A licensed copy: never. No
 * policy yet: the built-in one. A threshold of 0: the author switched the
 * notice off. Otherwise once the launches have gone PAST the threshold.
 */
export function noticeFor(
  state: { licensed: boolean; launches: number; policy: NoticePolicy | null }
): { text: string; guests: boolean } | null {
  if (state.licensed) return null;
  const policy = state.policy ?? DEFAULT_POLICY;
  if (policy.warn_after <= 0 || state.launches <= policy.warn_after) return null;
  return { text: policy.text ?? DEFAULT_NOTICE_TEXT, guests: policy.guests };
}

// ─── the copy ───────────────────────────────────────────────────────────────

function licensedLocally(): boolean {
  return verifyLicenseToken(process.env.LICENSE_KEY?.trim() || undefined).ok;
}

/**
 * The whole test suite signs in thousands of times against one database, and a
 * counter that moved there would put the notice into every session answer some
 * way through the run. So under vitest a launch is counted only by a test that
 * asks for it.
 */
let counting = !process.env.VITEST;

/** Test seam. */
export function setLaunchCountingForTests(on: boolean): void {
  counting = on;
  guestCache = null;
}

/**
 * One client launch: a sign-in, or a session restored when the app opens.
 * Counts it — only while this copy has no valid key — and answers the notice
 * the client should show, if any. Best-effort like the heartbeat: a failure
 * here is logged and the client simply signs in with no notice; it can never
 * keep anybody out.
 */
export async function noteClientLaunch(): Promise<LicenseNotice | null> {
  if (!counting || licensedLocally()) return null;
  try {
    const result = await pool.query(
      `UPDATE pos_license_state
          SET client_launches = LEAST(client_launches + 1, 2147483647)
        WHERE id = 1
        RETURNING client_launches, notice_policy`
    );
    const row = result.rows[0] as { client_launches: number; notice_policy: unknown } | undefined;
    if (!row) return null;
    const notice = noticeFor({
      licensed: false,
      launches: Number(row.client_launches),
      policy: cleanPolicy(row.notice_policy),
    });
    return notice ? { text: notice.text } : null;
  } catch (error) {
    logger.warn('licence: cannot count a client launch', {
      error: error instanceof Error ? error.message : 'db_error',
    });
    return null;
  }
}

/** Keep what the author's server answered. Called by the heartbeat. */
export async function storeNoticePolicy(policy: NoticePolicy, now = new Date()): Promise<void> {
  await pool.query(
    `UPDATE pos_license_state SET notice_policy = $1::jsonb, notice_policy_at = $2 WHERE id = 1`,
    [JSON.stringify(policy), now.toISOString()]
  );
  guestCache = null;
}

const GUEST_CACHE_MS = 15_000;
let guestCache: { at: number; text: string | null } | null = null;

/**
 * The line for the guest QR menu, or null. Read on every page of the menu, so
 * it is kept for as long as the menu itself is (15 s) — and it only READS: a
 * guest opening a menu is not a client launch.
 */
export async function guestNoticeText(now = Date.now()): Promise<string | null> {
  // Under vitest the row is one for every test file at once: only a test that
  // asked for the counting reads it, or a neighbour's menu page would gain a line.
  if (!counting) return null;
  if (guestCache && now - guestCache.at < GUEST_CACHE_MS) return guestCache.text;
  let text: string | null = null;
  try {
    if (!licensedLocally()) {
      const result = await pool.query(`SELECT client_launches, notice_policy FROM pos_license_state WHERE id = 1`);
      const row = result.rows[0] as { client_launches: number; notice_policy: unknown } | undefined;
      const notice = row
        ? noticeFor({ licensed: false, launches: Number(row.client_launches), policy: cleanPolicy(row.notice_policy) })
        : null;
      text = notice?.guests ? notice.text : null;
    }
  } catch {
    text = null;
  }
  guestCache = { at: now, text };
  return text;
}

// ─── the author ─────────────────────────────────────────────────────────────

export class NoticePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoticePolicyError';
  }
}

/** The settings for one copy; null in a field = «as for everyone». */
export interface CopyNotice {
  warn_after: number | null;
  text: string | null;
  guests: boolean | null;
}

function policyFromRow(row: Record<string, unknown> | undefined): NoticePolicy {
  if (!row) return { ...DEFAULT_POLICY };
  return {
    warn_after: cleanWarnAfter(Number(row.warn_after)) ?? DEFAULT_WARN_AFTER,
    text: cleanNoticeText(row.notice_text),
    guests: row.guests === true,
  };
}

/** The settings for every copy without a key. */
export async function getNoticePolicy(): Promise<NoticePolicy> {
  const result = await pool.query(`SELECT warn_after, notice_text, guests FROM pos_license_notice_policy WHERE id = 1`);
  return policyFromRow(result.rows[0] as Record<string, unknown> | undefined);
}

function readWarnAfter(raw: unknown, allowNull: boolean): number | null {
  if (raw === null && allowNull) return null;
  const value = cleanWarnAfter(raw);
  if (value === null) {
    throw new NoticePolicyError(`Поріг — ціле число від 0 до ${WARN_AFTER_MAX}; 0 вимикає попередження.`);
  }
  return value;
}

function readText(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') throw new NoticePolicyError('Текст попередження має бути рядком.');
  if (raw.trim().length > NOTICE_TEXT_MAX) {
    throw new NoticePolicyError(`Текст попередження — до ${NOTICE_TEXT_MAX} символів.`);
  }
  return cleanNoticeText(raw);
}

/** Replace the settings for every copy. A bad field refuses the whole write. */
export async function setNoticePolicy(input: {
  warn_after?: unknown;
  text?: unknown;
  guests?: unknown;
}): Promise<NoticePolicy> {
  const warnAfter = readWarnAfter(input.warn_after, false) as number;
  const text = readText(input.text);
  if (typeof input.guests !== 'boolean') throw new NoticePolicyError('«Показувати гостям» — так або ні.');
  await pool.query(
    `INSERT INTO pos_license_notice_policy (id, warn_after, notice_text, guests, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       warn_after = EXCLUDED.warn_after, notice_text = EXCLUDED.notice_text,
       guests = EXCLUDED.guests, updated_at = now()`,
    [warnAfter, text, input.guests]
  );
  return { warn_after: warnAfter, text, guests: input.guests };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The settings of one copy; every field null when it has none of its own. */
export async function getCopyNotices(instanceIds: readonly string[]): Promise<Map<string, CopyNotice>> {
  const found = new Map<string, CopyNotice>();
  if (!instanceIds.length) return found;
  const result = await pool.query(
    `SELECT instance_id, warn_after, notice_text, guests FROM pos_license_copy_notices WHERE instance_id = ANY($1::uuid[])`,
    [instanceIds]
  );
  for (const row of result.rows as Array<Record<string, unknown>>) {
    found.set(String(row.instance_id), {
      warn_after: row.warn_after === null ? null : cleanWarnAfter(Number(row.warn_after)),
      text: cleanNoticeText(row.notice_text),
      guests: typeof row.guests === 'boolean' ? row.guests : null,
    });
  }
  return found;
}

/**
 * Set one copy's own settings. A field left null follows the settings for
 * everyone; all three null is «no settings of its own», and the row goes.
 */
export async function setCopyNotice(
  instanceId: string,
  input: { warn_after?: unknown; text?: unknown; guests?: unknown }
): Promise<CopyNotice> {
  if (!UUID_RE.test(instanceId)) throw new NoticePolicyError('Невідома копія.');
  const warnAfter = input.warn_after === undefined ? null : readWarnAfter(input.warn_after, true);
  const text = readText(input.text);
  const guests = input.guests === null || input.guests === undefined ? null : input.guests;
  if (guests !== null && typeof guests !== 'boolean') {
    throw new NoticePolicyError('«Показувати гостям» — так, ні або «як для всіх».');
  }
  if (warnAfter === null && text === null && guests === null) {
    await pool.query(`DELETE FROM pos_license_copy_notices WHERE instance_id = $1`, [instanceId]);
  } else {
    await pool.query(
      `INSERT INTO pos_license_copy_notices (instance_id, warn_after, notice_text, guests, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (instance_id) DO UPDATE SET
         warn_after = EXCLUDED.warn_after, notice_text = EXCLUDED.notice_text,
         guests = EXCLUDED.guests, updated_at = now()`,
      [instanceId, warnAfter, text, guests]
    );
  }
  return { warn_after: warnAfter, text, guests };
}

/** One copy's settings laid over the settings for everyone. Pure. */
export function mergePolicy(base: NoticePolicy, own: CopyNotice | undefined): NoticePolicy {
  if (!own) return base;
  return {
    warn_after: own.warn_after ?? base.warn_after,
    text: own.text ?? base.text,
    guests: own.guests ?? base.guests,
  };
}

/** What the author's server answers the ping of this copy with. */
export async function policyForCopy(instanceId: string): Promise<NoticePolicy> {
  const [base, own] = await Promise.all([getNoticePolicy(), getCopyNotices([instanceId])]);
  return mergePolicy(base, own.get(instanceId));
}
