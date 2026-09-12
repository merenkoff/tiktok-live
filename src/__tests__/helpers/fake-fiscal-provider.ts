// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/helpers/fake-fiscal-provider.ts
//
// A programmable `FiscalProvider` for tests.
//
// This is what lets the risky half of fiscalisation — shift lifecycle (phase 3)
// and checkout orchestration (phase 4) — be proven without a provider account.
// It is not a stub: it keeps real shift state and, crucially, real idempotency,
// so "the same requestId twice" behaves the way a provider behaves.

import { FiscalError, type FiscalErrorKind } from '../../pos/fiscal/errors.js';
import type {
  FiscalRequisites,
  FiscalCallCtx,
  FiscalCredentials,
  FiscalProbe,
  FiscalProvider,
  FiscalProviderId,
  FiscalRefundDoc,
  FiscalRenderFormat,
  FiscalRendering,
  FiscalRenderOptions,
  FiscalReport,
  FiscalResult,
  FiscalSaleDoc,
  FiscalServiceDoc,
  FiscalSession,
  FiscalShiftClosed,
  FiscalShiftState,
  AskOfflineCodesStatus,
  FiscalOfflineOps,
  OfflineCode,
  OfflineStamp,
} from '../../pos/fiscal/types.js';

/** What a demo Checkbox account looks like to the receipt header. */
export const FAKE_REQUISITES: FiscalRequisites = {
  organization: { name: 'ТОВ «Тестова організація»', edrpou: '44082020', tax_number: '440820207777', is_vat: true },
  point: { name: 'Магазин «Сонечко»', address: 'м. Київ, вул. Сонячна, 27' },
  register: { fiscal_number: 'FAKE-FN', title: 'Каса 1', address: null },
  taxes: [
    { symbol: 'А', label: 'ПДВ 20%', rate: 20, no_vat: false, is_default: true },
    { symbol: 'Б', label: 'Без ПДВ', rate: 0, no_vat: true, is_default: false },
  ],
};

export interface FakeCall {
  method: string;
  requestId?: string;
  doc?: FiscalSaleDoc | FiscalRefundDoc | FiscalServiceDoc;
  /** `renderReceipt` only — what the orchestrator asked for. */
  opts?: FiscalRenderOptions;
}

export interface FakeProviderOptions {
  id?: FiscalProviderId;
  /** Start with an open shift (default: closed, so auto-open is exercised). */
  shiftOpen?: boolean;
  /** Reject `registerSale`/`registerRefund` unless a shift is open. */
  requireOpenShift?: boolean;
  /** Declare the offline capability (default: not declared, like a provider without it). */
  offline?: boolean;
  /** What `fetchRequisites` answers; defaults to `FAKE_REQUISITES`. */
  requisites?: FiscalRequisites;
}

/**
 * An in-memory model of a provider's offline reserve: `reserve` is what
 * `getOfflineCodes` lists (the still-unused codes, lowest serial first),
 * `askOfflineCodes` tops it up when `askStatus` is `done`, and `spend(n)`
 * simulates the provider consuming codes behind our back.
 */
export class FakeOfflineOps implements FiscalOfflineOps {
  readonly calls: string[] = [];
  reserve: OfflineCode[] = [];
  askStatus: AskOfflineCodesStatus = 'done';
  offlineMode = false;
  manualOffline = false;
  /** Make the next `goOffline` fail with this kind. */
  goOfflineError: FiscalErrorKind | null = null;
  /**
   * `goOnline` is asynchronous at a real provider: the register reports
   * `offline` for a while afterwards. This many `registerState` polls keep
   * saying offline before it flips.
   */
  goOnlineLag = 0;
  /** What `goOffline` received, for order/idempotency assertions. */
  readonly goOfflineCalls: Array<{ at: Date; fiscalCode: string }> = [];
  /**
   * Errors for the next offline registrations, in order. Separate from the
   * owner's `queueError` queue, which the sign-in of a replay probe would
   * consume first.
   */
  readonly registerErrors: FiscalErrorKind[] = [];
  private pendingOnline: number | null = null;
  private nextSerial = 1;

  constructor(private readonly owner: FakeFiscalProvider) {}

  /** The provider used `n` of its lowest codes itself (auto-offline). */
  spend(n: number): OfflineCode[] {
    return this.reserve.splice(0, n);
  }

