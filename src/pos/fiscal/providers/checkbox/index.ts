// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/index.ts
//
// The Checkbox ПРРО adapter. Every method that Checkbox answers
// asynchronously (open/close a shift, register a document) polls internally
// until the state is final before resolving — see poll.ts's header comment
// for why that has to happen here and nowhere else.

import { FiscalError } from '../../errors.js';
import { POS_API_VERSION } from '../../../version.js';
import type {
  FiscalCallCtx,
  FiscalChainReturn,
  FiscalCredentials,
  FiscalPrepaymentChainOps,
  FiscalProbe,
  FiscalProvider,
  FiscalRefundDoc,
  FiscalRenderFormat,
  FiscalRenderOptions,
  FiscalReport,
  FiscalResult,
  FiscalSaleDoc,
  FiscalServiceDoc,
  FiscalShiftClosed,
  FiscalShiftState,
  FiscalOfflineOps,
  OfflineStamp,
} from '../../types.js';
import {
  askOfflineCodesRequest,
  closeShiftRequest,
  createXReport,
  getCashRegisterDetailed,
  getCashRegisterInfo,
  getTaxes,
  getCurrentShift,
  getMe,
  getOfflineCodesCountRequest,
  getOfflineCodesRequest,
  getPrepaymentRelation,
  getReceipt,
  getReceiptRendering,
  getReportText,
  getShiftShort,
  goOfflineRequest,
  goOnlineRequest,
  openShiftRequest,
  prepaymentChainReceipt,
  prepaymentReceipt,
  returnPrepaymentChain,
  sellReceipt,
  sellReceiptOffline,
  serviceReceipt,
  signInPinCode,
  signOutRequest,
  type CheckboxReceipt,
} from './client.js';
import { classifyCheckboxError } from './errors.js';
import {
  mapChainPaymentPayload,
  mapPrepaymentPayload,
  mapSellOfflinePayload,
  mapSellPayload,
  mapServicePayload,
  toChainState,
  toFiscalResult,
} from './payload.js';
import { pollUntil } from './poll.js';

/**
 * `signIn`/`probe` take bare credentials, not a `FiscalCallCtx` — there is no
 * session yet to carry `clientName`/`clientVersion` (`shifts.service.ts`'s
 * `buildCallCtx` calls `signIn` to construct one). Rather than widen the
 * interface for two constants, use the same values `FISCAL_CLIENT_NAME`/
 * `FISCAL_CLIENT_VERSION` (`shifts.service.ts`) already send for every other
 * call — duplicated here to avoid an import cycle (that module imports
 * `getProvider` from `../providers/index.js`, which will import this file).
 */
const CLIENT_NAME = 'the-live-shop-pos';
const CLIENT_VERSION = String(POS_API_VERSION);

function authedOpts(ctx: FiscalCallCtx) {
  return {
    token: ctx.session.token,
    licenseKey: ctx.creds.secrets.licenceKey,
    signal: ctx.signal,
    clientName: ctx.clientName,
    clientVersion: ctx.clientVersion,
  };
}

async function signAndFetchProbe(
  creds: FiscalCredentials,
  signal: AbortSignal
): Promise<FiscalProbe> {
  const { access_token } = await signInPinCode(
    creds.secrets.licenceKey,
    creds.secrets.cashierPin,
    signal,
    CLIENT_NAME,
    CLIENT_VERSION
  );
  const opts = {
    token: access_token,
    licenseKey: creds.secrets.licenceKey,
    signal,
    clientName: CLIENT_NAME,
    clientVersion: CLIENT_VERSION,
  };
  const [me, shift] = await Promise.all([getMe(opts), getCurrentShift(opts)]);
  return {
    ok: true,
    cashierName: me.full_name,
    cashRegister: me.organization?.title ?? null,
    shiftOpen: shift !== null,
    message: null,
  };
}

type AuthedOpts = ReturnType<typeof authedOpts>;

