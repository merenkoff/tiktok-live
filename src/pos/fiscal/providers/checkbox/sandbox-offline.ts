// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/sandbox-offline.ts
//
// Manual dry run of Checkbox's offline API on a TEST register — phase 0 of
// TechDocs/POS_FISCAL_OFFLINE.md. Not a test: it talks to the real
// api.checkbox.in.ua with the credentials from the environment and writes
// every response into src/__tests__/fixtures/checkbox/offline_*.json so the
// shapes the adapter assumes are pinned to what the sandbox actually said.
//
// Every run also keeps itself: its responses, and the whole console output,
// land in fixtures/checkbox/runs/<timestamp>/ next to a run.json saying what
// was asked and what came back. The canonical `offline_*.json` are still the
// latest run — they are what the adapter's readers go to — but a run is no
// longer erased by the next one. That is not tidiness: the run that found
// `receipt.previous_id_last_id_differs` was overwritten by the successful
// re-run minutes later, and only the two *_error.json files survived it,
// because success happens to write different names than failure does.
//
//   CHECKBOX_SANDBOX_LICENSE_KEY=test… CHECKBOX_SANDBOX_PIN=… \
//     npm run fiscal:sandbox:offline -- [--ask] [--go]
//
//   (no flags)  read-only: cashier, register info, offline codes count, the
//               first five unused codes
//   --ask       also `ask-offline-codes?count=20&sync=true` (asks the tax
//               office; harmless — codes are only spent when used)
//   --go        live a real outage on the test register, in real time: take
//               the codes, WAIT, ring a few sales while "offline" (nothing is
//               sent), wait some more, then reconnect — go-offline dated just
//               before the first sale, the sales with the clock times they
//               actually happened at, chained; then go-online, poll `info`,
//               re-read every receipt. Needs an OPEN shift; refuses a register
//               whose licence key does not start with "test".
//   --outage=N  how many real minutes the outage lasts (default 10)
//   --sales=N   how many receipts to ring during it (default 3)
//
// Why it waits for real instead of back-dating everything from the start:
// each offline code carries the tax office's own `created_at`, so a run that
// fetched codes at 04:36 and then claimed an outage beginning at 03:06 would
// be stamping receipts with numbers that did not exist yet. Nothing in
// production can produce that — a till leases its codes while it is still
// online, and the outage starts afterwards — so a pass on such a run would
// prove nothing and a failure would be our own fault. Real waiting keeps the
// order of events honest: codes issued, then the outage, then the receipts.
//
// What it does still test, because production cannot avoid it: the reconnect
// dates `go-offline` a second before the FIRST receipt, which is minutes in
// the past by then, and every `sell-offline` carries the time the sale really
// happened rather than "now". If Checkbox refuses those, фаза 3 changes shape
// (TechDocs/POS_FISCAL_OFFLINE.md). It also prints whether the codes it spent
// were issued before the session it opened — the constraint that makes the
// whole ordering coherent — and whether `control_number` and `tax_url` come
// back when the client sends neither.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_API_VERSION } from '../../../version.js';
import {
  askOfflineCodesRequest,
  CheckboxApiError,
  getCashRegisterInfo,
  getCurrentShift,
  getMe,
  getOfflineCodesCountRequest,
  getOfflineCodesRequest,
  getReceipt,
  goOfflineRequest,
  goOnlineRequest,
  sellReceiptOffline,
  signInPinCode,
} from './client.js';

/* eslint-disable no-console */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', '__tests__', 'fixtures', 'checkbox');
const CLIENT_NAME = 'the-live-shop-pos';
const CLIENT_VERSION = String(POS_API_VERSION);

/** `20260912-2244Z` — sortable, one folder per run, no collisions within a minute that matter. */
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const RUN_DIR = path.join(FIXTURES_DIR, 'runs', RUN_ID);
const STARTED_AT = new Date().toISOString();

/**
 * Everything printed, kept verbatim.
 *
 * The interesting part of a run is usually the narration — which answer came
 * back at which minute — and up to now it lived only in whoever's terminal
 * ran it. Console still behaves normally; this just also remembers.
 */
