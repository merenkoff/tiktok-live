// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/fiscal.service.ts
//
// Checkout orchestration: pre-flight, fiscalise, recover, retry.
//
// The one rule worth reading before anything else — **a committed sale is
// voided only when the document cannot possibly exist at the provider.** The
// most likely post-commit failure is a timeout on the receipt call itself, and
// a timeout says nothing about whether the provider committed. Voiding there
// returns stock while ПРРО may hold a valid receipt; the cashier re-rings with
// a fresh `client_uuid`, hence a fresh `provider_request_id`, which bypasses
// the duplicate machinery that exists precisely to stop this. Two fiscal
// receipts, tax owed on both. See `mayExistAtProvider`.

import { pool } from '../../db.js';
import { logger } from '../../logger.js';
import {
  asFiscalError,
  FiscalError,
  isDuplicate,
  isRecoverable,
  isTerminal,
  type FiscalErrorKind,
} from './errors.js';
import * as ledger from './ledger.js';
import {
  buildRefundDoc,
  buildSaleDoc,
  buildServiceDoc,
  type BarcodeResolution,
  type RefundInput,
  type SaleInput,
  type TaxCodeResolution,
} from './mapping.js';
import { awaitSlot, type FiscalCallPriority } from './rateLimit.js';
import * as runtime from './runtime.js';
import { getFiscalSettings, rememberRegisterFiscalNumber } from './settings.service.js';
import {
  buildCallCtx,
  closeShift,
  ensureOpenShift,
  getLiveShiftRow,
  resolveContext,
  SHIFT_MAX_AGE_MS,
  type FiscalContext,
} from './shifts.service.js';
import type { FiscalCallCtx, FiscalResult } from './types.js';
import { assertHolder } from './offline/holder.js';
import {
  getLiveSession,
  listLiveServerSessions,
  markClosed,
  markGoOfflineSent,
  markGoOnlineSent,
  markReplaying,
  markStuck,
  openServerSession,
  stampNext,
  type OfflineSessionRow,
} from './offline/session.js';
import { refillOfflineCodes } from './offline/pool.js';

/**
 * Budget for the entire fiscal phase of one request.
 *
 * The till's axios client gives up at 15s (`pos/src/services/api.ts:64`). A
 * server still working past that fiscalises a sale the cashier has already been
 * told failed, and the retry then mints a second one.
 */
export const FISCAL_BUDGET_MS = 9_000;

/** Documents older than this are swept up even if no shift close collected them. */
export const STALE_DOC_AGE_MS = SHIFT_MAX_AGE_MS + 60 * 60 * 1000;

/** The cron's per-tick batch. Small: it competes with live checkouts. */
const RETRY_BATCH = 20;

/** How long the cron will queue behind the live path before skipping a doc. */
const BACKGROUND_MAX_WAIT_MS = 250;

/**
 * Sub-budget for fetching the provider's receipt text after a document is
 * already `DONE`. Carved out of the shared budget, not added to it: the text
 * is cosmetic (the till prints its own layout without it), so an overrun here
 * must never fail a receipt the tax service has already accepted.
 */
const RECEIPT_TEXT_BUDGET_MS = 2_500;

/**
 * Offline-session gates (TechDocs/POS_FISCAL_OFFLINE.md §4, план фазы 2 п. 8).
 * The tax office allows 36h of offline selling in a row and a 24h shift; both
 * are checked with a margin so the replay still has time to land inside them.
 */
export const OFFLINE_SESSION_MAX_MS = 36 * 60 * 60 * 1000 - 30 * 60 * 1000;
export const SHIFT_DEADLINE_MS = 24 * 60 * 60 * 1000 - 15 * 60 * 1000;

/** What the caller is about to register — decides what an offline session admits. */
export type FiscalOp = 'sale' | 'refund' | 'service';

export interface FiscalGate {
  /** False = this store does not fiscalise; the caller proceeds unchanged. */
  on: boolean;
  /** `offline` = the provider is unreachable and the store sells from its code reserve. */
  mode: 'online' | 'offline';
  session: OfflineSessionRow | null;
  ctx: FiscalContext | null;
  shiftRowId: number | null;
  staffId: number | null;
  signal: AbortSignal;
}

/** What `fiscalize*` hands back to the route. */
export interface FiscalView {
  /** `pending` = stamped offline; the provider confirms it on replay. */
  status: 'done' | 'failed' | 'pending';
  mode: 'online' | 'offline';
  fiscal_code: string | null;
  fiscal_date: string | null;
  /** Контрольне число — offline documents get it from the provider on replay. */
  control_number: string | null;
  tax_url: string | null;
  qr_payload: string | null;
  receipt_text: string | null;
  error_code: string | null;
  message: string | null;
}

const OFF: FiscalGate = {
  on: false,
  mode: 'online',
  session: null,
  ctx: null,
  shiftRowId: null,
  staffId: null,
  signal: AbortSignal.timeout(1),
};

/**
 * Can this store sell right now?
 *
 * Runs BEFORE `completeSale`, so a failure costs nothing: no row, no burned
 * receipt number, no stock movement. This is the whole "block the sale when the
 * fiscal server is unreachable" stance — unless the store runs in offline mode,
 * where an unreachable provider opens a server-held offline session instead
 * and sales are stamped from the code reserve (case B).
 *
 * While a session is live, every sale is stamped — even once the provider is
 * back — because an online receipt inside the session would break the
 * `go-offline` date ordering; only the replay ends a session.
 */
