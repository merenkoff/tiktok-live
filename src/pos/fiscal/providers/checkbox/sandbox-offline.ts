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
//   CHECKBOX_SANDBOX_LICENSE_KEY=test… CHECKBOX_SANDBOX_PIN=… \
//     npm run fiscal:sandbox:offline -- [--ask] [--go]
//
//   (no flags)  read-only: cashier, register info, offline codes count, the
//               first five unused codes
//   --ask       also `ask-offline-codes?count=20&sync=true` (asks the tax
//               office; harmless — codes are only spent when used)
//   --go        the whole cycle on the test register, shaped like a real
//               outage: go-offline dated in the PAST → three sell-offline
//               receipts minutes apart, also in the past, chained →
//               go-online → poll `info` → re-read every receipt. Needs an
//               OPEN shift; refuses a register whose licence key does not
//               start with "test".
//   --minutes=N how long ago the outage began (default 90). The receipts are
//               spread across it.
//
// --go answers the two questions the whole offline design rests on, and
// neither can be answered from the wiki:
//
//   1. Does Checkbox accept a `go_offline_date` and `fiscal_date` in the
//      PAST? Our till only tells the server it was offline once it comes
//      back, so the server reconstructs the session start from the first
//      receipt it receives — hours ago, in a long outage. If the provider
//      insists on "now", фаза 3 changes shape (TechDocs/POS_FISCAL_OFFLINE.md).
//      When the past date is refused, the script immediately retries the same
//      call with `now`: two results one minute apart are what tells you the
//      date was the reason rather than the register's state.
//   2. Does the `sell-offline` response carry `control_number` and a
//      `tax_url` when the client sent none? The script prints both, per
//      receipt.
//
// Deliberately three receipts, not one, and minutes apart rather than
// seconds: a single receipt a second after `go-offline` exercises none of
// the ordering a real outage produces.

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

const argv = process.argv.slice(2);
const args = new Set(argv);
const doAsk = args.has('--ask') || args.has('--go');
const doGo = args.has('--go');

/** How long ago the simulated outage began. */
const OUTAGE_MINUTES = (() => {
  const raw = argv.find((a) => a.startsWith('--minutes='))?.split('=')[1];
  const n = Number(raw ?? 90);
  return Number.isFinite(n) && n > 2 ? Math.floor(n) : 90;
})();

