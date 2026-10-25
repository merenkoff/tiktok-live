// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/sandbox-weighed.ts
//
// Manual check of how Checkbox sums a weighed line — decision Д8 of
// TechDocs/grocery/PLAN.md, the open question of TechDocs/grocery/G4_WEIGHED.md
// §8. Not a test: it rings real receipts on a TEST register (the licence key
// must start with "test") with the payloads our adapter builds, and keeps
// every answer — and every receipt's text — under
// src/__tests__/fixtures/checkbox/runs/<timestamp>-weighed/.
//
//   CHECKBOX_SANDBOX_LICENSE_KEY=test… CHECKBOX_SANDBOX_PIN=… \
//     npm run fiscal:sandbox:weighed -- --go
//
//   (no flags)  read-only: the cashier and whether a shift is open
//   --go        ring on an OPEN shift and read each receipt back:
//                 1. 0,350 кг × 189,90 = 66,465 — half a kopeck on an even
//                    floor: 66,47 is «half up», 66,46 «to even» or «down»
//                 2. 0,250 кг × 189,90 = 47,475 — an odd floor: 47,48 unless
//                    Checkbox drops the fraction
//                 3. 1,457 кг × 52,30 = 76,2011 — an ordinary fraction (the
//                    ДПС example «1 кг 457 г»)
//                 4. receipt 1 with a 10 % line discount — the discount on a
//                    fractional line; our sum 59,82
//                 5. two weighed lines, two pieces and a cart discount — the
//                    lines add up to the receipt
//                 6. the return of receipt 1, whole
//                 7. receipt 1 with `good.footer = «вагу введено вручну»` —
//                    whether Checkbox prints a good's footer
//
// Each receipt goes through `mapSellPayload` — the function the adapter uses —
// and its expected sums through `lineAmountCents`, the function the sale
// prices with, so what is checked is what production sends. If receipt 1
// comes back as 6 646, `lineAmountCents` (here and its copy on the till) and
// `LINE_AMOUNT_CASES` change — nothing else (G4_WEIGHED.md §8).

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_API_VERSION } from '../../../version.js';
import { lineAmountCents } from '../../../lineMoney.js';
import {
  CheckboxApiError,
  getCurrentShift,
  getMe,
  getReceipt,
  getReceiptRendering,
  sellReceipt,
  signInPinCode,
  type CheckboxReceipt,
  type CheckboxSellPayload,
} from './client.js';
import { mapSellPayload } from './payload.js';
import type { FiscalDocLine, FiscalRefundDoc, FiscalSaleDoc } from '../../types.js';

/* eslint-disable no-console */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', '__tests__', 'fixtures', 'checkbox');
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const RUN_DIR = path.join(FIXTURES_DIR, 'runs', `${RUN_ID}-weighed`);
const CLIENT_NAME = 'the-live-shop-pos';
const CLIENT_VERSION = String(POS_API_VERSION);
const MANUAL_MARK = 'вагу введено вручну';

const doGo = process.argv.slice(2).includes('--go');
const findings: string[] = [];

