// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/index.ts
//
// The Cashalot adapter (phase CA5; decisions in
// TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md §4.2, the developers' answers
// in sources/support-answers.md). What sets it apart from Checkbox:
// - no session: `KeyGuid` + `KeyPin` + the register's fiscal number ride in
//   every request, so `signIn` only checks them — which also makes a wrong
//   PIN a refusal before the sale is written, not a sale parked half-way;
// - the check is the ДПС document itself, built by `../../dps/` with the
//   store's own tax table (`config.taxes`) — Cashalot lists no rates;
// - a repeated `UID` is refused, and the adapter finds the existing number
//   itself (`lookup.ts`) for `resolveDuplicate`;
// - offline is Cashalot's own (`Offline: true` → `provider_offline`); there is
//   no `offline` capability and no `renderReceipt` (the visualization's width
//   is in pixels, not characters).

import { FiscalError } from '../../errors.js';
import {
  buildRefundCheck,
  buildSaleCheck,
  buildServiceCheck,
  DpsTaxTableError,
  letterCode,
  type DpsBuiltCheck,
  type DpsCheckOptions,
} from '../../dps/index.js';
import type {
  FiscalCallCtx,
  FiscalCredentials,
  FiscalProbe,
  FiscalProvider,
  FiscalRequisites,
  FiscalResult,
  FiscalShiftClosed,
  FiscalShiftState,
} from '../../types.js';
import {
  closeShift as closeShiftRequest,
  decodeBase64Text,
  getCheck,
  lastShiftTotals,
  openShift as openShiftRequest,
  registerCheck,
  registrarState,
  type CashalotCreds,
  type CashalotRegistrarState,
} from './client.js';
import { normalizeCashalotConfig, readConfig, type CashalotConfig } from './config.js';
import { parseCashalotDate } from './dates.js';
import { classifyCashalotError, isCashalotError } from './errors.js';
import { findDocumentByUid } from './lookup.js';
import { fromOriginalXml, toFiscalResult } from './payload.js';

const HINT = 'Кабінет Cashalot → Налаштування → Інтеграція з WEB API → Управління касирами';

/** The three credentials, or a refusal before any request leaves. */
function credsOf(creds: FiscalCredentials): CashalotCreds {
  const keyGuid = creds.secrets.keyGuid?.trim();
  const keyPin = creds.secrets.keyPin?.trim();
  const numFiscal = creds.secrets.numFiscal?.trim();
  if (!keyGuid || !keyPin || !numFiscal) {
    throw new FiscalError(
      'Для Cashalot потрібні ідентифікатор ключа, PIN касира і фіскальний номер ПРРО',
      'auth_rejected',
      { providerCode: 'missing_credentials' }
    );
  }
  return { keyGuid, keyPin, numFiscal };
}

/** The store's tax table and test mode; a config that no longer validates refuses the document. */
function configOf(creds: FiscalCredentials): CashalotConfig {
  try {
    return readConfig(creds.config);
  } catch (error) {
    if (error instanceof DpsTaxTableError) {
      throw new FiscalError(error.message, 'rejected', { providerCode: 'tax_table_invalid' });
    }
    throw error;
  }
}

/** Every method's own errors pass through; Cashalot's and the network's are classified. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw classifyCashalotError(error);
  }
}

function openShiftState(
  state: CashalotRegistrarState,
  config: CashalotConfig,
  openedAt: string | null = null
): FiscalShiftState | null {
  if (state.ShiftState !== 1) return null;
  if (typeof state.Testing === 'boolean' && state.Testing !== config.testing) {
    // A shift is all test or all fiscal documents; every check would come back
    // `DocumentValidationError` (support answer 6). It can only have been opened
    // elsewhere — `normalizeConfig` refuses to switch the mode with a shift open.
    throw new FiscalError(
      `Відкрита зміна ${state.Testing ? 'тестова' : 'фіскальна'}, а каса налаштована як ${
        config.testing ? 'тестова' : 'фіскальна'
      } — закрийте зміну в кабінеті Cashalot`,
      'rejected',
      { providerCode: 'shift_mode_mismatch' }
    );
  }
  return {
    providerShiftId: String(state.ShiftId ?? state.OpenShiftFiscalNum ?? ''),
    status: 'open',
    openedAt,
    autoCloseAt: null,
    raw: state,
  };
}

/**
 * Register one check. A repeated `UID` means Cashalot already holds the
 * document: find its number so `resolveDuplicate` can read it, and say
 * `duplicate` either way — never re-send.
 */
