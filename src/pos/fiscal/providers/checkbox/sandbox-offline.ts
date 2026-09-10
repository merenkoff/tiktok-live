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
//   --go        the whole cycle on the test register: go-offline with one
//               code → sell-offline of one item with the next code (no
//               control_number in the request) → go-online → poll `info`
//               until back online → re-read the receipt. Needs an OPEN
//               shift; refuses a register whose licence key does not start
//               with "test".
//
// The whole point of --go is the question the wiki leaves open: does the
// `sell-offline` response carry `control_number` and a `tax_url` when the
// client sent none? The script prints both.

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

const args = new Set(process.argv.slice(2));
const doAsk = args.has('--ask') || args.has('--go');
const doGo = args.has('--go');

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  if (codes.length < 2) {
    console.error('\n--go needs at least two unused offline codes (run with --ask first)');
    process.exit(3);
  }
  if (info.offline_mode) {
    console.error('\nRegister is already offline — send go-online and wait before running --go');
    process.exit(3);
  }

  const [goCode, sellCode] = codes;
  const now = new Date();
  await step('go_offline', () =>
    goOfflineRequest(opts, { go_offline_date: now.toISOString(), fiscal_code: goCode.fiscal_code })
  );
  await step('register_info_offline', () => getCashRegisterInfo(opts));

  const receiptId = crypto.randomUUID();
  const sold = await step('receipt_sell_offline', () =>
    sellReceiptOffline(opts, {
      id: receiptId,
      cashier_name: me.full_name,
      goods: [
        {
          good: { code: 'SANDBOX-OFF', name: 'Тест офлайн', price: 100 },
          quantity: 1000,
          is_return: false,
        },
      ],
      payments: [{ type: 'CASH', value: 100 }],
      fiscal_code: sellCode.fiscal_code,
      fiscal_date: new Date().toISOString(),
    })
  );
  console.log(
    `\n  *** sell-offline answered: control_number=${JSON.stringify(sold.control_number)} ` +
      `fiscal_code=${sold.fiscal_code} tax_url=${sold.tax_url ? 'present' : 'absent'} ***`
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

  await step('receipt_sell_offline_after', () => getReceipt(opts, receiptId));
  console.log('\nDone. Check the receipt in the Checkbox кабінет and commit the offline_*.json fixtures.');
}

main().catch((error) => {
  console.error('\nFailed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
