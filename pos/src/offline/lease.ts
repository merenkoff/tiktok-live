// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/offline/lease.ts
//
// The till's own reserve of tax-office codes, and the decision of whether it
// may print a fiscal receipt with no network at all — case C of
// TechDocs/POS_FISCAL_OFFLINE.md (фаза 3, шаг 3).
//
// Everything here has to work with the server unreachable, so it is a cache
// with rules rather than a request: the reserve is refreshed on every sync
// while there is a connection, and spent locally while there is not. The
// server remains the authority — a code we think we hold but it has burned is
// refused when the receipt is finally uploaded — but that answer arrives far
// too late to gate a sale on, which is why the gates below are local.
//
// Refusing is the normal outcome for most stores: a receipt printed without
// the register's requisites, outside a shift, or past the tax office's limits
// is not a receipt. The cashier is told which, in a sentence they can act on.

import { getMeta, setMeta } from './db';
import { OfflineFiscalError } from './errors';
import { api } from '../services/api';
import type { FiscalLeaseResponse, FiscalOfflineStamp, FiscalPublicConfig } from '../types';

const META_KEY = 'fiscalLease';

/**
 * The tax office allows 36h of offline selling in a row and a 24h shift. Both
 * are held with a margin, and the margins are deliberately larger than the
 * server's: the till has to stop stamping *before* the server would have
 * closed the shift underneath it, or its last receipts would be dated after a
 * Z-report and could never be filed.
 */
export const OFFLINE_STRETCH_MAX_MS = 36 * 60 * 60 * 1000 - 30 * 60 * 1000;
export const SHIFT_DEADLINE_MS = 15 * 60 * 1000;

export interface StoredLease {
  /** Codes the server confirmed are ours, in spend order. */
  codes: string[];
  /** Codes we have already stamped and not yet had confirmed. */
  spent: string[];
  /** The open shift we may stamp inside, as the server last reported it. */
  shift: { id: number; auto_close_due_at: string | null } | null;
  registerFiscalNumber: string | null;
  /** Set when the server refuses us a lease at all; cleared by a good answer. */
  blocked: 'not_holder' | 'offline_off' | null;
  /** The current offline stretch: id, when it began, next position. */
  stretchId: string | null;
  stretchStartedAt: number | null;
  nextSeq: number;
  fetchedAt: number;
}

const EMPTY: StoredLease = {
  codes: [],
  spent: [],
  shift: null,
  registerFiscalNumber: null,
  blocked: null,
  stretchId: null,
  stretchStartedAt: null,
  nextSeq: 1,
  fetchedAt: 0,
};

export async function loadLease(): Promise<StoredLease> {
  return (await getMeta<StoredLease>(META_KEY)) ?? { ...EMPTY };
}

async function saveLease(lease: StoredLease): Promise<void> {
  await setMeta(META_KEY, lease);
}

/** For tests and for a till that is handing the register over. */
export async function clearLease(): Promise<void> {
  await saveLease({ ...EMPTY });
}

/** How many receipts this till could still print if the network went now. */
export async function availableCodes(): Promise<number> {
  const lease = await loadLease();
  return unspent(lease).length;
}

export interface LeaseSummary {
  /** Receipts still printable offline; null when the store does not sell offline. */
  reserve: number | null;
  /** Why it could not print one, if it could not. */
  refusal: StampRefusal | null;
}

/**
 * What the cashier's banner needs: can this till keep selling if the network
 * goes, and for how many more receipts.
 */
export async function leaseSummary(): Promise<LeaseSummary> {
  const fiscal = api.loadAuth()?.store.fiscal ?? null;
  if (!fiscal?.enabled) return { reserve: null, refusal: null };
  const lease = await loadLease();
  return { reserve: unspent(lease).length, refusal: refuseStamp(fiscal, lease) };
}

function unspent(lease: StoredLease): string[] {
  const spent = new Set(lease.spent);
  return lease.codes.filter((code) => !spent.has(code));
}

/**
 * Pull the reserve down and report how much of the outbox is still unsent.
 *
 * Called at the end of every sync, online only. The `outboxPending` count is
 * not incidental: while it is above zero the server holds the replay back,
 * because `go-offline` fixes the chain's date and a receipt still sitting here
 * would be dated before a chain that had already moved past it.
 *
 * Never throws. A network failure leaves the last reserve in place — that is
 * what it is for — and a refusal is recorded so the till stops stamping.
 */
export async function refreshLease(outboxPending: number): Promise<StoredLease> {
  const lease = await loadLease();
  const fiscal = api.loadAuth()?.store.fiscal;
  if (!fiscal?.enabled || !fiscal.offline_mode) {
    // Not a fiscalising store, or one that does not sell offline: hold nothing.
    if (lease.codes.length || lease.blocked) await clearLease();
    return { ...EMPTY };
  }

  try {
    const answer = await api.fiscalLease(outboxPending);
    const merged = merge(lease, answer, outboxPending);
    await saveLease(merged);
    return merged;
  } catch (error) {
    const blocked = refusal(error);
    if (blocked) {
      // Another till owns the register, or the owner turned offline mode off.
      // Either way this till must not stamp another receipt.
      const next: StoredLease = { ...lease, codes: [], blocked };
      await saveLease(next);
      return next;
    }
    return lease;
  }
}