/** `duplicate` for a document Checkbox holds under our own id. */
function duplicateOf(requestId: string, err: FiscalError): FiscalError {
  // Checkbox uses our own requestId as the receipt's id, byte for byte
  // (confirmed live: a `sell` response's `id` echoed exactly what we posted,
  // and so did every receipt of the prepayment run of 2026-10-25) — so on a
  // duplicate conflict, that IS the provider's doc id, no need to parse one
  // out of the error body.
  return new FiscalError(err.message, 'duplicate', {
    providerCode: err.providerCode,
    httpStatus: err.httpStatus,
    raw: err.raw,
    existingProviderDocId: requestId,
  });
}

async function sendAndPoll(
  ctx: FiscalCallCtx,
  requestId: string,
  send: (opts: AuthedOpts) => Promise<CheckboxReceipt>,
  /**
   * A second look at a refusal that may be our own document coming back
   * (a chain's `relation_id_not_unique`, `already_paid`): resolves to the
   * error to throw — `duplicate` when it IS ours.
   */
  reclassify?: (err: FiscalError, opts: AuthedOpts) => Promise<FiscalError>
): Promise<FiscalResult> {
  const opts = authedOpts(ctx);
  let created;
  try {
    created = await send(opts);
  } catch (rawError) {
    let err = classifyCheckboxError(rawError);
    if (err.kind !== 'duplicate' && reclassify) err = await reclassify(err, opts);
    if (err.kind === 'duplicate') throw duplicateOf(requestId, err);
    throw err;
  }

  const final = await pollUntil(
    ctx.signal,
    () => getReceipt(opts, created.id),
    (r) => r !== null && (r.status === 'DONE' || r.status === 'ERROR')
  );
  if (!final) {
    throw new FiscalError('Чек зник після створення', 'unknown', {
      providerCode: 'receipt_vanished',
    });
  }
  if (final.status === 'ERROR') {
    // A document DOES exist at Checkbox (it has this id) — this is not
    // `rejected` (that means no document was created) and not `unavailable`
    // (Checkbox answered clearly, this isn't a connectivity problem).
    // `unknown` is retryable; a retry reuses the same requestId, which
    // Checkbox will answer with `duplicate`, recovering into this same
    // ERROR read via fetchDocument. Never reproduced live (no sandbox
    // receipt ever landed in ERROR) — see the plan's open questions.
    throw new FiscalError(
      final.transaction?.response_error_message ?? 'ПРРО відхилило чек після створення',
      'unknown',
      { providerCode: 'receipt_error_status', raw: final }
    );
  }
  return toFiscalResult(final);
}

// ── Prepayment chains (TechDocs/prro/checkbox/api/prepayment.md) ────────────
//
// A «внесок» toward goods taken «під запис» is a «чек передплати»; the
// receipt that closes the line is the chain's «чек післяплати»
// (TechDocs/grocery/G3_DEBTS.md §11 «Крок 2»). Both are ordinary documents
// to everything above this file — `registerSale` with `chain`, the same
// ledger row, retry and `duplicate` — and what differs is what Checkbox is
// asked around them. Every rule below is an answer of the sandbox run of
// 2026-10-25 (`src/__tests__/fixtures/checkbox/runs/20261025-173126Z-prepayment/`).

/** Codes a repeat of a further chain document that DID go through may also get (answer 8). */
const SETTLED_CHAIN_CODES = new Set([
  'prepayment.already_paid',
  'prepayment.already_returned',
  'prepayment.already_processed',
]);

/** Nothing was created — the contract's `rejected`. */
function chainRefusal(message: string, providerCode: string, raw?: unknown): FiscalError {
  return new FiscalError(message, 'rejected', { providerCode, raw });
}

async function readChain(opts: AuthedOpts, relationId: string) {
  try {
    const relation = await getPrepaymentRelation(opts, relationId);
    return relation ? toChainState(relation) : null;
  } catch (error) {
    throw classifyCheckboxError(error);
  }
}

