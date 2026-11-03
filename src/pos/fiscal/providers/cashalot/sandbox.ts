// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/sandbox.ts
//
// The CA3 probes of TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md §4.5, run by
// hand against a REAL register in TEST mode — Cashalot has no sandbox, so a
// test document on the owner's own ПРРО is the sandbox (support answer 1).
// Not a test: it talks to https://fsapi.cashalot.org.ua/.
//
//   npm run fiscal:sandbox:cashalot                read only: probes 1 and 7
//   npm run fiscal:sandbox:cashalot -- --shift     + probe 2: open a TEST shift
//   npm run fiscal:sandbox:cashalot -- --sell      + probes 3, 4, 5, 8 (needs an open test shift)
//   npm run fiscal:sandbox:cashalot -- --return    + probe 6: return, service in/out, X, Z, close twice
//   npm run fiscal:sandbox:cashalot -- --all       everything, in that order
//
// Credentials from `.env` (never the repository): CASHALOT_SANDBOX_KEY_GUID,
// CASHALOT_SANDBOX_KEY_PIN, CASHALOT_SANDBOX_NUM_FISCAL — «Налаштування →
// Інтеграція з WEB API → Управління касирами» in the cabinet.
//
// Three rules it keeps, because the register is real:
// - every document and the shift go with TESTING — a test shift takes nothing
//   else and a fiscal one refuses it (support answer 6);
// - it refuses to write anything while a FISCAL shift is open (exit 3);
// - it saves the request next to every response, credentials masked —
//   Cashalot's developers diagnose an error from the two together (answer 6).
//
// Every run keeps its own folder: src/__tests__/fixtures/cashalot/runs/<run>/
// with one file per step, `console.log` and `run.json`. Probe 9 (a call from
// the production network) is a one-liner in the fixtures README, not here.

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRefundCheck, buildSaleCheck, buildServiceCheck, type DpsTaxRate } from '../../dps/index.js';
import type { FiscalDocLine, FiscalRefundDoc, FiscalSaleDoc } from '../../types.js';
import {
  CashalotApiError,
  closeShift,
  credentialFields,
  decodeBase64Text,
  documentInfoByLocalNum,
  getCheck,
  lastShiftTotals,
  maskCredentials,
  openShift,
  registerCheck,
  registrarState,
  serverState,
  shifts,
  type CashalotCreds,
  type CashalotDocument,
} from './client.js';

/* eslint-disable no-console */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', '__tests__', 'fixtures', 'cashalot');
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const RUN_DIR = path.join(FIXTURES_DIR, 'runs', RUN_ID);
const STARTED_AT = new Date().toISOString();
const STEP_TIMEOUT_MS = 20_000;

/** The probes' tax table — what an owner would copy from the cabinet; change it here if the register's differs. */
const TAXES: DpsTaxRate[] = [
  { letter: 'А', name: 'ПДВ', type: 0, rate: 20 },
  { letter: 'Б', name: 'ПДВ', type: 0, rate: 7 },
];