export async function preflight(
  storeId: number,
  staffId: number,
  deviceId: string | null = null,
  op: FiscalOp = 'sale'
): Promise<FiscalGate> {
  const ctx = await resolveContext(storeId);
  if (!ctx) return OFF;

  // Before the shift: a till that does not own the register must not open
  // one either. No-op unless the store runs in offline mode.
  await assertHolder(ctx, deviceId);

  const signal = AbortSignal.timeout(FISCAL_BUDGET_MS);
  const offlineCapable = Boolean(ctx.settings.offline_mode && ctx.provider.offline);

  if (offlineCapable) {
    const live = await getLiveSession(ctx.storeId, ctx.registerKey);
    if (live) return offlineGate(ctx, live, staffId, signal, op);
  }

  try {
    await ensureOpenShift(ctx, signal, staffId);
  } catch (raw) {
    const err = asFiscalError(raw, 'Немає звʼязку з ПРРО');
    if (!offlineCapable || err.kind !== 'unavailable' || op !== 'sale') throw err;
    // v1: an offline session lives only inside a shift that was opened
    // online — our mirror row is the proof it was.
    const shiftRow = await getLiveShiftRow(storeId, ctx.registerKey);
    if (shiftRow?.status !== 'open') throw err;
    // An offline receipt is printed from the cached requisites (the legal
    // header, ФН ПРРО — POS_FISCAL_OFFLINE.md «Фаза 8в»). Without them there
    // is nothing lawful to hand the customer, so the store's first receipt
    // has to be an online one; the shift open that precedes it caches them.
    if (!ctx.settings.requisites) {
      throw new FiscalError(
        'Немає звʼязку з ПРРО, а реквізити чека ще не отримано — спершу проведіть один чек онлайн',
        'unavailable'
      );
    }
    const session = await openServerSession(ctx, Number(shiftRow.id));
    return offlineGate(ctx, session, staffId, signal, op);
  }
  const shiftRow = await getLiveShiftRow(storeId, ctx.registerKey);

  return {
    on: true,
    mode: 'online',
    session: null,
    ctx,
    shiftRowId: shiftRow ? Number(shiftRow.id) : null,
    staffId,
    signal,
  };
}

/** The gate for a store inside a live offline session. Throws the session's refusals. */
async function offlineGate(
  ctx: FiscalContext,
  session: OfflineSessionRow,
  staffId: number | null,
  signal: AbortSignal,
  op: FiscalOp
): Promise<FiscalGate> {
  if (session.holder !== 'server') {
    // A till-held session (case C, phase 3) is replayed by that till's sync;
    // nothing else may register documents on the register meanwhile.
    throw new FiscalError('Каса надсилає офлайн-чеки — зачекайте синхронізації', 'offline_session_open');
  }
  if (session.status === 'replaying') {
    throw new FiscalError('ПРРО надсилає офлайн-чеки — повторіть за хвилину', 'replaying');
  }
  if (op !== 'sale') {
    // Refunds and service receipts are v2 offline (§7); sending them online
    // inside the session would break the date ordering just the same.
    throw new FiscalError('Офлайн-чеки ПРРО ще не надіслано', 'offline_session_open');
  }

  const now = Date.now();
  if (now - new Date(session.started_at).getTime() >= OFFLINE_SESSION_MAX_MS) {
    await markStuck(session.id, 'offline_limit', 'Офлайн понад 36 годин — потрібен звʼязок із ПРРО');
    throw new FiscalError('Офлайн ПРРО триває понад 36 годин', 'offline_limit');
  }
  const shiftRow = await getLiveShiftRow(ctx.storeId, ctx.registerKey);
  if (shiftRow?.opened_at && now - new Date(shiftRow.opened_at).getTime() >= SHIFT_DEADLINE_MS) {
    throw new FiscalError('Зміна ПРРО добігає доби', 'shift_deadline');
  }

  return {
    on: true,
    mode: 'offline',
    session,
    ctx,
    shiftRowId: session.shift_id ?? (shiftRow ? Number(shiftRow.id) : null),
    staffId,
    signal,
  };
}

/**
 * The only question that decides whether a committed sale may be voided.
 *
 * `rejected` ⇒ no document is a **contract on adapters**, documented on
 * `FiscalErrorKind`. Get it wrong and fiscalised sales get voided and re-rung.
 */