async function registerChainDocument(ctx: FiscalCallCtx, doc: FiscalSaleDoc): Promise<FiscalResult> {
  const chain = doc.chain!;
  // What the chain is still owed before this document (the contract's
  // meaning of `lines`), and what this document pays.
  const owed = doc.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  if (doc.totalCents <= 0 || doc.totalCents > owed) {
    throw chainRefusal(`A chain document pays ${doc.totalCents} of the ${owed} still owed`, 'chain_sum');
  }

  if (chain.op === 'open') {
    // The whole sum at once is a sale, and Checkbox refuses it as one
    // (`prepayment.sum_equals_total_sum`).
    if (doc.totalCents === owed) {
      throw chainRefusal(`A chain opens with less than its goods come to (${owed})`, 'chain_sum');
    }
    const payload = mapPrepaymentPayload(doc);
    return sendAndPoll(
      ctx,
      doc.requestId,
      (opts) => prepaymentReceipt(opts, payload),
      async (err, opts) => {
        // Answer 7: an opening that went through and is sent again comes
        // back as the chain's number being taken, never `already_exists` —
        // the number is checked first. Ours when its first receipt is ours.
        if (err.providerCode !== 'prepayment.relation_id_not_unique') return err;
        const state = await readChain(opts, chain.relationId);
        if (state?.documents[0] === doc.requestId) {
          return new FiscalError(err.message, 'duplicate', { providerCode: err.providerCode, raw: err.raw });
        }
        return chainRefusal(
          `Номер ланцюжка ${chain.relationId} уже зайнятий іншим документом`,
          'chain_id_taken',
          err.raw
        );
      }
    );
  }

  // A further document: look before sending. The one read is what makes a
  // retry safe (our receipt may already be in the chain) and what keeps a
  // receipt meant to close the line from becoming one more prepayment.
  const opts = authedOpts(ctx);
  const state = await readChain(opts, chain.relationId);
  if (!state) throw chainRefusal(`Ланцюжка ${chain.relationId} у Checkbox немає`, 'chain_missing');
  if (state.documents.includes(doc.requestId)) {
    throw new FiscalError('Документ уже є в ланцюжку', 'duplicate', {
      providerCode: 'chain_has_document',
      existingProviderDocId: doc.requestId,
    });
  }
  if (state.status !== 'open') {
    throw chainRefusal(
      state.status === 'paid' ? 'Ланцюжок у Checkbox уже сплачено' : 'Ланцюжок у Checkbox повернуто',
      'chain_closed',
      state.raw
    );
  }
  // Checkbox decides by the sum which document this is (answer 2): below
  // `left_to_pay` a prepayment, at it the after-payment. Ours must agree with
  // its, or the receipt that closes the line in our books would stay one
  // more prepayment in the tax office's.
  if (state.leftCents !== owed) {
    throw chainRefusal(
      `Checkbox чекає за ланцюжком ${state.leftCents}, а за нашими даними винно ${owed}`,
      'chain_left_mismatch',
      state.raw
    );
  }
  const payload = mapChainPaymentPayload(doc);
  return sendAndPoll(
    ctx,
    doc.requestId,
    (o) => prepaymentChainReceipt(o, chain.relationId, payload),
    async (err, o) => {
      // Answer 8: a paid or returned chain refuses with a code and no
      // receipt — which a repeat of our own after-payment would get too.
      // Whether it is ours, the receipt under our id says.
      if (!err.providerCode || !SETTLED_CHAIN_CODES.has(err.providerCode)) return err;
      let receipt: CheckboxReceipt | null;
      try {
        receipt = await getReceipt(o, doc.requestId);
      } catch (error) {
        throw classifyCheckboxError(error);
      }
      if (receipt) return new FiscalError(err.message, 'duplicate', { providerCode: err.providerCode, raw: err.raw });
      return chainRefusal(err.message, err.providerCode, err.raw);
    }
  );
}

/**
 * Return the whole chain (answer 9): one call, one `RETURN` receipt per
 * receipt of the chain, newest first, each naming the one it returns in
 * `related_receipt_id`. A chain an earlier call already returned — its answer
 * lost — is refused `prepayment.already_returned`, and then the chain's
 * `returned_receipts_mapping` (not `returned_receipts`, which stays empty)
 * says which return undid which receipt.
 */