async function register(
  ctx: FiscalCallCtx,
  requestId: string,
  build: (opts: DpsCheckOptions) => DpsBuiltCheck,
  totalCents: number
): Promise<FiscalResult> {
  const creds = credsOf(ctx.creds);
  const config = configOf(ctx.creds);
  const { check, vatCents } = build({ taxes: config.taxes, testing: config.testing, uid: requestId });
  try {
    const doc = await registerCheck(creds, check, { uid: requestId, signal: ctx.signal });
    return toFiscalResult(doc, {
      totalCents,
      vatCents: config.taxes.length > 0 ? vatCents : null,
      registerFiscalNumber: creds.numFiscal,
    });
  } catch (rawError) {
    const error = classifyCashalotError(rawError);
    if (error.kind !== 'duplicate') throw error;
    const existing = await findDocumentByUid(creds, requestId, { signal: ctx.signal });
    throw new FiscalError(error.message, 'duplicate', {
      providerCode: error.providerCode,
      httpStatus: error.httpStatus,
      raw: error.raw,
      ...(existing ? { existingProviderDocId: existing } : {}),
    });
  }
}

export const cashalotProvider: FiscalProvider = {
  id: 'cashalot',
  title: 'Cashalot',

  secretKeys: [
    { key: 'keyGuid', label: 'Ідентифікатор ключа (KeyGuid)', required: true, kind: 'password', hint: HINT },
    { key: 'keyPin', label: 'PIN касира', required: true, kind: 'password', hint: HINT },
    {
      key: 'numFiscal',
      label: 'Фіскальний номер ПРРО',
      required: true,
      kind: 'text',
      hint: 'Кабінет Cashalot → Каси → обраний ПРРО',
    },
  ],

  async probe(creds, signal): Promise<FiscalProbe> {
    const c = credsOf(creds);
    return guarded(async () => {
      const state = await registrarState(c, { includeTaxObject: true, signal });
      return {
        ok: true,
        cashierName: state.ShiftState === 1 ? (state.Name ?? null) : null,
        cashRegister: `ПРРО ${c.numFiscal}`,
        shiftOpen: state.ShiftState === 1,
        message: state.LicenseExpiration ? `Ліцензія до ${state.LicenseExpiration}` : null,
      };
    });
  },

  async fetchRequisites(ctx): Promise<FiscalRequisites> {
    const c = credsOf(ctx.creds);
    const config = configOf(ctx.creds);
    return guarded(async () => {
      const state = await registrarState(c, { includeTaxObject: true, signal: ctx.signal });
      const tax = state.TaxObject ?? null;
      const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
      const ipn = text(tax?.Ipn);
      return {
        organization: {
          name: text(tax?.OrgName),
          edrpou: text(tax?.Tin),
          tax_number: ipn ?? text(tax?.Tin),
          is_vat: tax ? Boolean(ipn) : null,
        },
        point: { name: text(tax?.Name), address: text(tax?.Address) },
        register: { fiscal_number: c.numFiscal, title: null, address: null },
        taxes: config.taxes.map((rate, index) => ({
          code: letterCode(rate.letter) ?? rate.letter,
          symbol: rate.letter,
          label: `${rate.name} ${rate.rate} %`,
          rate: rate.rate,
          no_vat: rate.rate === 0,
          is_default: index === 0,
        })),
      };
    });
  },

  async signIn(creds, signal) {
    const c = credsOf(creds);
    // No session exists — the credentials go with every request. Reading the
    // register's state checks them now, and is the first call the spec
    // requires for a register anyway.
    await guarded(() => registrarState(c, { signal }));
    return { token: '', expiresAt: null, meta: { numFiscal: c.numFiscal } };
  },

  async signOut() {
    // Nothing to end.
  },

  async getShift(ctx) {
    const c = credsOf(ctx.creds);
    const config = configOf(ctx.creds);
    const state = await guarded(() => registrarState(c, { signal: ctx.signal }));
    return openShiftState(state, config);
  },

  async openShift(ctx) {
    const c = credsOf(ctx.creds);
    const config = configOf(ctx.creds);
    let openedAt: string | null = null;
    try {
      const doc = await openShiftRequest(c, { testing: config.testing, signal: ctx.signal });
      openedAt = parseCashalotDate(doc.OrderDateTime);
    } catch (error) {
      // Already open is an open shift — read it rather than fail the sale.
      if (!isCashalotError(error, 'ShiftAlreadyOpened')) throw classifyCashalotError(error);
    }
    const state = await guarded(() => registrarState(c, { signal: ctx.signal }));
    const shift = openShiftState(state, config, openedAt);
    if (!shift) {
      throw new FiscalError('Cashalot не відкрив зміну', 'unknown', { providerCode: 'shift_open_failed', raw: state });
    }
    return shift;
  },

  async closeShift(ctx): Promise<FiscalShiftClosed> {
    const c = credsOf(ctx.creds);
    const before = await guarded(() => registrarState(c, { signal: ctx.signal }));
    if (before.ShiftState !== 1) throw new FiscalError('Зміну вже закрито', 'shift_closed');
    const shiftId = String(before.ShiftId ?? before.OpenShiftFiscalNum ?? '');

    let doc;
    try {
      doc = await closeShiftRequest(c, { zRepAuto: true, visualization: true, signal: ctx.signal });
    } catch (error) {
      if (!isCashalotError(error, 'ShiftNotOpened') && !isCashalotError(error, 'ZRepAlreadyRegistered')) {
        throw classifyCashalotError(error);
      }
      // «Already closed» or «the Z-report is in» — read the shift again: gone is
      // `shift_closed` (the mirror then closes), still open means close it once
      // more without another Z-report.
      const now = await guarded(() => registrarState(c, { signal: ctx.signal }));
      if (now.ShiftState !== 1) throw new FiscalError('Зміну вже закрито', 'shift_closed');
      doc = await guarded(() => closeShiftRequest(c, { zRepAuto: false, visualization: true, signal: ctx.signal }));
    }
    const { Visualization, ...rest } = doc;
    return {
      providerShiftId: shiftId,
      status: 'closed',
      openedAt: null,
      autoCloseAt: null,
      closedAt: parseCashalotDate(doc.OrderDateTime),
      zReport: doc.ZRepAutoInfo ?? rest,
      zReportText: decodeBase64Text(Visualization),
      raw: rest,
    };
  },

  async xReport(ctx) {
    const c = credsOf(ctx.creds);
    const totals = await guarded(() => lastShiftTotals(c, { visualization: true, signal: ctx.signal }));
    const { Visualization, ...rest } = totals;
    return { text: decodeBase64Text(Visualization), raw: rest };
  },

  async registerSale(ctx, doc) {
    const due = doc.totalCents + (doc.cashRounding?.amountCents ?? 0);
    return register(ctx, doc.requestId, (opts) => buildSaleCheck(doc, opts), due);
  },

  async registerRefund(ctx, doc) {
    const due = doc.totalCents + (doc.cashRounding?.amountCents ?? 0);
    return register(ctx, doc.requestId, (opts) => buildRefundCheck(doc, opts), due);
  },

  async registerService(ctx, doc) {
    return register(ctx, doc.requestId, (opts) => buildServiceCheck(doc, opts), doc.amountCents);
  },

  async fetchDocument(ctx, providerDocId) {
    const c = credsOf(ctx.creds);
    try {
      const answer = await getCheck(c.numFiscal, providerDocId, 'OriginalXml', { signal: ctx.signal });
      const code = String(answer.ResultCode ?? '0');
      if (code === '1' || code === 'OnlineDocumentAbsent' || code === '3' || code === 'OfflineNumberNotReserved') {
        return null;
      }
      const xml = decodeBase64Text(answer.Data);
      if (!xml) return null;
      return fromOriginalXml(xml, {
        fiscalCode: providerDocId,
        registerFiscalNumber: c.numFiscal,
        url: answer.Url,
        offline: code === '2' || code === 'OfflineNumberReserved',
      });
    } catch (error) {
      if (isCashalotError(error, 'NoContent')) return null;
      throw classifyCashalotError(error);
    }
  },

  normalizeConfig(next, ctx) {
    return normalizeCashalotConfig(next, ctx);
  },
};
