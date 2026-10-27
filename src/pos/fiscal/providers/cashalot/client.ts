// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/client.ts
//
// Raw HTTP transport for Cashalot's WEB API (TechDocs/prro/cashalot/sources/
// webapi-2.1.0.8034.md). One endpoint, every request a POST of JSON with the
// command in `Command`; no session — the credentials ride in every request
// (`KeyGuid` + `KeyPin`, the mode the owner chose for v1). No FiscalError
// classification here: that is the adapter's (CA5), on top of `../../dps/errors.ts`.
// Like `../checkbox/client.ts`, this file mirrors the wire and nothing else.
//
// An error comes in two shapes (support answers 6 and 8,
// TechDocs/prro/cashalot/sources/support-answers.md): JSON `ErrorCode` +
// `ErrorMessage`, possibly on a 200, and the ДПС fiscal server's plain text
// «Код помилки: 13 DuplicatedRequestUid\r\nПовторно надісланий запит…» on a
// 400. `parseError` reads both; only the NAME is kept as the code — the
// numbers do not agree with the ДПС list.
//
// `signal` is always the caller's: one deadline per fiscal phase.

const CASHALOT_CLOUD_URL = 'https://fsapi.cashalot.org.ua/';

/**
 * Where the adapter talks to. The cloud, except that a local run may point
 * it at a stub (`src/__tests__/helpers/fake-cashalot-server.ts`) through
 * `CASHALOT_BASE_URL` — never in production, where a stray variable must not
 * be able to send a store's receipts anywhere but Cashalot.
 */
export const CASHALOT_BASE_URL =
  process.env.NODE_ENV !== 'production' && process.env.CASHALOT_BASE_URL?.trim()
    ? process.env.CASHALOT_BASE_URL.trim()
    : CASHALOT_CLOUD_URL;

export class CashalotApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly errorCode: string | null,
    readonly errorMessage: string | null,
    readonly body: unknown
  ) {
    super(`Cashalot ${httpStatus}${errorCode ? ` ${errorCode}` : ''}${errorMessage ? `: ${errorMessage}` : ''}`);
    this.name = 'CashalotApiError';
  }
}

/** The three values a store's register is reached by — all from the owner's encrypted credentials. */
export interface CashalotCreds {
  keyGuid: string;
  keyPin: string;
  /** ФН ПРРО — the register's fiscal number. */
  numFiscal: string;
}

export interface CashalotCallOpts {
  signal: AbortSignal;
  /** Tests and a self-hosted FS API (CA8) only; production is `CASHALOT_BASE_URL`. */
  baseUrl?: string;
}

/** A numeric-looking fiscal number goes as a number, as the C# `long` and the spec's examples have it. */
function fiscalNumber(value: string): number | string {
  const trimmed = value.trim();
  return /^\d{1,15}$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/** The credential fields of a request. `UID` and the command's own params go beside them. */
export function credentialFields(creds: CashalotCreds): Record<string, unknown> {
  return { KeyGuid: creds.keyGuid, KeyPin: creds.keyPin, NumFiscal: fiscalNumber(creds.numFiscal) };
}

/** Compared without case: a request assembled from `CashalotCreds` (`keyGuid`) must not slip through. */
const SECRET_FIELDS = new Set(['keyguid', 'keypin', 'password', 'privatekey', 'certificate']);

/**
 * A copy with every credential replaced by `****` — what a saved request may
 * contain. Cashalot's developers diagnose errors from the request and the
 * response together (answer 6), so we keep both, never the secrets.
 */
export function maskCredentials<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => maskCredentials(v)) as unknown as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      SECRET_FIELDS.has(key.toLowerCase()) && inner !== null && inner !== undefined
        ? '****'
        : maskCredentials(inner);
  }
  return out as T;
}

const DPS_TEXT_ERROR = /Код помилки:\s*(\d+)?\s*([A-Za-z][A-Za-z0-9_]*)?\s*[\r\n]*([\s\S]*)/;