const transcript: string[] = [];
for (const level of ['log', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...parts: unknown[]): void => {
    transcript.push(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '));
    original(...parts);
  };
}

/** Notes worth reading without scrolling the transcript: the ANSWERs and the refusals. */
const findings: string[] = [];
function finding(line: string): void {
  findings.push(line);
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const doAsk = args.has('--ask') || args.has('--go');
const doGo = args.has('--go');

function intArg(name: string, fallback: number, min: number): number {
  const raw = argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

/** Real minutes the simulated outage lasts, and how many receipts it carries. */
const OUTAGE_MINUTES = intArg('outage', 10, 2);
const SALES = intArg('sales', 3, 1);

let savedAny = false;

function save(name: string, body: unknown): void {
  savedAny = true;
  const text = JSON.stringify(body, null, 2) + '\n';
  const file = path.join(FIXTURES_DIR, `offline_${name}.json`);
  fs.writeFileSync(file, text);
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, `${name}.json`), text);
  console.log(`  → saved ${path.relative(process.cwd(), file)}`);
}

/**
 * Write the run's own record — on every exit path, including `process.exit`
 * from a failed precondition, because a run that stopped early is exactly the
 * one worth reading later.
 */
let flushed = false;
function flushRun(): void {
  if (flushed) return;
  flushed = true;
  // A run that never reached the API — no credentials, wrong flags — is not
  // history worth a folder.
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
        outage_minutes: doGo ? OUTAGE_MINUTES : null,
        sales: doGo ? SALES : null,
        exit_code: process.exitCode ?? 0,
        findings,
      },
      null,
      2
    ) + '\n'
  );
  // Written with the original console: this one runs inside the exit handler.
  process.stdout.write(`\nRun kept in ${path.relative(process.cwd(), RUN_DIR)}\n`);
}
process.on('exit', flushRun);

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  console.log(`\n== ${name}`);
  try {
    const result = await fn();
    console.log(JSON.stringify(result, null, 2).slice(0, 1500));
    save(name, result);
    return result;
  } catch (error) {
    if (error instanceof CheckboxApiError) {
      console.error(`  ✗ HTTP ${error.status} ${error.code ?? ''}`, JSON.stringify(error.body));
      save(`${name}_error`, { status: error.status, code: error.code, body: error.body });
    }
    throw error;
  }
}

