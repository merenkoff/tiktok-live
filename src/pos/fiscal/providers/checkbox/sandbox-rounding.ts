// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/sandbox-rounding.ts
//
// Manual check of how Checkbox rounds the cash total of a receipt — phase R5
// of TechDocs/POS_CASH_ROUNDING.md. Not a test: it rings real receipts on a
// TEST register (the licence key must start with "test") with the payloads
// our adapter builds, and keeps every answer under
// src/__tests__/fixtures/checkbox/runs/<timestamp>-rounding/ so the open
// questions in the design doc are answered by what the sandbox said.
//
//   CHECKBOX_SANDBOX_LICENSE_KEY=test… CHECKBOX_SANDBOX_PIN=… \
//     npm run fiscal:sandbox:rounding -- --go
//
//   (no flags)  read-only: the cashier and whether a shift is open
//   --go        ring four receipts on an OPEN shift and read each one back:
//                 1. cash 221,23 paid with 500,00, ROUND_10   → round_sum, total_rest
//                 2. cash 221,23 paid with 500,00, ROUND_50
//                 3. card 100,10 + cash 121,00 for 221,23, ROUND_50 — does
//                    Checkbox round the cash part (−0,13, our rule) or the
//                    whole receipt (−0,23)?
//                 4. the return of receipt 2 in cash, 221,00, ROUND_50
//
// Each receipt is built through `mapSellPayload` — the same function the
// adapter uses — so what is tested is what production sends.

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_API_VERSION } from '../../../version.js';
import {
  CheckboxApiError,
  getCurrentShift,
  getMe,
  getReceipt,
  sellReceipt,
  signInPinCode,
  type CheckboxReceipt,
} from './client.js';
import { mapSellPayload } from './payload.js';
import type { FiscalDocLine, FiscalRefundDoc, FiscalSaleDoc } from '../../types.js';

/* eslint-disable no-console */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', '__tests__', 'fixtures', 'checkbox');
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const RUN_DIR = path.join(FIXTURES_DIR, 'runs', `${RUN_ID}-rounding`);
const CLIENT_NAME = 'the-live-shop-pos';
const CLIENT_VERSION = String(POS_API_VERSION);

const doGo = process.argv.slice(2).includes('--go');
const findings: string[] = [];

function save(name: string, body: unknown): void {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, `${name}.json`), JSON.stringify(body, null, 2) + '\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRICE = 22123;

function line(): FiscalDocLine {
  return {
    name: 'Перевірка заокруглення',
    quantityMilli: 1000,
    unitPriceCents: PRICE,
    lineTotalCents: PRICE,
    discountCents: 0,
    taxCode: null,
    barcode: null,
    uktzed: null,
    sourceLineRef: 'rounding-check',
  };
}

function sale(
  name: string,
  payments: FiscalSaleDoc['payments'],
  step: 10 | 50,
  amountCents: number
): FiscalSaleDoc {
  return {
    kind: 'sale',
    requestId: crypto.randomUUID(),
    ourNumber: name,
    cashierName: 'Перевірка',
    lines: [line()],
    payments,
    totalCents: PRICE,
    discountCents: 0,
    cashRounding: { step, amountCents },
  };
}

function summary(receipt: CheckboxReceipt | null): Record<string, unknown> {
  if (!receipt) return { receipt: null };
  const sm = receipt.tax_url ? new URL(receipt.tax_url).searchParams.get('sm') : null;
  return {
    status: receipt.status,
    rounding_mode: receipt.rounding_mode ?? null,
    total_sum: receipt.total_sum ?? null,
    round_sum: receipt.round_sum ?? null,
    total_payment: receipt.total_payment ?? null,
    total_rest: receipt.total_rest ?? null,
    tax_url_sm: sm,
  };
}

async function main(): Promise<void> {
  const licenseKey = process.env.CHECKBOX_SANDBOX_LICENSE_KEY;
  const pin = process.env.CHECKBOX_SANDBOX_PIN;
  if (!licenseKey || !pin) {
    console.error('Set CHECKBOX_SANDBOX_LICENSE_KEY and CHECKBOX_SANDBOX_PIN');
    process.exit(2);
  }
  if (!licenseKey.toLowerCase().startsWith('test')) {
    console.error('Runs only against a test register (licence key starting with "test")');
    process.exit(2);
  }

  const { access_token } = await signInPinCode(
    licenseKey,
    pin,
    AbortSignal.timeout(60_000),
    CLIENT_NAME,
    CLIENT_VERSION
  );
  const opts = () => ({
    token: access_token,
    licenseKey,
    signal: AbortSignal.timeout(60_000),
    clientName: CLIENT_NAME,
    clientVersion: CLIENT_VERSION,
  });

  const me = await getMe(opts());
  console.log(`cashier: ${me.full_name}`);
  const shift = await getCurrentShift(opts());
  console.log(`shift: ${shift?.status ?? 'none'}`);
  if (!doGo) {
    console.log('\nDone (read-only). Add --go to ring the four receipts on the test register.');
    return;
  }
  if (!shift || shift.status !== 'OPENED') {
    console.error('--go needs an OPEN shift on the test register (open one from the кабінет first)');
    process.exit(3);
  }

  /** Send through the adapter's own mapping, then wait for DONE and read it back. */
  async function ring(name: string, doc: FiscalSaleDoc | FiscalRefundDoc): Promise<CheckboxReceipt | null> {
    const payload = mapSellPayload(doc);
    save(`${name}_request`, payload);
    try {
      const created = await sellReceipt(opts(), payload);
      let receipt: CheckboxReceipt | null = created;
      for (let i = 0; i < 20 && receipt?.status === 'CREATED'; i++) {
        await sleep(1500);
        receipt = await getReceipt(opts(), created.id);
      }
      save(`${name}_receipt`, receipt);
      const facts = summary(receipt);
      console.log(`\n== ${name}\n${JSON.stringify(facts, null, 2)}`);
      findings.push(`${name}: ${JSON.stringify(facts)}`);
      return receipt;
    } catch (error) {
      if (error instanceof CheckboxApiError) {
        save(`${name}_error`, { status: error.status, code: error.code, body: error.body });
        console.error(`\n== ${name}: HTTP ${error.status} ${error.code ?? ''}`, JSON.stringify(error.body));
        findings.push(`${name}: refused ${error.status} ${error.code ?? ''}`);
        return null;
      }
      throw error;
    }
  }

  await ring('1_cash_round10', sale('ROUND-1', [{ method: 'cash', amountCents: 50000 }], 10, -3));
  const second = await ring('2_cash_round50', sale('ROUND-2', [{ method: 'cash', amountCents: 50000 }], 50, -23));
  await ring(
    '3_mixed_round50',
    sale(
      'ROUND-3',
      [
        { method: 'card', amountCents: 10010 },
        { method: 'cash', amountCents: 12100 },
      ],
      50,
      -13
    )
  );
  if (second?.id && second.status === 'DONE') {
    await ring('4_return_round50', {
      kind: 'refund',
      requestId: crypto.randomUUID(),
      ourNumber: 'ROUND-4',
      cashierName: 'Перевірка',
      lines: [line()],
      payments: [{ method: 'cash', amountCents: PRICE - 23 }],
      totalCents: PRICE,
      discountCents: 0,
      relatedProviderDocId: second.id,
      relatedOurNumber: 'ROUND-2',
      cashRounding: { step: 50, amountCents: -23 },
    });
  }

  save('run', { run_id: RUN_ID, finished_at: new Date().toISOString(), findings });
  console.log(`\nRun kept in ${path.relative(process.cwd(), RUN_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