async function returnWholeChain(
  ctx: FiscalCallCtx,
  relationId: string,
  cashierName: string
): Promise<FiscalChainReturn[]> {
  const opts = authedOpts(ctx);
  let pairs: Array<{ related: string; receiptId: string }>;
  try {
    const created = await returnPrepaymentChain(opts, relationId, { cashier_name: cashierName });
    pairs = created.map((receipt) => ({ related: receipt.related_receipt_id ?? '', receiptId: receipt.id }));
  } catch (raw) {
    const err = classifyCheckboxError(raw);
    if (err.providerCode !== 'prepayment.already_returned') throw err;
    const state = await readChain(opts, relationId);
    const mapped = Object.entries(state?.returns ?? {});
    if (mapped.length === 0) throw err;
    pairs = mapped.map(([related, receiptId]) => ({ related, receiptId }));
  }
  if (pairs.length === 0 || pairs.some((pair) => !pair.related)) {
    throw new FiscalError('Checkbox не назвав, які чеки ланцюжка повернуто', 'unknown', {
      providerCode: 'chain_return_unlinked',
    });
  }

  const results: FiscalChainReturn[] = [];
  for (const pair of pairs) {
    const final = await pollUntil(
      ctx.signal,
      () => getReceipt(opts, pair.receiptId),
      (r) => r !== null && (r.status === 'DONE' || r.status === 'ERROR')
    );
    if (!final) {
      throw new FiscalError('Чек повернення зник після створення', 'unknown', { providerCode: 'receipt_vanished' });
    }
    if (final.status === 'ERROR') {
      throw new FiscalError(
        final.transaction?.response_error_message ?? 'ПРРО відхилило чек повернення після створення',
        'unknown',
        { providerCode: 'receipt_error_status', raw: final }
      );
    }
    results.push({ relatedProviderDocId: pair.related, result: toFiscalResult(final) });
  }
  return results;
}