/** Like `step`, but hands the error back instead of throwing — for a probe whose failure IS the answer. */
async function trystep<T>(name: string, fn: () => Promise<T>): Promise<T | CheckboxApiError> {
  try {
    return await step(name, fn);
  } catch (error) {
    if (error instanceof CheckboxApiError) return error;
    throw error;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait out a real stretch of the outage, saying so — a silent 10-minute pause looks like a hang. */
async function waitFor(ms: number, what: string): Promise<void> {
  const until = Date.now() + ms;
  console.log(`\n  … waiting ${Math.round(ms / 60_000)} min (${Math.round(ms / 1000)}s) for ${what}`);
  while (Date.now() < until) {
    await sleep(Math.min(30_000, until - Date.now()));
    const left = Math.max(0, Math.round((until - Date.now()) / 1000));
    if (left > 0) console.log(`    ${left}s left`);
  }
}

const hhmm = (at: Date) => at.toISOString().slice(11, 16);

async function main(): Promise<void> {
  const licenseKey = process.env.CHECKBOX_SANDBOX_LICENSE_KEY;
  const pin = process.env.CHECKBOX_SANDBOX_PIN;
  if (!licenseKey || !pin) {
    console.error('Set CHECKBOX_SANDBOX_LICENSE_KEY and CHECKBOX_SANDBOX_PIN');
    process.exit(2);
  }
  if (doGo && !licenseKey.toLowerCase().startsWith('test')) {
    console.error('--go only runs against a test register (licence key starting with "test")');
    process.exit(2);
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const { access_token } = await signInPinCode(
    licenseKey,
    pin,
    AbortSignal.timeout(60_000),
    CLIENT_NAME,
    CLIENT_VERSION
  );
  // A fresh signal per call, not one for the whole run: this script now spends
  // minutes waiting out an outage, and a single `AbortSignal.timeout(60s)`
  // would abort every request made after the first minute.
  const opts = () => ({
    token: access_token,
    licenseKey,
    signal: AbortSignal.timeout(60_000),
    clientName: CLIENT_NAME,
    clientVersion: CLIENT_VERSION,
  });

  const me = await step('cashier_me', () => getMe(opts()));
  console.log(`  cashier: ${me.full_name}`);
  const info = await step('register_info', () => getCashRegisterInfo(opts()));
  console.log(`  register ${info.fiscal_number}: offline_mode=${info.offline_mode} stay_offline=${info.stay_offline}`);
  await step('codes_count', () => getOfflineCodesCountRequest(opts()));

  if (doAsk) {
    await step('ask_codes', () => askOfflineCodesRequest(opts(), 20));
  }
  const codes = await step('get_codes', () => getOfflineCodesRequest(opts(), 5));
  console.log(`  ${codes.length} unused codes listed`);

  if (!doGo) {
    console.log('\nDone (read-only). Add --go for the full offline cycle on the test register.');
    return;
  }

  const shift = await getCurrentShift(opts());
  if (!shift || shift.status !== 'OPENED') {
    finding('stopped: no open shift on the test register');
    console.error('\n--go needs an OPEN shift on the test register (open one from the кабінет or POST /shifts first)');
    process.exit(3);
  }
  if (codes.length < 4) {
    finding('stopped: fewer than four unused offline codes');
    console.error('\n--go needs at least four unused offline codes (one for go-offline, three receipts) — run with --ask first');
    process.exit(3);
  }
  if (info.offline_mode) {
    finding('stopped: register was already offline before the run');
    console.error('\nRegister is already offline — send go-online and wait before running --go');
    process.exit(3);
  }

  // ── Live the outage, in real time ────────────────────────────────────────
  //
  // Nothing below is sent while the outage lasts: that is the whole point. The
  // till has no network, so it rings sales against codes it already holds and
  // keeps them. Only the reconnect at the end talks to Checkbox.

  const gapMs = Math.max(60_000, Math.floor((OUTAGE_MINUTES * 60_000) / (SALES + 1)));
  const [goCode, ...sellCodes] = codes;
  const issuedAt = codes
    .map((c) => (c.created_at ? new Date(c.created_at) : null))
    .filter((d): d is Date => d !== null);
  const newestCode = issuedAt.length
    ? new Date(Math.max(...issuedAt.map((d) => d.getTime())))
    : null;

  console.log(
    `\n== living an outage of ${OUTAGE_MINUTES} min with ${SALES} receipt(s)\n` +
      `   codes in hand: ${codes.map((c) => c.fiscal_code).join(', ')}\n` +
      `   issued by the tax office at: ${newestCode ? hhmm(newestCode) + 'Z' : 'unknown'}\n` +
      `   nothing is sent until the reconnect — the run takes about ${OUTAGE_MINUTES} min plus polling`
  );

  const rung: Array<{ id: string; at: Date; code: string; index: number }> = [];
  for (let i = 0; i < Math.min(SALES, sellCodes.length); i++) {
    await waitFor(gapMs, `sale ${i + 1} of ${Math.min(SALES, sellCodes.length)}`);
    // The timestamp is taken here, as the sale happens — not computed ahead.
    const at = new Date();
    rung.push({ id: crypto.randomUUID(), at, code: sellCodes[i].fiscal_code, index: i + 1 });
    console.log(`  · sale ${i + 1} rung offline at ${hhmm(at)}Z on ${sellCodes[i].fiscal_code}`);
  }
  if (rung.length === 0) {
    console.error('\nNo codes left for sales — run with --ask first');
    process.exit(3);
  }

  // The rest of the outage: the till is still dark, and every receipt above is
  // getting older. This is what makes the reconnect dates genuinely past.
  const elapsed = Date.now() - rung[0].at.getTime();
  await waitFor(Math.max(60_000, OUTAGE_MINUTES * 60_000 - elapsed - gapMs), 'the till to reconnect');

  // ── Reconnect: exactly what our server does for a till-held session ───────
  const sessionStart = new Date(rung[0].at.getTime() - 1000);
  const behind = Math.round((Date.now() - sessionStart.getTime()) / 60_000);
  console.log(
    `\n== reconnecting at ${hhmm(new Date())}Z\n` +
      `   go-offline will be dated ${hhmm(sessionStart)}Z — ${behind} min in the past`
  );
  if (newestCode) {
    const coherent = newestCode.getTime() <= sessionStart.getTime();
    console.log(
      `   codes issued ${hhmm(newestCode)}Z ${coherent ? '≤' : '>'} session start ${hhmm(sessionStart)}Z ` +
        `— ${coherent ? 'coherent, as production always is' : 'INCOHERENT: this run does not mirror production'}`
    );
  }

  const goOffline = await trystep('go_offline_past', () =>
    goOfflineRequest(opts(), {
      go_offline_date: sessionStart.toISOString(),
      fiscal_code: goCode.fiscal_code,
    })
  );
  if (goOffline instanceof CheckboxApiError) {
    finding(
      `ANSWER 1: go-offline dated ${behind} min in the past REFUSED — ` +
        `HTTP ${goOffline.status} ${goOffline.code ?? ''}`
    );
    console.error(
      `\n  *** ANSWER 1: Checkbox REFUSED go-offline dated ${behind} min in the past ` +
        `(HTTP ${goOffline.status} ${goOffline.code ?? ''}).\n` +
        `      Фаза 3 rests on this being accepted — the till only reports an outage once it is over. ` +
        `See TechDocs/POS_FISCAL_OFFLINE.md. ***`
    );
    // The differential: the same call with `now`. Two answers a minute apart
    // separate "the date was the problem" from "the register was".
    const nowProbe = await trystep('go_offline_now', () =>
      goOfflineRequest(opts(), {
        go_offline_date: new Date().toISOString(),
        fiscal_code: goCode.fiscal_code,
      })
    );
    if (nowProbe instanceof CheckboxApiError) {
      console.error(
        '\n  *** INCONCLUSIVE: `now` was refused as well, so the past date was not the reason. ' +
          'Check the shift, the codes and offline_mode, then re-run. ***'
      );
      process.exit(4);
    }
    console.error(
      '\n  *** CONFIRMED: `now` was accepted where the past date was not — ' +
        'the provider requires a current `go_offline_date`. ***'
    );
    process.exit(4);
  }
  // HTTP 200 is not the answer — `go-offline` is asynchronous, and a register
  // that has not actually flipped will refuse every receipt that follows with
  // something that reads like a date problem. Ask it what it thinks it is.
  const offlineState = await step('register_info_offline', () => getCashRegisterInfo(opts()));
  if (!offlineState.offline_mode) {
    finding(`go-offline accepted (HTTP 200) but offline_mode is still false at ${hhmm(new Date())}Z`);
    console.error(
      `\n  *** ANSWER 1: Checkbox ACCEPTED the go-offline dated ${behind} min in the past, ` +
        `but the register reports offline_mode=false. The receipts below will be refused; ` +
        `treat this run as inconclusive about the dates. ***`
    );
  } else {
    finding(`go-offline dated ${behind} min in the past accepted; register is offline`);
    console.log(
      `\n  *** ANSWER 1: a go-offline dated ${behind} min in the past was ACCEPTED ` +
        `and the register is offline. ***`
    );
  }

  // ── The receipts, with the times they were actually rung ──────────────────
  const sold: Array<{ id: string; at: Date; controlNumber: unknown; taxUrl: unknown }> = [];

  for (const sale of rung) {
    const receipt = await trystep(`receipt_sell_offline_${sale.index}`, () =>
      sellReceiptOffline(opts(), {
        id: sale.id,
        cashier_name: me.full_name,
        goods: [
          {
            good: { code: `SANDBOX-OFF-${sale.index}`, name: `Тест офлайн ${sale.index}`, price: 100 },
            quantity: 1000,
            is_return: false,
          },
        ],
        payments: [{ type: 'CASH', value: 100 }],
        fiscal_code: sale.code,
        fiscal_date: sale.at.toISOString(),
        // No `previous_receipt_id`: the 2026-09-12 run sent the id Checkbox
        // had just returned for the previous receipt and got 400
        // `receipt.previous_id_last_id_differs`, which cost every receipt
        // after the first. Production no longer sends it either.
      })
    );
    if (receipt instanceof CheckboxApiError) {
      finding(
        `receipt ${sale.index} (rung ${hhmm(sale.at)}Z) refused: HTTP ${receipt.status} ${receipt.code ?? ''}`
      );
      console.error(
        `\n  *** Receipt ${sale.index}, rung at ${hhmm(sale.at)}Z ` +
          `(${Math.round((Date.now() - sale.at.getTime()) / 60_000)} min ago), REFUSED: ` +
          `HTTP ${receipt.status} ${receipt.code ?? ''}. A past \`fiscal_date\` is what every ` +
          `offline receipt carries. ***`
      );
      break;
    }
    sold.push({ id: sale.id, at: sale.at, controlNumber: receipt.control_number, taxUrl: receipt.tax_url });
    console.log(
      `  receipt ${sale.index} @ ${hhmm(sale.at)}Z accepted: ` +
        `control_number=${JSON.stringify(receipt.control_number)} ` +
        `tax_url=${receipt.tax_url ? 'present' : 'absent'}`
    );
  }

  finding(
    `ANSWER 2: ${sold.length}/${rung.length} offline receipts accepted, ` +
      `control_number on ${sold.filter((r) => r.controlNumber).length}, ` +
      `tax_url on ${sold.filter((r) => r.taxUrl).length}`
  );
  console.log(
    `\n  *** ANSWER 2: of ${rung.length} receipts rung during the outage, ${sold.length} were accepted; ` +
      `control_number came back on ${sold.filter((r) => r.controlNumber).length}, ` +
      `tax_url on ${sold.filter((r) => r.taxUrl).length}. ***`
  );

  await step('go_online', () => goOnlineRequest(opts()));
  let backOnline = false;
  for (let i = 0; i < 6; i++) {
    await sleep(30_000);
    const state = await getCashRegisterInfo(opts());
    console.log(`  poll ${i + 1}: offline_mode=${state.offline_mode}`);
    if (!state.offline_mode) {
      save('register_info_online', state);
      backOnline = true;
      finding(`go-online: register back online after ${i + 1} poll(s)`);
      break;
    }
    if (i === 3) {
      console.log('  still offline after 2 min — sending go-online once more (rate limit: 1 per 2 min)');
      await goOnlineRequest(opts());
    }
  }
  if (!backOnline) finding('go-online: register still offline after 3 min of polling');

  // Re-read each receipt: the dates the tax office ended up with are what a
  // customer's QR resolves to.
  for (const receipt of sold) {
    const back = await trystep(`receipt_sell_offline_${sold.indexOf(receipt) + 1}_after`, () =>
      getReceipt(opts(), receipt.id)
    );
    if (back && !(back instanceof CheckboxApiError)) {
      console.log(
        `  ${receipt.id.slice(0, 8)}: status=${back.status} fiscal_code=${back.fiscal_code} ` +
          `fiscal_date=${back.fiscal_date} control_number=${JSON.stringify(back.control_number)}`
      );
    }
  }
  console.log(
    '\nDone. In the Checkbox кабінет the receipts should carry the times they were rung, ' +
      'not the time they were sent. Commit the offline_*.json fixtures together with this ' +
      "run's folder under fixtures/checkbox/runs/."
  );
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