export function mayExistAtProvider(kind: FiscalErrorKind, transmitted: boolean): boolean {
  if (!transmitted) return false; // it never left the building
  switch (kind) {
    case 'rejected': // validated and refused ⇒ no document
    case 'auth_expired':
    case 'shift_closed':
    case 'shift_expired':
    case 'rate_limited':
      return false; // refused before processing
    default:
      return true; // unavailable / unknown — genuinely unknown
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Aborted'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function invalidateRuntimeFor(storeId: number, kind: FiscalErrorKind): void {
  if (kind === 'auth_expired') runtime.invalidateSession(storeId);
  if (kind === 'shift_closed' || kind === 'shift_expired') runtime.invalidateShift(storeId);
  // The cached shift is what lets pre-flight skip the provider; after an
  // outage answered a live call, the next pre-flight must probe again —
  // that probe is how an offline-mode store notices it has to open a session.
  if (kind === 'unavailable') runtime.invalidateShift(storeId);
}

function toView(row: ledger.FiscalReceiptRow, result: FiscalResult | null): FiscalView {
  if (result) {
    return {
      status: 'done',
      mode: row.mode ?? 'online',
      fiscal_code: result.fiscalCode,
      fiscal_date: result.fiscalDate,
      control_number: result.controlNumber ?? null,
      tax_url: result.taxUrl,
      qr_payload: result.qrPayload,
      receipt_text: result.receiptText,
      error_code: null,
      message: null,
    };
  }
  return {
    status: 'failed',
    mode: row.mode ?? 'online',
    fiscal_code: null,
    fiscal_date: null,
    control_number: null,
    tax_url: null,
    qr_payload: null,
    receipt_text: null,
    error_code: row.error_code,
    message: row.error_message,
  };
}

/**
 * A document stamped offline: the fiscal number is the tax-office code, and the
 * check link is the one we composed at stamp time (`taxUrl.ts`) — the till
 * prints it as the QR immediately. What still arrives on replay is the
 * контрольне число and the provider's own link.
 */
function offlineView(row: ledger.FiscalReceiptRow): FiscalView {
  return {
    status: 'pending',
    mode: 'offline',
    fiscal_code: row.fiscal_code,
    fiscal_date: row.fiscal_date ? new Date(row.fiscal_date).toISOString() : null,
    control_number: row.control_number,
    tax_url: row.tax_url ?? null,
    qr_payload: null,
    receipt_text: null,
    error_code: null,
    message: null,
  };
}

/** Thrown out of `runDocument` so the route can decide about voiding. */
export class FiscalDocumentFailed extends Error {
  constructor(
    readonly row: ledger.FiscalReceiptRow,
    readonly cause: FiscalError,
    /** False ⇒ safe to void the parent sale. */
    readonly mayExist: boolean
  ) {
    super(cause.message);
    this.name = 'FiscalDocumentFailed';
  }
}

type Send = (callCtx: FiscalCallCtx) => Promise<FiscalResult>;

/**
 * Transmit one document, with the recovery rules.
 *
 * One place, so sale/refund/service cannot drift apart: ONE repair for a
 * recoverable kind then ONE more attempt, ONE short pause for `rate_limited`,
 * and `duplicate` resolved by reading rather than re-sending.
 */
async function runDocument(
  gate: FiscalGate,
  row: ledger.FiscalReceiptRow,
  send: Send,
  priority: FiscalCallPriority
): Promise<{ row: ledger.FiscalReceiptRow; result: FiscalResult }> {
  const ctx = gate.ctx as FiscalContext;
  let transmitted = false;
  let repaired = false;
  let slowedDown = false;

  const attempt = async (): Promise<FiscalResult> => {
    const callCtx = await buildCallCtx(ctx, gate.signal);
    // The slot is for TRANSMISSIONS only — never for signIn/getShift/openShift,
    // and never for fetchDocument (a read on a path that already spent a token).
    const granted = await awaitSlot(ctx.storeId, ctx.registerKey, priority, gate.signal, {
      maxWaitMs: priority === 'background' ? BACKGROUND_MAX_WAIT_MS : undefined,
    });
    if (!granted) {
      throw new FiscalError('ПРРО зайняте — спробуємо пізніше', 'rate_limited');
    }
    transmitted = true;
    return send(callCtx);
  };

  let result: FiscalResult | null = null;
  try {
    for (let pass = 0; pass < 3 && !result; pass++) {
      try {
        result = await attempt();
      } catch (raw) {
        const err = asFiscalError(raw, 'Помилка реєстрації чека в ПРРО');

        if (isDuplicate(err.kind)) {
          result = await resolveDuplicate(ctx, gate, row, err);
          break;
        }
        if (isRecoverable(err.kind) && !repaired) {
          repaired = true;
          transmitted = false;
          await recover(ctx, gate, row, err);
          continue;
        }
        if (err.kind === 'rate_limited' && !slowedDown) {
          slowedDown = true;
          transmitted = false;
          await sleep(Math.min(err.retryAfterMs ?? 400, 600), gate.signal);
          continue;
        }
        throw err;
      }
    }
    runtime.markProviderOk(ctx.storeId);
    const final = await attachProviderReceiptText(ctx, gate, row, result as FiscalResult);
    return { row: await ledger.markDone(row, final), result: final };
  } catch (raw) {
    const err = asFiscalError(raw, 'Помилка ПРРО');
    invalidateRuntimeFor(ctx.storeId, err.kind);
    const failed = await ledger.markFailed(row, err, {
      providerDocId: err.existingProviderDocId ?? null,
      park: isTerminal(err.kind),
    });
    throw new FiscalDocumentFailed(failed, err, mayExistAtProvider(err.kind, transmitted));
  }
}

/**
 * Decide what `receipt_text` the ledger row carries, per `receipt_source`.
 *
 * `provider`: ask the adapter for its text render at the store's
 * `receipt_width`, best-effort — a failure logs and leaves the row without
 * text, and the till prints its own layout (with the fiscal block) instead.
 * `local`: no text at all, even if the adapter volunteered one from
 * `registerSale`, so the till's "print provider text iff present" rule is
 * exactly the owner's setting and nothing else.
 *
 * Runs after the document is final and before `markDone`, so it covers the
 * live path, the retry cron and duplicate recovery alike, and never touches
 * the rate limiter — it is a read, like `fetchDocument`.
 */
async function attachProviderReceiptText(
  ctx: FiscalContext,
  gate: FiscalGate,
  row: ledger.FiscalReceiptRow,
  result: FiscalResult
): Promise<FiscalResult> {
  if (ctx.settings.receipt_source !== 'provider') {
    return result.receiptText === null ? result : { ...result, receiptText: null };
  }
  if (!ctx.provider.renderReceipt) return result;
  // Service receipts (cash in/out) are never printed for a customer.
  if (row.doc_type !== 'sale' && row.doc_type !== 'refund') return result;

  try {
    const signal = AbortSignal.any([gate.signal, AbortSignal.timeout(RECEIPT_TEXT_BUDGET_MS)]);
    const callCtx = await buildCallCtx(ctx, signal);
    const rendering = await ctx.provider.renderReceipt(callCtx, result.providerDocId, 'text', {
      width: ctx.settings.receipt_width,
    });
    const text = typeof rendering?.body === 'string' ? rendering.body.trim() : '';
    return text ? { ...result, receiptText: text } : result;
  } catch (error) {
    logger.warn('Provider receipt text unavailable; the till prints its own layout', {
      storeId: ctx.storeId,
      providerDocId: result.providerDocId,
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}

/**
 * The provider already holds our `requestId` — read what it made.
 *
 * A `null` here is never "not fiscalised": re-POSTing would answer `duplicate`
 * forever, and voiding would discard a receipt the tax service has already
 * seen. It becomes a parked failure the owner resolves in the provider's own
 * cabinet, flagged with its own code so the message can say so.
 */
async function resolveDuplicate(
  ctx: FiscalContext,
  gate: FiscalGate,
  row: ledger.FiscalReceiptRow,
  err: FiscalError
): Promise<FiscalResult> {
  const docId = err.existingProviderDocId ?? row.provider_doc_id;
  if (!docId) {
    throw new FiscalError('ПРРО має цей чек, але не назвало його id', 'unknown', {
      providerCode: 'duplicate_unresolved',
    });
  }
  const callCtx = await buildCallCtx(ctx, gate.signal);
  const fetched = await ctx.provider.fetchDocument(callCtx, docId);
  if (!fetched) {
    throw new FiscalError('ПРРО не повертає вже зареєстрований чек', 'unknown', {
      providerCode: 'duplicate_unresolved',
      existingProviderDocId: docId,
    });
  }
  return fetched;
}

async function recover(
  ctx: FiscalContext,
  gate: FiscalGate,
  row: ledger.FiscalReceiptRow,
  err: FiscalError
): Promise<void> {
  if (err.kind === 'auth_expired') {
    runtime.invalidateSession(ctx.storeId); // the next buildCallCtx signs in
    return;
  }

  runtime.invalidateShift(ctx.storeId);
  if (err.kind === 'shift_expired') {
    await closeShift(ctx, gate.signal);
  }
  await ensureOpenShift(ctx, gate.signal, gate.staffId);

  // The document now belongs to a DIFFERENT shift. Re-stamp before retrying, or
  // the close we just performed (which runs `abandonShiftDocs`) will have
  // parked this row against a shift it was never registered in — and the ledger
  // would then disagree with the provider's Z-reports.
  const live = await getLiveShiftRow(ctx.storeId, ctx.registerKey);
  if (live && Number(live.id) !== row.shift_id) {
    await ledger.restampShift(row.id, Number(live.id));
    row.shift_id = Number(live.id);
    gate.shiftRowId = Number(live.id);
  }
}

// ── Per-line tax codes and barcodes ─────────────────────────────────────────

/**
 * `getSale` returns `variant_id` but not `product_id`, so the tax code has to be
 * looked up. Lives here rather than in `sales.service.ts`: selling does not need
 * to know what a tax code is.
 */
async function loadLineCodes(
  storeId: number,
  saleId: number,
  defaultTaxCode: string | null
): Promise<{ tax: TaxCodeResolution; codes: BarcodeResolution }> {
  const result = await pool.query(
    `SELECT si.id AS sale_item_id, v.barcode, p.fiscal_tax_code, p.fiscal_uktzed
     FROM pos_sale_items si
     JOIN pos_variants v ON v.id = si.variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE si.sale_id = $1 AND si.store_id = $2`,
    [saleId, storeId]
  );

  const byItemId: Record<number, string | null> = {};
  const barcodeByItemId: Record<number, string | null> = {};
  const uktzedByItemId: Record<number, string | null> = {};
  for (const row of result.rows) {
    const id = Number(row.sale_item_id);
    byItemId[id] = row.fiscal_tax_code ?? null;
    barcodeByItemId[id] = row.barcode ?? null;
    uktzedByItemId[id] = row.fiscal_uktzed ?? null;
  }

  return {
    tax: { byItemId, fallback: defaultTaxCode },
    codes: { byItemId: barcodeByItemId, uktzedByItemId },
  };
}

// ── Public entry points ─────────────────────────────────────────────────────

export interface FiscalSaleSource extends SaleInput {
  id: number;
  client_uuid: string | null;
}

/** Fiscalise a freshly committed sale. Throws {@link FiscalDocumentFailed}. */
export async function fiscalizeSale(
  gate: FiscalGate,
  sale: FiscalSaleSource
): Promise<FiscalView> {
  const ctx = gate.ctx as FiscalContext;
  const requestId = sale.client_uuid ?? randomRequestId();
  const { tax, codes } = await loadLineCodes(
    ctx.storeId,
    sale.id,
    ctx.settings.default_tax_code
  );
  const doc = buildSaleDoc({ requestId, sale, tax, codes });

  if (gate.mode === 'offline') return fiscalizeSaleOffline(gate, sale, requestId, doc);

  const row = await ledger.openDocument({
    storeId: ctx.storeId,
    docType: 'sale',
    saleId: sale.id,
    shiftId: gate.shiftRowId,
    provider: ctx.provider.id,
    requestId,
    totalCents: sale.total_cents,
    requestPayload: doc,
  });

  const { row: done, result } = await runDocument(
    gate,
    row,
    (callCtx) => ctx.provider.registerSale(callCtx, doc),
    'live'
  );
  return toView(done, result);
}

/**
 * Case B: no provider call at all. The ledger row is opened as `offline`, the
 * session hands it the next code and its position, and the request payload
 * is kept for the replay (`offline/replay.ts`), which is the only thing that
 * ever transmits it.
 *
 * A stamp failure (`replaying` raced us, the reserve ran dry) is safe to void
 * on: nothing left the building, so `mayExist` is false.
 */
async function fiscalizeSaleOffline(
  gate: FiscalGate,
  sale: FiscalSaleSource,
  requestId: string,
  doc: ReturnType<typeof buildSaleDoc>
): Promise<FiscalView> {
  const ctx = gate.ctx as FiscalContext;
  const session = gate.session as OfflineSessionRow;

  const row = await ledger.openDocument({
    storeId: ctx.storeId,
    docType: 'sale',
    saleId: sale.id,
    shiftId: gate.shiftRowId,
    provider: ctx.provider.id,
    requestId,
    totalCents: sale.total_cents,
    requestPayload: doc,
    mode: 'offline',
  });
  // The same request id again (a replayed checkout) — it is already stamped.
  if (row.offline_seq != null) return offlineView(row);

  try {
    const stamp = await stampNext(session.id, row.id);
    logger.info('Sale stamped offline', {
      storeId: ctx.storeId,
      saleId: sale.id,
      sessionId: session.id,
      seq: stamp.seq,
      fiscalCode: stamp.fiscalCode,
    });
    return offlineView({
      ...row,
      mode: 'offline',
      fiscal_code: stamp.fiscalCode,
      fiscal_date: stamp.fiscalDate,
      tax_url: stamp.taxUrl,
    });
  } catch (raw) {
    const err = asFiscalError(raw, 'Не вдалося видати офлайн-чек');
    const failed = await ledger.markFailed(row, err, { park: true });
    throw new FiscalDocumentFailed(failed, err, false);
  }
}

export interface FiscalRefundSource extends RefundInput {
  id: number;
  client_uuid: string | null;
}

/** Fiscalise a committed refund against the sale's fiscal document. */
export async function fiscalizeRefund(
  gate: FiscalGate,
  refund: FiscalRefundSource,
  sale: FiscalSaleSource
): Promise<FiscalView> {
  const ctx = gate.ctx as FiscalContext;

  const saleDoc = await ledger.getSaleDocument(sale.id);
  if (!saleDoc?.provider_doc_id || saleDoc.status !== 'done') {
    // A return receipt must reference the sale's fiscal document; without one
    // there is nothing to return against.
    throw new FiscalError(
      'Продаж не фіскалізовано — чек повернення неможливий',
      'not_configured'
    );
  }

  const requestId = refund.client_uuid ?? randomRequestId();
  const { tax, codes } = await loadLineCodes(
    ctx.storeId,
    sale.id,
    ctx.settings.default_tax_code
  );
  const doc = buildRefundDoc({
    requestId,
    refund,
    sale,
    relatedProviderDocId: saleDoc.provider_doc_id,
    tax,
    codes,
  });

  const row = await ledger.openDocument({
    storeId: ctx.storeId,
    docType: 'refund',
    refundId: refund.id,
    shiftId: gate.shiftRowId,
    provider: ctx.provider.id,
    requestId,
    totalCents: refund.total_cents,
    requestPayload: doc,
  });

  const { row: done, result } = await runDocument(
    gate,
    row,
    (callCtx) => ctx.provider.registerRefund(callCtx, doc),
    'live'
  );
  return toView(done, result);
}

/** Cash in/out — службове внесення / видача. No parent document. */
export async function fiscalizeService(
  gate: FiscalGate,
  input: { amountCents: number; cashierName: string; ourNumber: string }
): Promise<FiscalView> {
  const ctx = gate.ctx as FiscalContext;
  const requestId = randomRequestId();
  const doc = buildServiceDoc({ ...input, requestId });

  const row = await ledger.openDocument({
    storeId: ctx.storeId,
    docType: doc.kind,
    shiftId: gate.shiftRowId,
    provider: ctx.provider.id,
    requestId,
    totalCents: doc.amountCents,
    requestPayload: doc,
  });

  const { row: done, result } = await runDocument(
    gate,
    row,
    (callCtx) => ctx.provider.registerService(callCtx, doc),
    'live'
  );
  return toView(done, result);
}

/** The failure view for a document that could not be registered. */
export function failureView(error: FiscalDocumentFailed): FiscalView {
  return toView(error.row, null);
}

function randomRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Void a sale whose fiscalisation definitely never reached the provider.
 *
 * Void FIRST, abandon second: the reverse order would strand a live sale
 * carrying an abandoned document if the process died in between. The residual
 * risk of this order (a voided sale with a claimable row) is swept by
 * `abandonVoidedSaleDocs`.
 *
 * Returns false when the void itself failed — the caller must not let that mask
 * the original fiscal error.
 */
export async function abortSale(
  storeId: number,
  saleId: number,
  staffId: number,
  row: ledger.FiscalReceiptRow
): Promise<boolean> {
  try {
    const { voidSale } = await import('../sales.service.js');
    await voidSale({ storeId, saleId, staffId });
    await ledger.markAbandoned(row.id, 'sale_voided', 'Продаж скасовано через збій фіскалізації');
    return true;
  } catch (error) {
    logger.error('Failed to void an unfiscalised sale', {
      storeId,
      saleId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ── Background reconciliation ───────────────────────────────────────────────

let retryRunning = false;

export interface RetryResult {
  done: number;
  failed: number;
  abandoned: number;
  adopted: number;
  /** Offline sessions: documents sent, sessions closed, sessions parked. */
  replayed: number;
  closed: number;
  stuck: number;
}

const EMPTY_RETRY: RetryResult = { done: 0, failed: 0, abandoned: 0, adopted: 0, replayed: 0, closed: 0, stuck: 0 };

/**
 * Retry every due document, then run the housekeeping sweeps.
 *
 * `storeId` narrows the replay and the claim to one store — for tests, whose
 * files run in parallel workers against one database and would otherwise
 * claim each other's documents; the cron passes nothing.
 *
 * Offline sessions go first: while one is live the flat claim holds the
 * store's online documents back, so nothing is retried ahead of the replay.
 *
 * Bounded by the shift, not just by attempts: `abandonShiftDocs` fires on every
 * shift close, and the age net catches shifts that were parked in `'error'`
 * without ever being closed.
 */
export async function retryPendingFiscalDocs(opts: { storeId?: number } = {}): Promise<RetryResult> {
  if (retryRunning) return { ...EMPTY_RETRY };
  retryRunning = true;
  try {
    const replay = await replayServerSessions(opts);

    const abandoned =
      (await ledger.abandonVoidedSaleDocs()) +
      (await ledger.abandonStaleDocs(STALE_DOC_AGE_MS)) +
      replay.abandoned;
    const adopted = await adoptOrphanedSales();

    const claimed = await ledger.claimDueDocuments(RETRY_BATCH, opts.storeId);
    let done = 0;
    let failed = 0;

    for (const row of claimed) {
      try {
        const gate = await backgroundGate(row);
        if (!gate) {
          await ledger.markAbandoned(row.id, 'not_configured', 'ПРРО вимкнено');
          continue;
        }
        await retryOne(gate, row);
        done += 1;
      } catch (error) {
        failed += 1;
        if (!(error instanceof FiscalDocumentFailed)) {
          logger.error('Fiscal retry failed outside the document path', {
            docId: Number(row.id),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      done,
      failed,
      abandoned,
      adopted,
      replayed: replay.replayed,
      closed: replay.closed,
      stuck: replay.stuck,
    };
  } finally {
    retryRunning = false;
  }
}

// ── Offline session replay (case B) ─────────────────────────────────────────
//
// TechDocs/POS_FISCAL_OFFLINE.md §5. One pass per live server-held session:
//   0. is the provider back? (`registerState` — a read, no slot);
//   1. resync the pool — the provider may have gone offline on its own and
//      spent codes we still list as free;
//   2. `go-offline` once, at the session's start, with its code — only if
//      nothing online was delivered after that start (else the register would
//      break, per the provider's own warning: park the session);
//   3. the session's documents, in `offline_seq` order, through the same
//      `runDocument` as everything else — `rejected` parks the document and
//      moves on, an outage stops the pass and the next tick resumes;
//   4. queue empty → `go-online` (≤ 1 per 2 min), then poll until the
//      register reports online → session closed.

/** How long one session may hold the cron tick. The tick is every 2 minutes. */
const REPLAY_SESSION_BUDGET_MS = 60_000;
/** Documents per session per tick — the rest wait for the next one. */
const REPLAY_BATCH = 20;
/** The provider's own limit on `go-online` calls. */
export const GO_ONLINE_MIN_INTERVAL_MS = 2 * 60 * 1000;

export interface ReplayResult {
  sessions: number;
  /** Provider still unreachable — left as they were. */
  skipped: number;
  /** Sent some or all documents; not finished this tick. */
  replaying: number;
  replayed: number;
  abandoned: number;
  closed: number;
  stuck: number;
}

/** `storeId` narrows the pass to one store — for tests; the cron replays every store. */
export async function replayServerSessions(opts: { storeId?: number } = {}): Promise<ReplayResult> {
  const totals: ReplayResult = {
    sessions: 0,
    skipped: 0,
    replaying: 0,
    replayed: 0,
    abandoned: 0,
    closed: 0,
    stuck: 0,
  };
  const sessions = await listLiveServerSessions({ storeId: opts.storeId });
  for (const session of sessions) {
    totals.sessions += 1;
    try {
      const outcome = await replayOneSession(session);
      totals[outcome.status] += 1;
      totals.replayed += outcome.replayed;
      totals.abandoned += outcome.abandoned;
    } catch (error) {
      logger.error('Offline session replay failed outside the document path', {
        storeId: session.store_id,
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return totals;
}

interface SessionOutcome {
  status: 'skipped' | 'replaying' | 'closed' | 'stuck';
  replayed: number;
  abandoned: number;
}

async function replayOneSession(initial: OfflineSessionRow): Promise<SessionOutcome> {
  const none: SessionOutcome = { status: 'skipped', replayed: 0, abandoned: 0 };
  // Park the session only when the store really switched fiscalisation or
  // offline mode off underneath it. Anything else that stops us resolving a
  // context — unreadable credentials after a key rotation, a database blip —
  // is this process's problem, not the session's: leave it for the next tick.
  const settings = await getFiscalSettings(initial.store_id).catch(() => undefined);
  if (settings && (!settings.enabled || !settings.offline_mode)) {
    await markStuck(initial.id, 'not_configured', 'ПРРО або офлайн-режим вимкнено під час офлайн-сесії');
    return { ...none, status: 'stuck' };
  }
  const ctx = settings ? await resolveContext(initial.store_id).catch(() => null) : null;
  if (!ctx) {
    logger.warn('Offline session: cannot resolve the store context, skipping', {
      storeId: initial.store_id,
      sessionId: initial.id,
    });
    return none;
  }
  const ops = ctx.provider.offline;
  if (!ops) {
    // This process has no offline-capable adapter for the store's provider —
    // not the session's fault; leave it for a process that has.
    logger.warn('Offline session: no offline capability in this process, skipping', {
      storeId: ctx.storeId,
      sessionId: initial.id,
      provider: ctx.provider.id,
    });
    return none;
  }

  const signal = AbortSignal.timeout(REPLAY_SESSION_BUDGET_MS);
  const gate: FiscalGate = {
    on: true,
    mode: 'offline',
    session: initial,
    ctx,
    shiftRowId: initial.shift_id,
    staffId: null,
    signal,
  };
  const log = { storeId: ctx.storeId, sessionId: initial.id };

  // 0. Is the provider back? A read — no rate-limit slot.
  let state: Awaited<ReturnType<typeof ops.registerState>>;
  try {
    state = await ops.registerState(await buildCallCtx(ctx, signal));
  } catch (raw) {
    const err = asFiscalError(raw, 'ПРРО недоступне');
    logger.info('Offline session: provider still unreachable', { ...log, kind: err.kind });
    return none;
  }

  // The probe is the cheapest place to learn the register's own number: we
  // need it offline (for the tax-office link) and can only ask online.
  void rememberRegisterFiscalNumber(ctx.storeId, state.fiscalNumber).catch((error) =>
    logger.warn('Could not cache ФН ПРРО', { ...log, error: String(error) })
  );

  // 1. Resync the pool — best effort; an outage here is not a reason to stop.
  try {
    await refillOfflineCodes(ctx, signal);
  } catch (raw) {
    const err = asFiscalError(raw, 'Не вдалося оновити пул кодів');
    logger.warn('Offline session: pool resync failed', { ...log, kind: err.kind });
  }

  // 2. go-offline, once.
  let session = (await markReplaying(initial.id)) ?? initial;
  if (!session.go_offline_tx_id) {
    const floor = await ledger.lastOnlineDeliveredAt(ctx.storeId);
    if (floor && floor.getTime() > new Date(session.started_at).getTime()) {
      await markStuck(
        session.id,
        'go_offline_order',
        'Онлайн-чек доставлено в ДПС після початку офлайн-сесії — реплей неможливий'
      );
      logger.error('Offline session parked: go-offline date would precede a delivered document', {
        ...log,
        startedAt: session.started_at,
        lastDeliveredAt: floor,
      });
      return { ...none, status: 'stuck' };
    }

    if (state.offline && state.manualOffline) {
      // Our earlier go-offline landed but the tx id was never written.
      session = (await markGoOfflineSent(session.id, null)) ?? session;
    } else {
      try {
        // `live` priority for everything the replay transmits: while the
        // session is `replaying` the store's sales are refused, so there is
        // no checkout to keep the reserve for — and a background slot would
        // be declined right after the pool resync took the only spare token.
        await awaitSlot(ctx.storeId, ctx.registerKey, 'live', signal);
        const res = await ops.goOffline(
          await buildCallCtx(ctx, signal),
          new Date(session.started_at),
          session.go_offline_code ?? ''
        );
        session = (await markGoOfflineSent(session.id, res.transactionId)) ?? session;
        logger.info('Offline session: go-offline sent', { ...log, transactionId: res.transactionId });
      } catch (raw) {
        const err = asFiscalError(raw, 'go-offline відхилено');
        if (isTerminal(err.kind)) {
          await markStuck(session.id, `go_offline_${err.kind}`, err.message);
          logger.error('Offline session parked: go-offline refused', { ...log, kind: err.kind, message: err.message });
          return { ...none, status: 'stuck' };
        }
        logger.warn('Offline session: go-offline did not go through, will retry', { ...log, kind: err.kind });
        return { ...none, status: 'replaying' };
      }
    }
  }

  // 3. The documents, in order.
  let replayed = 0;
  let abandoned = 0;
  let previousDocId = await ledger.lastDoneProviderDocId(session.id);
  const docs = (await ledger.listSessionDocuments(session.id)).filter(
    (row) => row.status === 'pending' || row.status === 'failed'
  );
  for (const pending of docs.slice(0, REPLAY_BATCH)) {
    const row = await ledger.claimSessionDocument(pending.id);
    if (!row) continue;
    if (row.doc_type !== 'sale' || !row.fiscal_code || !row.fiscal_date) {
      await ledger.markAbandoned(row.id, 'offline_unsupported', 'Документ не можна надіслати офлайн');
      abandoned += 1;
      continue;
    }
    const payload = await pool.query(`SELECT request_payload FROM pos_fiscal_receipts WHERE id = $1`, [row.id]);
    const doc = payload.rows[0]?.request_payload;
    if (!doc) {
      await ledger.markAbandoned(row.id, 'no_payload', 'Документ не містить запиту для повтору');
      abandoned += 1;
      continue;
    }
    const stamp = {
      fiscalCode: row.fiscal_code,
      fiscalDate: new Date(row.fiscal_date),
      previousDocId: previousDocId ?? undefined,
    };
    try {
      const { result } = await runDocument(
        gate,
        row,
        (callCtx) => ops.registerSaleOffline(callCtx, doc, stamp),
        'live'
      );
      previousDocId = result.providerDocId;
      replayed += 1;
    } catch (error) {
      if (!(error instanceof FiscalDocumentFailed)) throw error;
      if (isTerminal(error.cause.kind)) {
        // The sale stands — goods left the store; the owner sorts the document out.
        await ledger.markAbandoned(row.id, error.cause.providerCode ?? error.cause.kind, error.cause.message);
        abandoned += 1;
        logger.error('Offline document refused on replay; parked for the owner', {
          ...log,
          docId: row.id,
          seq: row.offline_seq,
          kind: error.cause.kind,
        });
        continue;
      }
      logger.warn('Offline session: replay interrupted, will resume', {
        ...log,
        docId: row.id,
        seq: row.offline_seq,
        kind: error.cause.kind,
      });
      return { status: 'replaying', replayed, abandoned };
    }
  }

  const remaining = (await ledger.listSessionDocuments(session.id)).some(
    (row) => row.status === 'pending' || row.status === 'failed'
  );
  if (remaining) return { status: 'replaying', replayed, abandoned };

  // 4. Everything is at the provider — bring the register back online.
  const lastGoOnline = session.last_go_online_at ? new Date(session.last_go_online_at).getTime() : null;
  if (lastGoOnline === null || Date.now() - lastGoOnline >= GO_ONLINE_MIN_INTERVAL_MS) {
    try {
      await awaitSlot(ctx.storeId, ctx.registerKey, 'live', signal);
      await ops.goOnline(await buildCallCtx(ctx, signal));
      session = (await markGoOnlineSent(session.id)) ?? session;
      logger.info('Offline session: go-online sent', log);
    } catch (raw) {
      const err = asFiscalError(raw, 'go-online не пройшов');
      logger.warn('Offline session: go-online failed, will retry', { ...log, kind: err.kind });
      return { status: 'replaying', replayed, abandoned };
    }
  }

  try {
    const after = await ops.registerState(await buildCallCtx(ctx, signal));
    if (after.offline) return { status: 'replaying', replayed, abandoned };
  } catch (raw) {
    const err = asFiscalError(raw, 'ПРРО недоступне');
    logger.warn('Offline session: state probe failed after go-online', { ...log, kind: err.kind });
    return { status: 'replaying', replayed, abandoned };
  }

  await markClosed(session.id);
  runtime.invalidateShift(ctx.storeId);
  logger.info('Offline session closed — register online again', { ...log, replayed, abandoned });
  try {
    await refillOfflineCodes(ctx, signal);
  } catch {
    // The 10-minute cron tops it up; nothing to do now.
  }
  return { status: 'closed', replayed, abandoned };
}

/**
 * A gate for a background retry.
 *
 * Returns null when the store stopped fiscalising, or when the document's shift
 * is no longer the live one — re-sending into a different shift would land the
 * receipt in the wrong Z-report.
 */
async function backgroundGate(row: ledger.FiscalReceiptRow): Promise<FiscalGate | null> {
  const ctx = await resolveContext(Number(row.store_id)).catch(() => null);
  if (!ctx) return null;

  const live = await getLiveShiftRow(Number(row.store_id), ctx.registerKey);
  if (!live || (row.shift_id != null && Number(live.id) !== Number(row.shift_id))) {
    return null;
  }

  return {
    on: true,
    mode: 'online',
    session: null,
    ctx,
    shiftRowId: Number(live.id),
    staffId: null,
    signal: AbortSignal.timeout(FISCAL_BUDGET_MS),
  };
}

async function retryOne(gate: FiscalGate, row: ledger.FiscalReceiptRow): Promise<void> {
  const ctx = gate.ctx as FiscalContext;
  const payload = await pool.query(
    `SELECT request_payload FROM pos_fiscal_receipts WHERE id = $1`,
    [row.id]
  );
  const doc = payload.rows[0]?.request_payload;
  if (!doc) {
    await ledger.markAbandoned(row.id, 'no_payload', 'Документ не містить запиту для повтору');
    return;
  }

  const send: Send = (callCtx) => {
    if (row.doc_type === 'sale') return ctx.provider.registerSale(callCtx, doc);
    if (row.doc_type === 'refund') return ctx.provider.registerRefund(callCtx, doc);
    return ctx.provider.registerService(callCtx, doc);
  };

  await runDocument(gate, row, send, 'background');
}

/**
 * Adopt sales left `pending` with no ledger row at all.
 *
 * `completeSale` commits `fiscal_status='pending'` and the ledger INSERT is a
 * separate transaction. Die in between and you have a sale that says it is
 * being fiscalised with nothing anywhere that ever will — the exact "silently
 * un-fiscalised revenue" the projection exists to prevent, reintroduced one
 * layer up. Adopt only inside a live shift the sale belongs to; otherwise mark
 * it failed-and-parked so it stops being rescanned and starts being visible.
 */
async function adoptOrphanedSales(limit = 20): Promise<number> {
  const orphans = await pool.query(
    `SELECT s.id, s.store_id, s.created_at
     FROM pos_sales s
     LEFT JOIN pos_fiscal_receipts r ON r.sale_id = s.id AND r.doc_type = 'sale'
     WHERE s.fiscal_status IN ('pending', 'failed')
       AND s.status <> 'voided'
       AND r.id IS NULL
     ORDER BY s.created_at ASC
     LIMIT $1`,
    [limit]
  );

  let adopted = 0;
  for (const orphan of orphans.rows) {
    const storeId = Number(orphan.store_id);
    const ctx = await resolveContext(storeId).catch(() => null);
    const live = ctx ? await getLiveShiftRow(storeId, ctx.registerKey) : null;
    const inShift =
      live?.opened_at != null &&
      new Date(live.opened_at).getTime() <= new Date(orphan.created_at).getTime();

    if (!ctx || !inShift) {
      // Nothing can fiscalise it correctly any more. Park it where the owner
      // will see it instead of rescanning it every two minutes forever.
      await pool.query(`UPDATE pos_sales SET fiscal_status = 'failed' WHERE id = $1`, [
        orphan.id,
      ]);
      continue;
    }

    await ledger.openDocument({
      storeId,
      docType: 'sale',
      saleId: Number(orphan.id),
      shiftId: Number(live.id),
      provider: ctx.provider.id,
      requestId: crypto.randomUUID(),
      totalCents: 0,
    });
    // Left with no `request_payload`, so the next claim parks it explicitly
    // rather than silently doing nothing — the owner then decides.
    adopted += 1;
  }
  return adopted;
}

export const listAttentionDocs = ledger.listAttentionDocs;