function save(name: string, body: unknown): void {
  const file = path.join(FIXTURES_DIR, `offline_${name}.json`);
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
  console.log(`  → saved ${path.relative(process.cwd(), file)}`);
}

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

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
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

  const signal = AbortSignal.timeout(60_000);
  const { access_token } = await signInPinCode(licenseKey, pin, signal, CLIENT_NAME, CLIENT_VERSION);
  const opts = { token: access_token, licenseKey, signal, clientName: CLIENT_NAME, clientVersion: CLIENT_VERSION };

  const me = await step('cashier_me', () => getMe(opts));
  console.log(`  cashier: ${me.full_name}`);
  const info = await step('register_info', () => getCashRegisterInfo(opts));
  console.log(`  register ${info.fiscal_number}: offline_mode=${info.offline_mode} stay_offline=${info.stay_offline}`);
  await step('codes_count', () => getOfflineCodesCountRequest(opts));

  if (doAsk) {
    await step('ask_codes', () => askOfflineCodesRequest(opts, 20));
  }
  const codes = await step('get_codes', () => getOfflineCodesRequest(opts, 5));
  console.log(`  ${codes.length} unused codes listed`);

  if (!doGo) {
    console.log('\nDone (read-only). Add --go for the full offline cycle on the test register.');
    return;
  }

  const shift = await getCurrentShift(opts);
  if (!shift || shift.status !== 'OPENED') {
    console.error('\n--go needs an OPEN shift on the test register (open one from the кабінет or POST /shifts first)');
    process.exit(3);
  }
  if (codes.length < 4) {
    console.error('\n--go needs at least four unused offline codes (one for go-offline, three receipts) — run with --ask first');
    process.exit(3);
  }
  if (info.offline_mode) {
    console.error('\nRegister is already offline — send go-online and wait before running --go');
    process.exit(3);
  }

  // The shape of a real outage, reconstructed after the fact — which is the
  // only shape our server can ever produce: the till was offline, so we learn
  // of the session only when it reconnects and date it back from the first
  // receipt it hands us.
  const startedAt = minutesAgo(OUTAGE_MINUTES);
  const receiptDates = [
    minutesAgo(OUTAGE_MINUTES - 1),
    minutesAgo(Math.round(OUTAGE_MINUTES / 2)),
    minutesAgo(2),
  ];
  const [goCode, ...sellCodes] = codes;

  console.log(
    `\n== simulating an outage that began ${OUTAGE_MINUTES} min ago\n` +
      `   go-offline at ${hhmm(startedAt)}Z, receipts at ${receiptDates.map((d) => hhmm(d) + 'Z').join(', ')}`
  );

  // ── Question 1: is a past `go_offline_date` accepted at all? ──────────────
  let sessionStart = startedAt;
  const past = await trystep('go_offline_past', () =>
    goOfflineRequest(opts, {
      go_offline_date: startedAt.toISOString(),
      fiscal_code: goCode.fiscal_code,
    })
  );
  if (past instanceof CheckboxApiError) {
    console.error(
      `\n  *** ANSWER 1: Checkbox REFUSED go-offline dated ${OUTAGE_MINUTES} min in the past ` +
        `(HTTP ${past.status} ${past.code ?? ''}). Фаза 3 rests on this being accepted — ` +
        `see TechDocs/POS_FISCAL_OFFLINE.md, and read the differential below before concluding. ***`
    );
    // The differential: the same call with `now`. If this one is refused too,
    // the date was never the problem (wrong shift state, spent code, …) and
    // question 1 is still open.
    const nowProbe = await trystep('go_offline_now', () =>
      goOfflineRequest(opts, {
        go_offline_date: new Date().toISOString(),
        fiscal_code: sellCodes[0].fiscal_code,
      })
    );
    if (nowProbe instanceof CheckboxApiError) {
      console.error(
        '\n  *** INCONCLUSIVE: `now` was refused as well — the past date was not the reason. ' +
          'Fix the register state (open shift, unused codes, already offline) and re-run. ***'
      );
      process.exit(4);
    }
    console.error(
      '\n  *** CONFIRMED: `now` was accepted where the past date was not. ' +
        'The provider requires a current `go_offline_date`. ***'
    );
    sessionStart = new Date();
    // Carry on anyway: the receipts below still answer question 2, and their
    // own past dates tell us whether `fiscal_date` is policed as strictly.
    sellCodes.shift();
  }
  await step('register_info_offline', () => getCashRegisterInfo(opts));

  // ── The receipts: minutes apart, in the past, chained ─────────────────────
  const sold: Array<{ id: string; at: Date; controlNumber: unknown; taxUrl: unknown }> = [];
  let previousReceiptId: string | undefined;

  for (const [i, at] of receiptDates.entries()) {
    const code = sellCodes[i];
    if (!code) break;
    // Never date a receipt before the session it belongs to: if the provider
    // forced `go-offline` to `now`, the past dates below are moot.
    const fiscalDate = at > sessionStart ? at : new Date(sessionStart.getTime() + (i + 1) * 60_000);
    const receiptId = crypto.randomUUID();
    const receipt = await trystep(`receipt_sell_offline_${i + 1}`, () =>
      sellReceiptOffline(opts, {
        id: receiptId,
        cashier_name: me.full_name,
        goods: [
          {
            good: { code: `SANDBOX-OFF-${i + 1}`, name: `Тест офлайн ${i + 1}`, price: 100 },
            quantity: 1000,
            is_return: false,
          },
        ],
        payments: [{ type: 'CASH', value: 100 }],
        fiscal_code: code.fiscal_code,
        fiscal_date: fiscalDate.toISOString(),
        // The chain control the replay sends in production.
        ...(previousReceiptId ? { previous_receipt_id: previousReceiptId } : {}),
      })
    );
    if (receipt instanceof CheckboxApiError) {
      console.error(
        `\n  *** Receipt ${i + 1} dated ${hhmm(fiscalDate)}Z REFUSED (HTTP ${receipt.status} ` +
          `${receipt.code ?? ''}). A past \`fiscal_date\` is what a till always sends. ***`
      );
      break;
    }
    previousReceiptId = receipt.id ?? receiptId;
    sold.push({
      id: receiptId,
      at: fiscalDate,
      controlNumber: receipt.control_number,
      taxUrl: receipt.tax_url,
    });
    console.log(
      `  receipt ${i + 1} @ ${hhmm(fiscalDate)}Z accepted: ` +
        `control_number=${JSON.stringify(receipt.control_number)} ` +
        `tax_url=${receipt.tax_url ? 'present' : 'absent'}`
    );
  }

  console.log(
    `\n  *** ANSWER 2: of ${receiptDates.length} back-dated receipts, ${sold.length} were accepted; ` +
      `control_number came back on ${sold.filter((r) => r.controlNumber).length}, ` +
      `tax_url on ${sold.filter((r) => r.taxUrl).length}. ***`
  );

  await step('go_online', () => goOnlineRequest(opts));
  for (let i = 0; i < 6; i++) {
    await sleep(30_000);
    const state = await getCashRegisterInfo(opts);
    console.log(`  poll ${i + 1}: offline_mode=${state.offline_mode}`);
    if (!state.offline_mode) {
      save('register_info_online', state);
      break;
    }
    if (i === 3) {
      console.log('  still offline after 2 min — sending go-online once more (rate limit: 1 per 2 min)');
      await goOnlineRequest(opts);
    }
  }

  // Re-read every receipt: the dates and numbers the tax office ended up with
  // are what a customer's QR resolves to.
  for (const [i, receipt] of sold.entries()) {
    const back = await trystep(`receipt_sell_offline_${i + 1}_after`, () => getReceipt(opts, receipt.id));
    if (back && !(back instanceof CheckboxApiError)) {
      console.log(
        `  receipt ${i + 1}: status=${back.status} fiscal_code=${back.fiscal_code} ` +
          `fiscal_date=${back.fiscal_date} control_number=${JSON.stringify(back.control_number)}`
      );
    }
  }
  console.log(
    '\nDone. Check the receipts in the Checkbox кабінет — their dates should be the back-dated ones — ' +
      'and commit the offline_*.json fixtures.'
  );
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