/** The error in a response body — JSON or the ДПС text form — or nothing when there is none. */
export function parseError(
  json: unknown,
  text: string | null
): { errorCode: string | null; errorMessage: string | null } {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const body = json as Record<string, unknown>;
    const code = body.ErrorCode;
    const message = body.ErrorMessage;
    const codeText = code === undefined || code === null ? '' : String(code).trim();
    if (codeText && codeText !== 'Ok' && codeText !== '0') {
      return {
        errorCode: codeText,
        errorMessage: typeof message === 'string' && message.trim() ? message.trim() : null,
      };
    }
    return { errorCode: null, errorMessage: null };
  }
  const match = text ? DPS_TEXT_ERROR.exec(text) : null;
  if (match) {
    return {
      errorCode: match[2] ?? (match[1] ? match[1] : null),
      errorMessage: match[3]?.trim() || null,
    };
  }
  return { errorCode: null, errorMessage: text?.trim() || null };
}

/**
 * Send one command. A non-2xx answer, or a 2xx carrying an `ErrorCode`, is a
 * `CashalotApiError`; a network failure or an abort is the platform's own
 * error, which the adapter reads as `unavailable`.
 */
export async function command<T>(
  name: string,
  params: Record<string, unknown>,
  opts: CashalotCallOpts
): Promise<T> {
  const res = await fetch(opts.baseUrl ?? CASHALOT_BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ Command: name, ...params }),
    signal: opts.signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const { errorCode, errorMessage } = parseError(json, text);
  if (!res.ok || errorCode) {
    throw new CashalotApiError(res.status, errorCode, errorMessage, json ?? text);
  }
  return json as T;
}

// ── Response shapes — narrowed to what the probes and the adapter read ──────

export interface CashalotServerState {
  Available: boolean;
  Version?: string;
}

export interface CashalotTaxObject {
  Name?: string | null;
  Address?: string | null;
  Tin?: string | null;
  Ipn?: string | null;
  OrgName?: string | null;
  SingleTax?: boolean | null;
}

export interface CashalotRegistrarState {
  /** 0 — no shift, 1 — open. */
  ShiftState: number;
  ShiftId?: number | null;
  OpenShiftFiscalNum?: string | null;
  ZRepPresent?: boolean;
  Testing?: boolean;
  Name?: string | null;
  FirstLocalNum?: number | null;
  NextLocalNum?: number | null;
  LastFiscalNum?: string | null;
  OfflineSupported?: boolean;
  OfflineSessionId?: number | string | null;
  OfflineSessionDuration?: number | null;
  OfflineSessionsMonthlyDuration?: number | null;
  OfflineDocumentsPresent?: boolean;
  OfflineDocumentsAutoRegState?: unknown;
  Closed?: boolean;
  LicenseExpiration?: string | null;
  TaxObject?: CashalotTaxObject | null;
}

/** `OpenShift`, `CloseShift`, `RegisterCheck`, `RegisterZRep` — a registered document. */
export interface CashalotDocument {
  NumFiscal: string | number;
  NumLocal?: number | null;
  OrderDateTime?: string | null;
  Offline?: boolean;
  QrCode?: string | null;
  Url?: string | null;
  /** Base64 of UTF-8 text, HTML, PDF or PNG. */
  Visualization?: string | null;
}

export interface CashalotCloseShift extends CashalotDocument {
  ZRepAutoInfo?: unknown;
}

export interface CashalotGetCheck {
  /** Base64: XML or the visualization, per `Type`. */
  Data?: string | null;
  QrCode?: string | null;
  Url?: string | null;
  ResultCode?: number | string | null;
  ResultText?: string | null;
}

export interface CashalotDocumentInfo {
  NumFiscal?: string | number | null;
  DocClass?: string | null;
  CheckDocType?: string | null;
  CheckDocSubType?: string | null;
  Revoked?: boolean;
  Storned?: boolean;
}

export interface CashalotShiftTotals {
  Totals?: unknown;
  ShiftOpened?: string | null;
  CashInHandPrevShift?: number | null;
  CashInHand?: number | null;
  Visualization?: string | null;
}

export interface CashalotShifts {
  Shifts?: Array<{
    ShiftId?: number;
    OpenShiftFiscalNum?: string | null;
    CloseShiftFiscalNum?: string | null;
    Testing?: boolean;
    Opened?: string | null;
    Closed?: string | null;
    ZRepFiscalNum?: string | null;
  }>;
}