const transcript: string[] = [];
for (const level of ['log', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...parts: unknown[]): void => {
    transcript.push(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '));
    original(...parts);
  };
}

const findings: string[] = [];
function finding(line: string): void {
  findings.push(line);
  console.log(`  ★ ${line}`);
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const all = args.has('--all');
const doShift = all || args.has('--shift');
const doSell = all || args.has('--sell');
const doReturn = all || args.has('--return');

let savedAny = false;
let stepNo = 0;

function save(name: string, body: unknown): void {
  savedAny = true;
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const file = path.join(RUN_DIR, `${String(++stepNo).padStart(2, '0')}_${name}.json`);
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
}

let flushed = false;
function flushRun(): void {
  if (flushed) return;
  flushed = true;
  if (!savedAny && findings.length === 0) return;
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, 'console.log'), transcript.join('\n') + '\n');
  fs.writeFileSync(
    path.join(RUN_DIR, 'run.json'),
    JSON.stringify(
      {
        run_id: RUN_ID,
        started_at: STARTED_AT,
        finished_at: new Date().toISOString(),
        argv,
        exit_code: process.exitCode ?? 0,
        findings,
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(`\nRun kept in ${path.relative(process.cwd(), RUN_DIR)}\n`);
}
process.on('exit', flushRun);

/**
 * `CASHALOT_SANDBOX_BASE_URL` points the probes elsewhere — a local stub to
 * check the script itself, or a self-hosted FS API (CA8). Unset: Cashalot's own.
 */
const BASE_URL = process.env.CASHALOT_SANDBOX_BASE_URL?.trim() || undefined;
const call = () => ({ signal: AbortSignal.timeout(STEP_TIMEOUT_MS), ...(BASE_URL ? { baseUrl: BASE_URL } : {}) });

/** Run one call, print and keep its request (masked) and its answer — or its error. */
async function step<T>(name: string, request: unknown, fn: () => Promise<T>): Promise<T> {
  console.log(`\n== ${name}`);
  const started = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - started;
    console.log(`  ok in ${ms} ms`, JSON.stringify(result, null, 2).slice(0, 1500));
    save(name, { request: maskCredentials(request), response: result, ms });
    return result;
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof CashalotApiError) {
      console.error(`  ✗ HTTP ${error.httpStatus} ${error.errorCode ?? ''} ${error.errorMessage ?? ''} (${ms} ms)`);
      save(`${name}_error`, {
        request: maskCredentials(request),
        error: { httpStatus: error.httpStatus, errorCode: error.errorCode, errorMessage: error.errorMessage, body: error.body },
        ms,
      });
    } else {
      console.error(`  ✗ ${error instanceof Error ? error.message : String(error)} (${ms} ms)`);
      save(`${name}_failure`, { request: maskCredentials(request), failure: String(error), ms });
    }
    throw error;
  }
}

/** Like `step`, but the error is the answer — hand it back. */
async function trystep<T>(name: string, request: unknown, fn: () => Promise<T>): Promise<T | CashalotApiError> {
  try {
    return await step(name, request, fn);
  } catch (error) {
    if (error instanceof CashalotApiError) return error;
    throw error;
  }
}

function describeError(result: unknown): string {
  return result instanceof CashalotApiError
    ? `HTTP ${result.httpStatus}, ErrorCode «${result.errorCode ?? '—'}», «${result.errorMessage ?? ''}»`
    : 'no error';
}

function line(overrides: Partial<FiscalDocLine>): FiscalDocLine {
  return {
    name: 'Тестовий товар',
    quantityMilli: 1000,
    unitPriceCents: 100,
    lineTotalCents: 100,
    discountCents: 0,
    taxCode: 'A',
    barcode: null,
    uktzed: null,
    sourceLineRef: '1',
    unit: 'шт',
    ...overrides,
  };
}

function saleDoc(lines: FiscalDocLine[], payments: FiscalSaleDoc['payments']): FiscalSaleDoc {
  const total = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  return {
    kind: 'sale',
    requestId: crypto.randomUUID(),
    ourNumber: `SANDBOX-${RUN_ID}`,
    cashierName: 'Тест Cashalot',
    lines,
    payments,
    totalCents: total,
    discountCents: 0,
  };
}

/** Sell one check: built by `dps/` (so the probe checks it too), TESTING, the UID in the root and a copy in CHECKHEAD. */
async function sell(
  creds: CashalotCreds,
  name: string,
  doc: FiscalSaleDoc,
  patch?: (check: Record<string, unknown>) => void
): Promise<{ uid: string; result: CashalotDocument | CashalotApiError }> {
  const uid = doc.requestId;
  const { check } = buildSaleCheck(doc, { taxes: TAXES, testing: true, uid });
  if (patch) patch(check as unknown as Record<string, unknown>);
  const request = { Command: 'RegisterCheck', UID: uid, ...credentialFields(creds), Check: check, GetQrCode: true };
  const result = await trystep(name, request, () =>
    registerCheck(creds, check, { uid, getQrCode: true, ...call() })
  );
  return { uid, result };
}

async function main(): Promise<void> {
  const keyGuid = process.env.CASHALOT_SANDBOX_KEY_GUID?.trim();
  const keyPin = process.env.CASHALOT_SANDBOX_KEY_PIN?.trim();
  const numFiscal = process.env.CASHALOT_SANDBOX_NUM_FISCAL?.trim();
  if (!keyGuid || !keyPin || !numFiscal) {
    console.error('Set CASHALOT_SANDBOX_KEY_GUID, CASHALOT_SANDBOX_KEY_PIN and CASHALOT_SANDBOX_NUM_FISCAL in .env');
    process.exit(2);
  }
  const creds: CashalotCreds = { keyGuid, keyPin, numFiscal };
  // The request as it goes on the wire, for the saved record — `save` masks it.
  const wire = credentialFields(creds);

  // ── Probe 1: the server and the register ──────────────────────────────────
  await step('server_state', { Command: 'ServerState' }, () => serverState(call()));
  const state = await step(
    'registrar_state',
    { Command: 'TransactionsRegistrarState', ...wire, IncludeTaxObject: true },
    () => registrarState(creds, { includeTaxObject: true, ...call() })
  );
  finding(
    `ANSWER 1: shift ${state.ShiftState === 1 ? 'open' : 'closed'}${state.ShiftState === 1 ? `, Testing ${state.Testing}` : ''}; ` +
      `OfflineSupported ${state.OfflineSupported}; licence until ${state.LicenseExpiration ?? '—'}; ` +
      `TaxObject ${state.TaxObject ? Object.keys(state.TaxObject).join(', ') : 'absent'}`
  );

  // ── Probe 7: availability by number, without credentials ──────────────────
  const fake = '999999999';
  const absent = await trystep('get_check_availability_unknown', { Command: 'GetCheck', RegistrarNumFiscal: numFiscal, NumFiscal: fake, Type: 'Availability' }, () =>
    getCheck(numFiscal, fake, 'Availability', call())
  );
  finding(`ANSWER 7a: GetCheck Availability of an unknown number → ${absent instanceof CashalotApiError ? describeError(absent) : `ResultCode ${absent.ResultCode} «${absent.ResultText ?? ''}»`}`);

  const wantsWrites = doShift || doSell || doReturn;
  if (!wantsWrites) return;

  if (state.ShiftState === 1 && state.Testing === false) {
    console.error('\nA FISCAL shift is open on this register — the probes write test documents only. Close it in the cabinet first.');
    process.exit(3);
  }

  // ── Probe 2: a test shift ─────────────────────────────────────────────────
  if (doShift) {
    if (state.ShiftState === 1) {
      finding('ANSWER 2: a test shift was already open — OpenShift skipped');
    } else {
      await step('open_shift_testing', { Command: 'OpenShift', ...wire, TESTING: true }, () =>
        openShift(creds, { testing: true, ...call() })
      );
    }
    const after = await step('registrar_state_after_open', { Command: 'TransactionsRegistrarState', ...wire }, () =>
      registrarState(creds, call())
    );
    const since = new Date(Date.now() - 24 * 3600_000);
    const list = await step('shifts_last_day', { Command: 'Shifts', ...wire }, () =>
      shifts(creds, since, new Date(), call())
    );
    finding(
      `ANSWER 2: after OpenShift{TESTING} the state says Testing ${after.Testing}; ` +
        `Shifts lists ${list.Shifts?.length ?? 0}, last Testing ${list.Shifts?.at(-1)?.Testing}`
    );
  }

  let first: { uid: string; result: CashalotDocument | CashalotApiError } | null = null;

  if (doSell) {
    const now = await registrarState(creds, call());
    if (now.ShiftState !== 1 || now.Testing !== true) {
      console.error('\n--sell needs an open TEST shift — run with --shift first.');
      process.exit(3);
    }

    // ── Probe 3: our CHECKTAX, a discount, card and QR, units ───────────────
    first = await sell(
      creds,
      'sell_vat_two_rates_discount_card',
      saleDoc(
        [
          line({ name: 'Тест ПДВ 20', unitPriceCents: 10000, lineTotalCents: 10000, taxCode: 'A' }),
          line({ name: 'Тест ПДВ 7 знижка', unitPriceCents: 20000, lineTotalCents: 16000, taxCode: 'B', sourceLineRef: '2' }),
        ],
        [{ method: 'card', amountCents: 26000 }]
      )
    );
    finding(`ANSWER 3a (two rates + discount, card): ${first.result instanceof CashalotApiError ? describeError(first.result) : `NumFiscal ${first.result.NumFiscal}, Offline ${first.result.Offline}, Url ${first.result.Url ? 'yes' : 'no'}`}`);

    const tie = await sell(
      creds,
      'sell_vat_tie_1257_qr',
      saleDoc([line({ name: 'Тест нічия 12,57', unitPriceCents: 1257, lineTotalCents: 1257 })], [{ method: 'qr', amountCents: 1257 }])
    );
    finding(`ANSWER 3b (VAT tie 12.57 × 20 % = 2.09, QR 306): ${tie.result instanceof CashalotApiError ? describeError(tie.result) : `accepted, NumFiscal ${tie.result.NumFiscal}`}`);

    const units = saleDoc(
      [
        line({ name: 'Тест грами', unit: 'г', quantityMilli: 250_000, unitPriceCents: 45, lineTotalCents: 11250 }),
        line({ name: 'Тест мілілітри', unit: 'мл', quantityMilli: 200_000, unitPriceCents: 10, lineTotalCents: 2000, sourceLineRef: '2' }),
      ],
      [{ method: 'cash', amountCents: 20000 }]
    );
    const unitsNumber = await sell(creds, 'sell_units_number_codes_cash_change', units);
    const unitsText = await sell(creds, 'sell_units_text_codes', { ...units, requestId: crypto.randomUUID() }, (check) => {
      for (const row of (check.CHECKBODY as Array<Record<string, unknown>>) ?? []) {
        if (typeof row.UNITCD === 'number') row.UNITCD = String(row.UNITCD).padStart(4, '0');
      }
    });
    finding(`ANSWER 3c (UNITCD as a number): ${describeError(unitsNumber.result)}; (as a zero-padded string): ${describeError(unitsText.result)}`);

    // ── Probe 4: the same UID again, and finding the document by it ─────────
    if (!(first.result instanceof CashalotApiError)) {
      const again = await trystep('sell_repeat_same_uid', { Command: 'RegisterCheck', UID: first.uid, ...wire }, async () => {
        const doc = saleDoc(
          [
            line({ name: 'Тест ПДВ 20', unitPriceCents: 10000, lineTotalCents: 10000, taxCode: 'A' }),
            line({ name: 'Тест ПДВ 7 знижка', unitPriceCents: 20000, lineTotalCents: 16000, taxCode: 'B', sourceLineRef: '2' }),
          ],
          [{ method: 'card', amountCents: 26000 }]
        );
        const { check } = buildSaleCheck({ ...doc, requestId: first!.uid }, { taxes: TAXES, testing: true, uid: first!.uid });
        return registerCheck(creds, check, { uid: first!.uid, ...call() });
      });
      finding(`ANSWER 4a (repeat UID): ${again instanceof CashalotApiError ? describeError(again) : `ACCEPTED AGAIN — NumFiscal ${again.NumFiscal}: Cashalot is NOT idempotent on UID`}`);

      const fresh = await registrarState(creds, call());
      const next = Number(fresh.NextLocalNum ?? 0);
      let foundAt: string | null = null;
      for (let local = next - 1; local >= Math.max(1, next - 10) && !foundAt; local--) {
        const info = await trystep(`document_info_${local}`, { Command: 'DocumentInfoByLocalNum', ...wire, NumLocal: local }, () =>
          documentInfoByLocalNum(creds, local, call())
        );
        if (info instanceof CashalotApiError || !info.NumFiscal) continue;
        const xml = await trystep(`get_check_original_xml_${local}`, { Command: 'GetCheck', NumFiscal: String(info.NumFiscal), Type: 'OriginalXml' }, () =>
          getCheck(numFiscal, String(info.NumFiscal), 'OriginalXml', call())
        );
        const text = xml instanceof CashalotApiError ? null : decodeBase64Text(xml.Data);
        if (text?.toUpperCase().includes(first.uid.toUpperCase())) foundAt = `local ${local}, NumFiscal ${info.NumFiscal}`;
      }
      finding(`ANSWER 4b (our UID inside OriginalXml): ${foundAt ? `found at ${foundAt}` : 'NOT found in the last 10 documents — the lookup needs another key'}`);

      const badUid = crypto.randomUUID();
      const broken = await sell(creds, 'sell_invalid_then_same_uid_1', { ...saleDoc([line({})], [{ method: 'cash', amountCents: 100 }]), requestId: badUid }, (check) => {
        (check.CHECKTOTAL as Record<string, unknown>).SUM = 9.99;
      });
      const retry = await sell(creds, 'sell_invalid_then_same_uid_2', { ...saleDoc([line({})], [{ method: 'cash', amountCents: 100 }]), requestId: badUid });
      finding(`ANSWER 4c (a valid check under a UID that first got an error): first ${describeError(broken.result)}; then ${retry.result instanceof CashalotApiError ? describeError(retry.result) : 'accepted'}`);
    }

    // ── Probe 5: the errors, in their own words ─────────────────────────────
    const wrongPin = await trystep('error_wrong_pin', { Command: 'TransactionsRegistrarState', KeyGuid: keyGuid, KeyPin: '0000', NumFiscal: numFiscal }, () =>
      registrarState({ ...creds, keyPin: '0000' }, call())
    );
    finding(`ANSWER 5a (wrong PIN): ${describeError(wrongPin)}`);
    const wrongRegister = await trystep('error_wrong_register', { Command: 'TransactionsRegistrarState', ...wire, NumFiscal: '1' }, () =>
      registrarState({ ...creds, numFiscal: '1' }, call())
    );
    finding(`ANSWER 5b (foreign register): ${describeError(wrongRegister)}`);
    const offByKopeck = await sell(creds, 'error_checktax_off_by_a_kopeck', saleDoc([line({ unitPriceCents: 10000, lineTotalCents: 10000 })], [{ method: 'cash', amountCents: 10000 }]), (check) => {
      const tax = (check.CHECKTAX as Array<Record<string, unknown>>)[0];
      tax.SUM = Number(tax.SUM) + 0.01;
    });
    finding(`ANSWER 5c (CHECKTAX one kopeck off): ${describeError(offByKopeck.result)}`);
    const latin = await sell(creds, 'error_latin_letter', saleDoc([line({})], [{ method: 'cash', amountCents: 100 }]), (check) => {
      for (const row of check.CHECKBODY as Array<Record<string, unknown>>) row.LETTERS = 'A';
      for (const row of check.CHECKTAX as Array<Record<string, unknown>>) row.LETTER = 'A';
    });
    finding(`ANSWER 5d (Latin tax letter): ${describeError(latin.result)}`);

    // ── Probe 8: five checks in a row ───────────────────────────────────────
    const timings: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const started = Date.now();
      await sell(creds, `series_${i}`, saleDoc([line({ name: `Серія ${i}` })], [{ method: 'cash', amountCents: 100 }]));
      timings.push(Date.now() - started);
    }
    finding(`ANSWER 8: five checks took ${timings.join(', ')} ms (developers quote 400–800 ms)`);

    if (!(first.result instanceof CashalotApiError)) {
      const real = String(first.result.NumFiscal);
      const present = await trystep('get_check_availability_real', { Command: 'GetCheck', NumFiscal: real, Type: 'Availability' }, () =>
        getCheck(numFiscal, real, 'Availability', call())
      );
      finding(`ANSWER 7b: GetCheck Availability of a real number → ${present instanceof CashalotApiError ? describeError(present) : `ResultCode ${present.ResultCode}`}`);
    }
  }

  // ── Probe 6: return, service documents, X and Z ───────────────────────────
  if (doReturn) {
    if (first && !(first.result instanceof CashalotApiError)) {
      const refund: FiscalRefundDoc = {
        kind: 'refund',
        requestId: crypto.randomUUID(),
        ourNumber: `SANDBOX-RF-${RUN_ID}`,
        cashierName: 'Тест Cashalot',
        lines: [line({ name: 'Тест ПДВ 20', unitPriceCents: 10000, lineTotalCents: 10000, taxCode: 'A' })],
        payments: [{ method: 'card', amountCents: 10000 }],
        totalCents: 10000,
        discountCents: 0,
        relatedProviderDocId: String(first.result.NumFiscal),
        relatedOurNumber: `SANDBOX-${RUN_ID}`,
      };
      const { check } = buildRefundCheck(refund, { taxes: TAXES, testing: true, uid: refund.requestId });
      const ret = await trystep('return_against_first_sale', { Command: 'RegisterCheck', UID: refund.requestId, ...wire, Check: check }, () =>
        registerCheck(creds, check, { uid: refund.requestId, ...call() })
      );
      finding(`ANSWER 6a (return by ORDERRETNUM): ${ret instanceof CashalotApiError ? describeError(ret) : `NumFiscal ${ret.NumFiscal}`}`);
    } else {
      finding('ANSWER 6a: skipped — no sale of this run to return against (run with --all)');
    }

    for (const [kind, amount] of [['service_in', 10000], ['service_out', 5000]] as const) {
      const doc = { kind, requestId: crypto.randomUUID(), ourNumber: `SANDBOX-S-${RUN_ID}`, cashierName: 'Тест Cashalot', amountCents: amount };
      const { check } = buildServiceCheck(doc, { taxes: TAXES, testing: true, uid: doc.requestId });
      await trystep(`service_${kind}`, { Command: 'RegisterCheck', UID: doc.requestId, ...wire, Check: check }, () =>
        registerCheck(creds, check, { uid: doc.requestId, ...call() })
      );
    }

    const x = await trystep('x_report_last_shift_totals', { Command: 'LastShiftTotals', ...wire, Visualization: true }, () =>
      lastShiftTotals(creds, { visualization: true, ...call() })
    );
    if (!(x instanceof CashalotApiError)) {
      const text = decodeBase64Text(x.Visualization);
      const width = text ? Math.max(...text.split(/\r?\n/).map((l) => l.length)) : 0;
      finding(`ANSWER 6b (X-report text): widest line ${width} characters; CashInHand ${x.CashInHand}`);
    }

    const z = await trystep('close_shift_zrep_auto', { Command: 'CloseShift', ...wire, ZRepAuto: true, Visualization: true }, () =>
      closeShift(creds, { zRepAuto: true, visualization: true, ...call() })
    );
    finding(`ANSWER 6c (CloseShift{ZRepAuto}): ${z instanceof CashalotApiError ? describeError(z) : `NumFiscal ${z.NumFiscal}`}`);
    const twice = await trystep('close_shift_again', { Command: 'CloseShift', ...wire, ZRepAuto: true }, () =>
      closeShift(creds, { zRepAuto: true, ...call() })
    );
    finding(`ANSWER 6d (closing an already closed shift): ${describeError(twice)}`);
  }
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