function save(name: string, body: unknown): void {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const file = typeof body === 'string' ? `${name}.txt` : `${name}.json`;
  fs.writeFileSync(
    path.join(RUN_DIR, file),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n'
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A line as `buildSaleDoc` makes it: grams are thousandths of the kilogram the price is for. */
function weighed(name: string, grams: number, pricePerKg: number, discount = 0): FiscalDocLine {
  return {
    name,
    quantityMilli: grams,
    unitPriceCents: pricePerKg,
    lineTotalCents: lineAmountCents(grams, pricePerKg, 1000) - discount,
    discountCents: discount,
    taxCode: null,
    barcode: null,
    uktzed: null,
    sourceLineRef: `weighed-${grams}-${pricePerKg}`,
    unit: 'кг',
  };
}

function pieces(name: string, quantity: number, price: number, discount = 0): FiscalDocLine {
  return {
    name,
    quantityMilli: quantity * 1000,
    unitPriceCents: price,
    lineTotalCents: quantity * price - discount,
    discountCents: discount,
    taxCode: null,
    barcode: null,
    uktzed: null,
    sourceLineRef: `pieces-${quantity}-${price}`,
    unit: 'шт',
  };
}

/**
 * A cash sale of `lines`, paid with a round note above the total: Checkbox
 * gives the change from ITS sum, so a kopeck of difference shows up in
 * `total_sum` and `total_rest` rather than as a refusal.
 */
function sale(name: string, lines: FiscalDocLine[], discountCents = 0): FiscalSaleDoc {
  const total = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return {
    kind: 'sale',
    requestId: crypto.randomUUID(),
    ourNumber: name,
    cashierName: 'Перевірка ваги',
    lines,
    payments: [{ method: 'cash', amountCents: Math.ceil((total + 1) / 10000) * 10000 }],
    totalCents: total,
    discountCents,
  };
}

/** The cart discount shared out the way `allocateCartDiscount` does: pro rata, the last line takes the rest. */
function shareCartDiscount(lines: FiscalDocLine[], discount: number): FiscalDocLine[] {
  const pre = lines.map((line) => lineAmountCents(line.quantityMilli, line.unitPriceCents, 1000));
  const sum = pre.reduce((a, b) => a + b, 0);
  let given = 0;
  return lines.map((line, i) => {
    const share = i === lines.length - 1 ? discount - given : Math.floor((discount * pre[i]) / sum);
    given += share;
    return { ...line, lineTotalCents: pre[i] - share, discountCents: share };
  });
}

function summary(receipt: CheckboxReceipt | null, doc: FiscalSaleDoc | FiscalRefundDoc): Record<string, unknown> {
  if (!receipt) return { receipt: null };
  const raw = receipt as unknown as { goods?: Array<{ sum?: number; quantity?: number }> };
  return {
    status: receipt.status,
    ours: { total: doc.totalCents, lines: doc.lines.map((line) => line.lineTotalCents) },
    theirs: {
      total_sum: receipt.total_sum ?? null,
      total_rest: receipt.total_rest ?? null,
      lines: (raw.goods ?? []).map((good) => good.sum ?? null),
    },
    agree:
      receipt.total_sum === doc.totalCents &&
      (raw.goods ?? []).every((good, i) => good.sum === doc.lines[i]?.lineTotalCents),
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
    console.log('\nDone (read-only). Add --go to ring the weighed receipts on the test register.');
    return;
  }
  if (!shift || shift.status !== 'OPENED') {
    console.error('--go needs an OPEN shift on the test register (open one from the кабінет first)');
    process.exit(3);
  }

  /** Send, wait for DONE, read it back with its text; `tweak` may touch the payload first. */
  async function ring(
    name: string,
    doc: FiscalSaleDoc | FiscalRefundDoc,
    tweak?: (payload: CheckboxSellPayload) => void
  ): Promise<CheckboxReceipt | null> {
    const payload = mapSellPayload(doc);
    tweak?.(payload);
    save(`${name}_request`, payload);
    try {
      const created = await sellReceipt(opts(), payload);
      let receipt: CheckboxReceipt | null = created;
      for (let i = 0; i < 20 && receipt?.status === 'CREATED'; i++) {
        await sleep(1500);
        receipt = await getReceipt(opts(), created.id);
      }
      save(`${name}_receipt`, receipt);
      const text = receipt ? await getReceiptRendering(opts(), receipt.id, 'text', { width: 42 }) : null;
      if (text && typeof text.body === 'string') save(`${name}_text`, text.body);
      const facts = {
        ...summary(receipt, doc),
        ...(text && typeof text.body === 'string'
          ? { prints_manual_mark: text.body.toLowerCase().includes(MANUAL_MARK) }
          : {}),
      };
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

  const cheese = () => weighed('Сир твердий', 350, 18990);
  const first = await ring('1_half_up_even_floor', sale('WEIGHED-1', [cheese()]));
  await ring('2_half_up_odd_floor', sale('WEIGHED-2', [weighed('Сир твердий', 250, 18990)]));
  await ring('3_plain_fraction', sale('WEIGHED-3', [weighed('Ковбаса', 1457, 5230)]));
  // 10 % of 66,47 is 6,65 — a line discount the till would compute the same way.
  await ring('4_line_discount', sale('WEIGHED-4', [weighed('Сир твердий', 350, 18990, 665)]));
  await ring(
    '5_mixed_cart_discount',
    sale(
      'WEIGHED-5',
      shareCartDiscount(
        [cheese(), weighed('Ковбаса', 1457, 5230), pieces('Хліб', 2, 4590)],
        1000
      ),
      1000
    )
  );
  if (first?.id && first.status === 'DONE') {
    const line = cheese();
    await ring('6_return_whole', {
      kind: 'refund',
      requestId: crypto.randomUUID(),
      ourNumber: 'WEIGHED-6',
      cashierName: 'Перевірка ваги',
      lines: [line],
      payments: [{ method: 'cash', amountCents: line.lineTotalCents }],
      totalCents: line.lineTotalCents,
      discountCents: 0,
      relatedProviderDocId: first.id,
      relatedOurNumber: 'WEIGHED-1',
    });
  }
  await ring('7_good_footer', sale('WEIGHED-7', [cheese()]), (payload) => {
    (payload.goods[0].good as unknown as Record<string, unknown>).footer = MANUAL_MARK;
  });

  save('run', { run_id: RUN_ID, finished_at: new Date().toISOString(), findings });
  console.log(`\nRun kept in ${path.relative(process.cwd(), RUN_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