// ── Commands ─────────────────────────────────────────────────────────────────

/** Whether the tax office's server is reachable — no credentials. */
export function serverState(opts: CashalotCallOpts): Promise<CashalotServerState> {
  return command('ServerState', {}, opts);
}

export function registrarState(
  creds: CashalotCreds,
  opts: CashalotCallOpts & { includeTaxObject?: boolean; uid?: string }
): Promise<CashalotRegistrarState> {
  return command(
    'TransactionsRegistrarState',
    {
      ...(opts.uid ? { UID: opts.uid } : {}),
      ...credentialFields(creds),
      ...(opts.includeTaxObject ? { IncludeTaxObject: true } : {}),
    },
    opts
  );
}

/** `TESTING` at the root opens a test shift (support answer 2). */
export function openShift(
  creds: CashalotCreds,
  opts: CashalotCallOpts & { testing?: boolean; uid?: string }
): Promise<CashalotDocument> {
  return command(
    'OpenShift',
    {
      ...(opts.uid ? { UID: opts.uid } : {}),
      ...credentialFields(creds),
      ...(opts.testing ? { TESTING: true } : {}),
    },
    opts
  );
}

export function closeShift(
  creds: CashalotCreds,
  opts: CashalotCallOpts & { zRepAuto?: boolean; visualization?: boolean; uid?: string }
): Promise<CashalotCloseShift> {
  return command(
    'CloseShift',
    {
      ...(opts.uid ? { UID: opts.uid } : {}),
      ...credentialFields(creds),
      ZRepAuto: opts.zRepAuto ?? true,
      ...(opts.visualization ? { Visualization: true } : {}),
    },
    opts
  );
}

/** `UID` in the root is what Cashalot refuses a repeat by (support answer 8). */
export function registerCheck(
  creds: CashalotCreds,
  check: unknown,
  opts: CashalotCallOpts & { uid: string; getQrCode?: boolean; visualization?: boolean }
): Promise<CashalotDocument> {
  return command(
    'RegisterCheck',
    {
      UID: opts.uid,
      ...credentialFields(creds),
      Check: check,
      ...(opts.getQrCode ? { GetQrCode: true } : {}),
      ...(opts.visualization ? { Visualization: true } : {}),
    },
    opts
  );
}

/** No credentials needed — the register's and the document's fiscal numbers (support answer 3). */
export function getCheck(
  registrarNumFiscal: string,
  numFiscal: string,
  type: 'Availability' | 'OriginalXml' | 'SignedByServerXml' | 'Visualization',
  opts: CashalotCallOpts & { getQrCode?: boolean }
): Promise<CashalotGetCheck> {
  return command(
    'GetCheck',
    {
      RegistrarNumFiscal: fiscalNumber(registrarNumFiscal),
      NumFiscal: numFiscal,
      Type: type,
      ...(opts.getQrCode ? { GetQrCode: true } : {}),
    },
    opts
  );
}

export function documentInfoByLocalNum(
  creds: CashalotCreds,
  numLocal: number,
  opts: CashalotCallOpts
): Promise<CashalotDocumentInfo> {
  return command('DocumentInfoByLocalNum', { ...credentialFields(creds), NumLocal: numLocal }, opts);
}

export function lastShiftTotals(
  creds: CashalotCreds,
  opts: CashalotCallOpts & { visualization?: boolean }
): Promise<CashalotShiftTotals> {
  return command(
    'LastShiftTotals',
    { ...credentialFields(creds), ...(opts.visualization ? { Visualization: true } : {}) },
    opts
  );
}

export function shifts(
  creds: CashalotCreds,
  from: Date,
  to: Date,
  opts: CashalotCallOpts
): Promise<CashalotShifts> {
  return command('Shifts', { ...credentialFields(creds), From: from.toISOString(), To: to.toISOString() }, opts);
}

/** Base64 → UTF-8 text, for `Visualization` and `GetCheck.Data`. */
export function decodeBase64Text(value: string | null | undefined): string | null {
  return value ? Buffer.from(value, 'base64').toString('utf-8') : null;
}