  private mint(upTo: number): void {
    while (this.reserve.length < upTo) {
      const serial = this.nextSerial++;
      this.reserve.push({
        fiscalCode: `OFF-${String(serial).padStart(4, '0')}`,
        serialId: serial,
        createdAt: new Date(),
      });
    }
  }

  async registerState() {
    this.calls.push('registerState');
    if (this.pendingOnline !== null) {
      if (this.pendingOnline <= 0) {
        this.offlineMode = false;
        this.manualOffline = false;
        this.pendingOnline = null;
      } else {
        this.pendingOnline -= 1;
      }
    }
    return {
      fiscalNumber: 'FAKE-FN',
      offline: this.offlineMode,
      manualOffline: this.manualOffline,
    };
  }

  async goOffline(_ctx: FiscalCallCtx, at: Date, fiscalCode: string) {
    this.calls.push('goOffline');
    if (this.goOfflineError) {
      const kind = this.goOfflineError;
      this.goOfflineError = null;
      throw new FiscalError(`fake go-offline ${kind}`, kind);
    }
    this.goOfflineCalls.push({ at, fiscalCode });
    this.reserve = this.reserve.filter((c) => c.fiscalCode !== fiscalCode);
    this.offlineMode = true;
    this.manualOffline = true;
    return { transactionId: `fake-tx-${fiscalCode}` };
  }

  async goOnline() {
    this.calls.push('goOnline');
    if (this.goOnlineLag === 0) {
      this.offlineMode = false;
      this.manualOffline = false;
      this.pendingOnline = null;
      return;
    }
    // A repeated go-online while the first is still in flight does not
    // restart the wait — the provider is already working on it.
    if (this.pendingOnline === null) this.pendingOnline = this.goOnlineLag;
  }

  async askOfflineCodes(_ctx: FiscalCallCtx, count: number) {
    this.calls.push(`askOfflineCodes:${count}`);
    if (this.askStatus === 'done') this.mint(count);
    return { status: this.askStatus, error: this.askStatus === 'done' ? null : 'fake' };
  }

  async getOfflineCodes(_ctx: FiscalCallCtx, count: number) {
    this.calls.push(`getOfflineCodes:${count}`);
    return this.reserve.slice(0, count);
  }

  async offlineCodesCount() {
    this.calls.push('offlineCodesCount');
    return { available: this.reserve.length, minimal: 10, used: 0, enough: this.reserve.length >= 10 };
  }

  private takeRegisterError(): void {
    const kind = this.registerErrors.shift();
    if (kind) throw new FiscalError(`fake offline registration ${kind}`, kind);
  }

  async registerSaleOffline(_ctx: FiscalCallCtx, doc: FiscalSaleDoc, off: OfflineStamp) {
    this.calls.push('registerSaleOffline');
    this.takeRegisterError();
    return this.owner.registerOffline('registerSaleOffline', doc, doc.totalCents, off);
  }

  async registerRefundOffline(_ctx: FiscalCallCtx, doc: FiscalRefundDoc, off: OfflineStamp) {
    this.calls.push('registerRefundOffline');
    this.takeRegisterError();
    return this.owner.registerOffline('registerRefundOffline', doc, doc.totalCents, off);
  }
}

/**
 * Everything is deterministic and inspectable: `calls` records what happened,
 * `queueError` schedules the next failure, and `documents` is the provider's
 * memory of what it already fiscalised.
 */
export class FakeFiscalProvider implements FiscalProvider {
  readonly id: FiscalProviderId;
  readonly title = 'Fake provider';
  readonly secretKeys = [
    { key: 'licenceKey', label: 'Licence key', required: true, kind: 'password' as const },
    { key: 'cashierPin', label: 'Cashier PIN', required: true, kind: 'password' as const },
  ];

  /** Every call made against this provider, in order. */
  readonly calls: FakeCall[] = [];
  /** requestId → the result the provider already produced for it. */
  readonly documents = new Map<string, FiscalResult>();