const checkboxChains: FiscalPrepaymentChainOps = {
  async getChain(ctx, relationId) {
    return readChain(authedOpts(ctx), relationId);
  },
  async returnChain(ctx, relationId, opts) {
    try {
      return await returnWholeChain(ctx, relationId, opts.cashierName);
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },
};

/**
 * The offline capability (TechDocs/prro/POS_FISCAL_OFFLINE.md §2, wire facts in
 * TechDocs/prro/checkbox/api/). Every call goes through `classifyCheckboxError` so
 * the orchestrator sees the same kinds as for online documents; the two
 * offline-specific refusals surface as `rejected` with a synthetic
 * `providerCode` (`offline_not_manual`, `offline_code_used`).
 */
const checkboxOffline: FiscalOfflineOps = {
  async registerState(ctx) {
    try {
      const info = await getCashRegisterInfo(authedOpts(ctx));
      return {
        fiscalNumber: info.fiscal_number,
        offline: Boolean(info.offline_mode),
        manualOffline: Boolean(info.stay_offline),
        raw: info,
      };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async goOffline(ctx, at, fiscalCode) {
    try {
      const res = await goOfflineRequest(authedOpts(ctx), {
        go_offline_date: at.toISOString(),
        fiscal_code: fiscalCode,
      });
      return { transactionId: res.id ?? null };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async goOnline(ctx) {
    try {
      await goOnlineRequest(authedOpts(ctx));
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async askOfflineCodes(ctx, count) {
    try {
      const res = await askOfflineCodesRequest(authedOpts(ctx), count);
      const status =
        res.status === 'DONE' || res.status === 'OK'
          ? 'done'
          : res.status === 'TIMEOUT'
            ? 'timeout'
            : 'error';
      return { status, error: res.error ?? (status === 'error' ? res.status : null) };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async getOfflineCodes(ctx, count) {
    try {
      const codes = await getOfflineCodesRequest(authedOpts(ctx), count);
      return codes.map((c) => ({
        fiscalCode: c.fiscal_code,
        serialId: Number(c.serial_id),
        createdAt: c.created_at ? new Date(c.created_at) : null,
      }));
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async offlineCodesCount(ctx) {
    try {
      const res = await getOfflineCodesCountRequest(authedOpts(ctx));
      return {
        available: res.available ?? 0,
        minimal: res.minimal ?? 0,
        used: res.used ?? 0,
        enough: Boolean(res.enough_offline_codes),
      };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async registerSaleOffline(ctx, doc: FiscalSaleDoc, off: OfflineStamp) {
    const payload = mapSellOfflinePayload(doc, off);
    return sendAndPoll(ctx, doc.requestId, (opts) => sellReceiptOffline(opts, payload));
  },

  async registerRefundOffline(ctx, doc: FiscalRefundDoc, off: OfflineStamp) {
    const payload = mapSellOfflinePayload(doc, off);
    return sendAndPoll(ctx, doc.requestId, (opts) => sellReceiptOffline(opts, payload));
  },
};

export const checkboxProvider: FiscalProvider = {
  id: 'checkbox',
  title: 'Checkbox',
  offline: checkboxOffline,
  prepaymentChain: checkboxChains,

  secretKeys: [
    {
      key: 'licenceKey',
      label: 'Ліцензійний ключ',
      required: true,
      kind: 'password',
      hint: 'Кабінет Checkbox → Каси → обраний реєстратор',
    },
    {
      key: 'cashierPin',
      label: 'PIN-код касира',
      required: true,
      kind: 'password',
      hint: '4–6 цифр, як у кабінеті Checkbox',
    },
  ],

  async probe(creds, signal) {
    try {
      return await signAndFetchProbe(creds, signal);
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  /**
   * Three reads, one snapshot: the register (`/cash-registers/info`), its
   * branch and organisation (`/cash-registers/{id}`) and the tax table
   * (`/tax`). Field names follow `openapi-2.106.4.json`; anything the account
   * does not fill comes back null rather than as an empty string, so the
   * receipt layout can skip the line instead of printing a blank.
   */
  async fetchRequisites(ctx) {
    try {
      const opts = authedOpts(ctx);
      const info = await getCashRegisterInfo(opts);
      const [detailed, taxes] = await Promise.all([
        getCashRegisterDetailed(opts, info.id),
        getTaxes(opts),
      ]);
      const org = detailed.branch?.organization ?? null;
      const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      return {
        organization: {
          name: text(org?.title),
          edrpou: text(org?.edrpou),
          tax_number: text(org?.tax_number),
          is_vat: typeof org?.is_vat === 'boolean' ? org.is_vat : null,
        },
        point: {
          name: text(detailed.branch?.name),
          address: text(detailed.branch?.address) ?? text(detailed.address),
        },
        register: {
          fiscal_number: text(info.fiscal_number),
          title: text(info.title),
          address: text(info.address),
        },
        taxes: taxes
          .filter((tax) => typeof tax.symbol === 'string' && tax.symbol.trim())
          .map((tax) => ({
            code: String(tax.code),
            symbol: tax.symbol.trim(),
            label: tax.label ?? '',
            rate: Number(tax.rate) || 0,
            no_vat: Boolean(tax.no_vat),
            is_default: Boolean(tax.is_default),
          })),
      };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async signIn(creds, signal) {
    try {
      const { access_token } = await signInPinCode(
        creds.secrets.licenceKey,
        creds.secrets.cashierPin,
        signal,
        CLIENT_NAME,
        CLIENT_VERSION
      );
      // No `exp` claim on a Checkbox sandbox token (confirmed by decoding
      // one: `{token_type, jti, sub, nbf, iat}`, nothing else) — `null` is
      // the documented "cache until explicitly invalidated" case
      // (`runtime.ts`'s `getCachedSession` already treats it that way).
      return { token: access_token, expiresAt: null, meta: {} };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async signOut(ctx) {
    try {
      await signOutRequest(authedOpts(ctx));
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async getShift(ctx): Promise<FiscalShiftState | null> {
    try {
      const shift = await getCurrentShift(authedOpts(ctx));
      // `FiscalShiftStatus` only knows 'open'|'closed' — CREATED/OPENING/
      // CLOSING (Checkbox's in-between states) collapse to null here.
      // `ensureOpenShift` seeing null just calls `openShift()`, whose own
      // poll settles any such transition properly.
      if (!shift || shift.status !== 'OPENED') return null;
      return {
        providerShiftId: shift.id,
        status: 'open',
        openedAt: shift.opened_at,
        // /cashier/shift doesn't echo auto_close_at back — not fatal:
        // shifts.service.ts's mirrorOpenShift already falls back to
        // openedAt + SHIFT_MAX_AGE_MS when this is null.
        autoCloseAt: null,
      };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async openShift(ctx, _opts): Promise<FiscalShiftState> {
    try {
      const authed = authedOpts(ctx);
      // Checkbox rejects `auto_close_at` outright with 422 validation.custom
      // ("Дата закриття може бути лише в рамках поточного дня!") whenever it
      // falls on a later calendar day — confirmed live, and `openShift`'s
      // caller (shifts.service.ts) always computes it as "now + 23.5h", which
      // crosses midnight for most of the day. Never forward it: our own
      // auto-close cron (SHIFT_MAX_AGE_MS) already enforces the 24h cap
      // independently, exactly the belt-and-braces backstop
      // shifts.service.ts's openShift already documents — a null autoCloseAt
      // here just means Checkbox itself won't also try to close it.
      const created = await openShiftRequest(authed);
      const final = await pollUntil(
        ctx.signal,
        () => getShiftShort(authed, created.id),
        (s) => s.status === 'OPENED' || Boolean(s.initial_transaction?.response_error_message)
      );
      if (final.initial_transaction?.response_error_message) {
        throw new FiscalError(final.initial_transaction.response_error_message, 'unknown', {
          providerCode: 'shift_open_failed',
          raw: final,
        });
      }
      return {
        providerShiftId: final.id,
        status: 'open',
        openedAt: final.opened_at,
        autoCloseAt: null,
      };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async closeShift(ctx): Promise<FiscalShiftClosed> {
    try {
      const authed = authedOpts(ctx);
      const current = await getCurrentShift(authed);
      if (!current) throw new FiscalError('Зміну вже закрито', 'shift_closed');

      await closeShiftRequest(authed);
      const final = await pollUntil(
        ctx.signal,
        () => getShiftShort(authed, current.id),
        (s) => s.status === 'CLOSED' || Boolean(s.closing_transaction?.response_error_message)
      );
      if (final.closing_transaction?.response_error_message) {
        throw new FiscalError(final.closing_transaction.response_error_message, 'unknown', {
          providerCode: 'shift_close_failed',
          raw: final,
        });
      }
      // Confirmed live: by the time /shifts/short reports CLOSED, z_report is
      // already fully populated (fiscal_code included) — the text render is
      // ready immediately after, no further polling needed.
      const zReportText = final.z_report ? await getReportText(authed, final.z_report.id) : null;
      return {
        providerShiftId: final.id,
        status: 'closed',
        openedAt: current.opened_at,
        autoCloseAt: null,
        closedAt: final.closed_at,
        zReport: final.z_report,
        zReportText,
      };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async xReport(ctx): Promise<FiscalReport> {
    try {
      const authed = authedOpts(ctx);
      // Confirmed live, no polling needed: unlike shifts/receipts, an
      // X-report's fiscal_code never populates (it is not transmitted to
      // DPS — only a Z-report is), and /text is ready immediately.
      const report = await createXReport(authed);
      const text = await getReportText(authed, report.id);
      return { text, raw: report };
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async registerSale(ctx, doc: FiscalSaleDoc) {
    if (doc.chain) return registerChainDocument(ctx, doc);
    const payload = mapSellPayload(doc);
    return sendAndPoll(ctx, doc.requestId, (opts) => sellReceipt(opts, payload));
  },

  async registerRefund(ctx, doc: FiscalRefundDoc) {
    const payload = mapSellPayload(doc);
    return sendAndPoll(ctx, doc.requestId, (opts) => sellReceipt(opts, payload));
  },

  async registerService(ctx, doc: FiscalServiceDoc) {
    const payload = mapServicePayload(doc);
    return sendAndPoll(ctx, doc.requestId, (opts) => serviceReceipt(opts, payload));
  },

  async fetchDocument(ctx, providerDocId): Promise<FiscalResult | null> {
    try {
      const receipt = await getReceipt(authedOpts(ctx), providerDocId);
      return receipt ? toFiscalResult(receipt) : null;
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },

  async renderReceipt(
    ctx,
    providerDocId,
    format: FiscalRenderFormat,
    opts?: FiscalRenderOptions
  ) {
    try {
      const rendering = await getReceiptRendering(authedOpts(ctx), providerDocId, format, {
        width: opts?.width,
      });
      return rendering ? { format, contentType: rendering.contentType, body: rendering.body } : null;
    } catch (error) {
      throw classifyCheckboxError(error);
    }
  },
};