function refusal(error: unknown): StoredLease['blocked'] {
  const status = (error as { response?: { status?: number; data?: { error?: string } } })?.response;
  if (status?.status !== 409) return null;
  return status.data?.error === 'offline_off' ? 'offline_off' : 'not_holder';
}

/**
 * Fold the server's answer into what we hold.
 *
 * The server's list is the truth about which codes are ours; `spent` keeps the
 * ones we have stamped but not yet uploaded, so they are never handed out
 * twice, and drops the ones that no longer appear — those are receipts the
 * server has already taken.
 *
 * An empty outbox also ends the stretch: everything printed offline is filed,
 * so the next outage is a new stretch with its own session and its own
 * numbering.
 */
function merge(lease: StoredLease, answer: FiscalLeaseResponse, outboxPending: number): StoredLease {
  const codes = answer.codes.map((code) => code.fiscal_code);
  const known = new Set(codes);
  const drained = outboxPending === 0;
  return {
    codes,
    spent: drained ? [] : lease.spent.filter((code) => known.has(code)),
    shift: answer.shift
      ? { id: answer.shift.id, auto_close_due_at: answer.shift.auto_close_due_at }
      : null,
    registerFiscalNumber: answer.register_fiscal_number,
    blocked: null,
    stretchId: drained ? null : lease.stretchId,
    stretchStartedAt: drained ? null : lease.stretchStartedAt,
    nextSeq: drained ? 1 : lease.nextSeq,
    fetchedAt: Date.now(),
  };
}

/** Why this till may not print a fiscal receipt right now. */
export type StampRefusal =
  | 'offline_off'
  | 'not_holder'
  | 'no_requisites'
  | 'no_shift'
  | 'shift_deadline'
  | 'offline_limit'
  | 'no_lease';

const REFUSAL_TEXT: Record<StampRefusal, string> = {
  offline_off: 'Офлайн-режим ПРРО вимкнено — продаж без інтернету неможливий',
  not_holder: 'Цю касу ПРРО зайнято іншим пристроєм — продаж без інтернету неможливий',
  no_requisites: 'Реквізити ПРРО ще не отримано — спершу проведіть один чек онлайн',
  no_shift: 'Зміну ПРРО не відкрито — офлайн-чек неможливий',
  shift_deadline: 'Зміна ПРРО добігає доби — потрібен звʼязок, щоб закрити її',
  offline_limit: 'Офлайн триває понад 36 годин — потрібен звʼязок із ПРРО',
  no_lease: 'Закінчились офлайн-коди ПРРО — потрібен звʼязок із ПРРО',
};

export function refusalText(reason: StampRefusal): string {
  return REFUSAL_TEXT[reason];
}

/**
 * Take the next code for a receipt about to be printed, or refuse with the
 * reason the cashier needs.
 *
 * Writes before returning: the code is spent the moment it is handed out, so a
 * crash between here and the printer costs one code rather than risking the
 * same code on two receipts — which the tax office would refuse.
 */
export async function takeStamp(
  now = Date.now()
): Promise<{ stamp: FiscalOfflineStamp; registerFiscalNumber: string | null }> {
  const fiscal = api.loadAuth()?.store.fiscal ?? null;
  const lease = await loadLease();
  const refused = refuseStamp(fiscal, lease, now);
  if (refused) throw new OfflineFiscalError(refused, refusalText(refused));

  const [code] = unspent(lease);
  const at = new Date(now);
  const stamp: FiscalOfflineStamp = {
    client_session_id: lease.stretchId ?? crypto.randomUUID(),
    seq: lease.nextSeq,
    fiscal_code: code,
    fiscal_date: at.toISOString(),
  };
  await saveLease({
    ...lease,
    spent: [...lease.spent, code],
    stretchId: stamp.client_session_id,
    stretchStartedAt: lease.stretchStartedAt ?? now,
    nextSeq: lease.nextSeq + 1,
  });
  return { stamp, registerFiscalNumber: lease.registerFiscalNumber };
}

/** The gates, in the order a cashier would want to hear them. */
export function refuseStamp(
  fiscal: FiscalPublicConfig | null | undefined,
  lease: StoredLease,
  now = Date.now()
): StampRefusal | null {
  if (!fiscal?.enabled || !fiscal.offline_mode) return 'offline_off';
  if (lease.blocked) return lease.blocked;
  // Печатать нечего: without the register's requisites the receipt would carry
  // no lawful header (Положення № 13 п. 2, фаза 8в).
  if (!fiscal.requisites) return 'no_requisites';
  if (!lease.shift) return 'no_shift';
  const due = lease.shift.auto_close_due_at ? new Date(lease.shift.auto_close_due_at).getTime() : null;
  if (due !== null && now >= due - SHIFT_DEADLINE_MS) return 'shift_deadline';
  if (lease.stretchStartedAt !== null && now - lease.stretchStartedAt >= OFFLINE_STRETCH_MAX_MS) {
    return 'offline_limit';
  }
  if (unspent(lease).length === 0) return 'no_lease';
  return null;
}