  shift: FiscalShiftState | null = null;
  signInCount = 0;
  /** Set to make `signIn` fail — e.g. to prove a recovery path gives up. */
  signInError: FiscalErrorKind | null = null;
  /**
   * Set to make `renderReceipt` fail on its own, without touching the shared
   * `queueError` queue — the next queued error would hit `registerSale`
   * first, and the point is to prove a text fetch failing AFTER a document is
   * done leaves that document done.
   */
  renderError: FiscalErrorKind | null = null;

  /** Present only when constructed with `offline: true`. */
  readonly offline?: FakeOfflineOps;
  requisites: FiscalRequisites;
  /** Make `fetchRequisites` fail with this kind — separately from the shared error queue. */
  requisitesError: FiscalErrorKind | null = null;

  private readonly errorQueue: FiscalError[] = [];
  private readonly requireOpenShift: boolean;
  private seq = 0;

  constructor(opts: FakeProviderOptions = {}) {
    this.id = opts.id ?? 'checkbox';
    this.requireOpenShift = opts.requireOpenShift ?? true;
    this.requisites = opts.requisites ?? FAKE_REQUISITES;
    if (opts.offline) this.offline = new FakeOfflineOps(this);
    if (opts.shiftOpen) {
      this.shift = {
        providerShiftId: 'fake-shift-0',
        status: 'open',
        openedAt: new Date().toISOString(),
        autoCloseAt: null,
      };
    }
  }

  /** The next call throws this. Queue several to fail several times. */
  queueError(kind: FiscalErrorKind, message = `fake ${kind}`, opts = {}): void {
    this.errorQueue.push(new FiscalError(message, kind, opts));
  }

  reset(): void {
    this.calls.length = 0;
    this.documents.clear();
    this.errorQueue.length = 0;
    this.shift = null;
    this.signInCount = 0;
    this.signInError = null;
    this.renderError = null;
    this.seq = 0;
  }

  private take(): void {
    const error = this.errorQueue.shift();
    if (error) throw error;
  }

  private record(method: string, doc?: FakeCall['doc'], opts?: FiscalRenderOptions): void {
    this.calls.push({ method, requestId: doc?.requestId, doc, opts });
  }

  // ── Session ───────────────────────────────────────────────────────────────

  async fetchRequisites(): Promise<FiscalRequisites> {
    this.record('fetchRequisites');
    if (this.requisitesError) throw new FiscalError('fake requisites', this.requisitesError);
    return structuredClone(this.requisites);
  }

  async probe(creds: FiscalCredentials): Promise<FiscalProbe> {
    this.record('probe');
    this.take();
    const ok = Boolean(creds.secrets.licenceKey);
    return {
      ok,
      cashierName: ok ? 'Fake Cashier' : null,
      cashRegister: ok ? 'FAKE-REG-1' : null,
      shiftOpen: this.shift?.status === 'open',
      message: ok ? null : 'no licence key',
    };
  }

  async signIn(): Promise<FiscalSession> {
    this.record('signIn');
    this.signInCount += 1;
    if (this.signInError) throw new FiscalError('fake sign-in failure', this.signInError);
    this.take();
    return { token: `fake-token-${this.signInCount}`, expiresAt: null };
  }

  async signOut(): Promise<void> {
    this.record('signOut');
  }

  // ── Shift ─────────────────────────────────────────────────────────────────

  async getShift(): Promise<FiscalShiftState | null> {
    this.record('getShift');
    this.take();
    return this.shift;
  }

  async openShift(_ctx: FiscalCallCtx, opts?: { autoCloseAt?: Date }): Promise<FiscalShiftState> {
    this.record('openShift');
    this.take();
    this.shift = {
      providerShiftId: `fake-shift-${++this.seq}`,
      status: 'open',
      openedAt: new Date().toISOString(),
      autoCloseAt: opts?.autoCloseAt ? opts.autoCloseAt.toISOString() : null,
    };
    return this.shift;
  }

  async closeShift(): Promise<FiscalShiftClosed> {
    this.record('closeShift');
    this.take();
    const open = this.shift;
    if (!open) throw new FiscalError('no open shift', 'shift_closed');
    this.shift = null;
    return {
      ...open,
      status: 'closed',
      closedAt: new Date().toISOString(),
      zReport: { total: 0, receipts: this.documents.size },
      zReportText: 'FAKE Z-REPORT',
    };
  }

