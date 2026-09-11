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
  markStuck,
  openServerSession,
  stampNext,
  type OfflineSessionRow,
} from './offline/session.js';

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

/** A document stamped offline: the fiscal number is the tax-office code; the rest arrives on replay. */
function offlineView(row: ledger.FiscalReceiptRow): FiscalView {
  return {
    status: 'pending',
    mode: 'offline',
    fiscal_code: row.fiscal_code,
    fiscal_date: row.fiscal_date ? new Date(row.fiscal_date).toISOString() : null,
    control_number: null,
    tax_url: null,
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
}

/**
 * Retry every due document, then run the housekeeping sweeps.
 *
 * Bounded by the shift, not just by attempts: `abandonShiftDocs` fires on every
 * shift close, and the age net catches shifts that were parked in `'error'`
 * without ever being closed.
 */
export async function retryPendingFiscalDocs(): Promise<RetryResult> {
  if (retryRunning) return { done: 0, failed: 0, abandoned: 0, adopted: 0 };
  retryRunning = true;
  try {
    const abandoned =
      (await ledger.abandonVoidedSaleDocs()) + (await ledger.abandonStaleDocs(STALE_DOC_AGE_MS));
    const adopted = await adoptOrphanedSales();

    const claimed = await ledger.claimDueDocuments(RETRY_BATCH);
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

    return { done, failed, abandoned, adopted };
  } finally {
    retryRunning = false;
  }
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