  async xReport(): Promise<FiscalReport> {
    this.record('xReport');
    this.take();
    return { text: 'FAKE X-REPORT', raw: {} };
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async registerSale(_ctx: FiscalCallCtx, doc: FiscalSaleDoc): Promise<FiscalResult> {
    return this.register('registerSale', doc, doc.totalCents);
  }

  async registerRefund(_ctx: FiscalCallCtx, doc: FiscalRefundDoc): Promise<FiscalResult> {
    return this.register('registerRefund', doc, doc.totalCents);
  }

  async registerService(_ctx: FiscalCallCtx, doc: FiscalServiceDoc): Promise<FiscalResult> {
    return this.register('registerService', doc, doc.amountCents);
  }

  private register(
    method: string,
    doc: FiscalSaleDoc | FiscalRefundDoc | FiscalServiceDoc,
    totalCents: number
  ): FiscalResult {
    this.record(method, doc);

    // Idempotency BEFORE the queued error, and before the shift check: a real
    // provider that already holds this id says so no matter what else is wrong.
    // Orchestration tests depend on this ordering to prove that a retry after a
    // timeout recovers instead of double-fiscalising.
    const seen = this.documents.get(doc.requestId);
    if (seen) {
      throw new FiscalError('document already registered', 'duplicate', {
        existingProviderDocId: seen.providerDocId,
      });
    }

    this.take();

    if (this.requireOpenShift && this.shift?.status !== 'open') {
      throw new FiscalError('shift is closed', 'shift_closed');
    }

    const n = ++this.seq;
    const result: FiscalResult = {
      providerDocId: `fake-doc-${n}`,
      fiscalCode: `FAKE${String(n).padStart(6, '0')}`,
      fiscalDate: new Date().toISOString(),
      taxUrl: `https://cabinet.tax.gov.test/check/fake-doc-${n}`,
      qrPayload: `fake-qr-${n}`,
      vatCents: null,
      receiptText: `FAKE RECEIPT ${doc.ourNumber}\nTOTAL ${totalCents}`,
      controlNumber: null,
      raw: { fake: true, requestId: doc.requestId },
    };
    this.documents.set(doc.requestId, result);
    return result;
  }

  /** An offline registration: same idempotency, stamped with the given code. */
  registerOffline(
    method: string,
    doc: FiscalSaleDoc | FiscalRefundDoc,
    totalCents: number,
    off: OfflineStamp
  ): FiscalResult {
    const result = this.register(method, doc, totalCents);
    const stamped: FiscalResult = {
      ...result,
      fiscalCode: off.fiscalCode,
      fiscalDate: off.fiscalDate.toISOString(),
      controlNumber: String(1000 + (this.seq % 9000)),
    };
    this.documents.set(doc.requestId, stamped);
    return stamped;
  }

  async fetchDocument(_ctx: FiscalCallCtx, providerDocId: string): Promise<FiscalResult | null> {
    this.record('fetchDocument');
    this.take();
    for (const result of this.documents.values()) {
      if (result.providerDocId === providerDocId) return result;
    }
    return null;
  }

  async renderReceipt(
    _ctx: FiscalCallCtx,
    providerDocId: string,
    format: FiscalRenderFormat,
    opts?: FiscalRenderOptions
  ): Promise<FiscalRendering | null> {
    this.record('renderReceipt', undefined, opts);
    this.take();
    if (this.renderError) throw new FiscalError('fake render failure', this.renderError);
    if (format === 'qrcode') {
      return {
        format,
        contentType: 'image/png',
        body: Buffer.from('fake-png'),
      };
    }
    // Width in the body so a test can assert the store setting reached us.
    const width = opts?.width ?? 0;
    return { format, contentType: 'text/plain', body: `FAKE ${format} ${providerDocId} w${width}` };
  }
}

/** A `FiscalCallCtx` for a fake provider, with a real (long) deadline. */
export function fakeCallCtx(
  storeId = 1,
  overrides: Partial<FiscalCallCtx> = {}
): FiscalCallCtx {
  return {
    storeId,
    creds: {
      provider: 'checkbox',
      config: {},
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    },
    session: { token: 'fake-token', expiresAt: null },
    clientName: 'the-live-shop-test',
    clientVersion: '0.0.0',
    signal: AbortSignal.timeout(30_000),
    ...overrides,
  };
}
