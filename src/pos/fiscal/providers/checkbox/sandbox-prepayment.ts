// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/sandbox-prepayment.ts
//
// Manual check of Checkbox's prepayment chains — step 2 of paying a debt in
// parts (TechDocs/grocery/G3_DEBTS.md §11, «Крок 2»). Not a test: it rings
// real receipts on a TEST register (the licence key must start with "test")
// and keeps every answer — and every receipt's text — under
// src/__tests__/fixtures/checkbox/runs/<timestamp>-prepayment/, so the open
// questions of the design are answered by what the sandbox said, not by the
// wiki (TechDocs/prro/checkbox/api/prepayment.md).
//
//   CHECKBOX_SANDBOX_LICENSE_KEY=test… CHECKBOX_SANDBOX_PIN=… \
//     npm run fiscal:sandbox:prepayment -- --go [--across-shifts]
//
//   (no flags)  read-only: the cashier and whether a shift is open
//   --go        five chains (a closed shift is opened first — a test register only):
//     A «Кепка» 1 × 590,00 — the case that started step 1: 300,00 in cash,
//       then 100,00 more on the same chain (a second prepayment?), then a
//       round note for what is left (does an after-payment give change?), a
//       payment on a paid chain, the opening sent again under the same id, and
//       the whole chain returned (three return receipts?)
//     B «Хліб» 2 × 45,90 with a 9,18 line discount — 50,00 by card (a line
//       discount inside a chain's goods), then the chain returned at once:
//       undoing a «внесок» is returning a chain of one prepayment
//     C «Перевірка заокруглення» 221,23 — 100,00 in cash, then the 121,23
//       left in cash under ROUND_50, paid as 121,00 (our rule rounds the cash
//       part, −0,23): does that close the chain, or become one more
//       prepayment that leaves 0,23 open? The chain returned under ROUND_50
//     E the same goods, the 121,23 sent unrounded under ROUND_50 — does
//       Checkbox round an after-payment itself?
//     D «Сир твердий» 0,350 кг × 189,90 — 30,00 in cash, then by card what
//       OUR arithmetic says is left (66,47 − 30,00 = 36,47): a weighed line's
//       sum inside a chain (Д8); Checkbox's own `left_to_pay` if refused
//   --across-shifts  close the shift after chain A's first prepayment and open
//       a new one before the second — a debt is paid off over weeks
//
// Goods go through `mapSellPayload` — the function the adapter uses for a
// sale — so a chain is opened for exactly the goods a receipt would carry.

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_API_VERSION } from '../../../version.js';
import { lineAmountCents } from '../../../lineMoney.js';
import { cashRoundingDelta } from '../../../cashRounding.js';
import {
  CheckboxApiError,
  closeShiftRequest,
  getCurrentShift,
  getMe,
  getPrepaymentRelation,
  getReceipt,
  getReceiptRendering,
  openShiftRequest,
  prepaymentChainReceipt,
  prepaymentReceipt,
  returnPrepaymentChain,
  signInPinCode,
  type CheckboxChainPaymentPayload,
  type CheckboxChainReturnPayload,
  type CheckboxGoodItemPayload,
  type CheckboxPayment,
  type CheckboxPrepaymentPayload,
  type CheckboxPrepaymentRelation,
  type CheckboxReceipt,
} from './client.js';
import { mapSellPayload } from './payload.js';
import type { FiscalDocLine } from '../../types.js';

/* eslint-disable no-console */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', '__tests__', 'fixtures', 'checkbox');
const RUN_ID = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
const RUN_DIR = path.join(FIXTURES_DIR, 'runs', `${RUN_ID}-prepayment`);
const CLIENT_NAME = 'the-live-shop-pos';
const CLIENT_VERSION = String(POS_API_VERSION);
const CASHIER = 'Перевірка передплати';

const args = process.argv.slice(2);
const doGo = args.includes('--go');
const acrossShifts = args.includes('--across-shifts');
const findings: string[] = [];

function save(name: string, body: unknown): void {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const file = typeof body === 'string' ? `${name}.txt` : `${name}.json`;
  fs.writeFileSync(
    path.join(RUN_DIR, file),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n'
  );
}

function note(name: string, facts: unknown): void {
  console.log(`\n== ${name}\n${JSON.stringify(facts, null, 2)}`);
  findings.push(`${name}: ${JSON.stringify(facts)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Grams are thousandths of the kilogram the price is for, as `buildSaleDoc` makes them. */
function weighed(name: string, grams: number, pricePerKg: number): FiscalDocLine {
  return {
    name,
    quantityMilli: grams,
    unitPriceCents: pricePerKg,
    lineTotalCents: lineAmountCents(grams, pricePerKg, 1000),
    discountCents: 0,
    taxCode: null,
    barcode: null,
    uktzed: null,
    sourceLineRef: `weighed-${grams}-${pricePerKg}`,
    unit: 'кг',
  };
}

/** The goods a sale of these lines would carry — through the adapter's own mapping. */
function goodsOf(lines: FiscalDocLine[]): CheckboxGoodItemPayload[] {
  const total = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return mapSellPayload({
    kind: 'sale',
    requestId: crypto.randomUUID(),
    ourNumber: 'goods',
    cashierName: CASHIER,
    lines,
    payments: [{ method: 'cash', amountCents: total }],
    totalCents: total,
    discountCents: 0,
  }).goods;
}

const cash = (value: number): CheckboxPayment => ({ type: 'CASH', value });
const card = (value: number): CheckboxPayment => ({ type: 'CASHLESS', value });
/** The smallest round note above a sum — what a customer hands over, so change is due. */
const noteAbove = (cents: number) => Math.ceil((cents + 1) / 10000) * 10000;

function receiptFacts(receipt: CheckboxReceipt): Record<string, unknown> {
  const raw = receipt as unknown as {
    type?: string;
    goods?: Array<{ good?: { name?: string; price?: number }; quantity?: number; sum?: number }>;
    discounts?: Array<{ type?: string; sum?: number; name?: string }>;
    related_receipt_id?: string | null;
  };
  return {
    status: receipt.status,
    type: raw.type ?? null,
    relation: receipt.pre_payment_relation_id ?? null,
    fiscal_code: receipt.fiscal_code ?? null,
    tax_url: receipt.tax_url != null,
    total_sum: receipt.total_sum ?? null,
    total_payment: receipt.total_payment ?? null,
    total_rest: receipt.total_rest ?? null,
    round_sum: receipt.round_sum ?? null,
    goods: (raw.goods ?? []).map((g) => `${g.good?.name} × ${g.quantity} @ ${g.good?.price} = ${g.sum}`),
    discounts: (raw.discounts ?? []).map((d) => `${d.type} ${d.sum} «${d.name ?? ''}»`),
    related_receipt_id: raw.related_receipt_id ?? null,
  };
}

function relationFacts(relation: CheckboxPrepaymentRelation | null): Record<string, unknown> {
  if (!relation) return { relation: null };
  return {
    status: relation.pre_payment_status,
    paid_sum: relation.paid_sum,
    total_sum: relation.total_sum,
    left_to_pay: relation.left_to_pay ?? null,
    prepayments: relation.receipt_chain.pre_payment_receipts.length,
    after_payment: relation.receipt_chain.after_payment_receipt ?? null,
    returned: relation.receipt_chain.returned_receipts?.length ?? 0,
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
    console.log('\nDone (read-only). Add --go to ring the five chains on the test register.');
    return;
  }
  if (!shift || shift.status !== 'OPENED') {
    // A test register only (checked above), so opening a shift costs nothing —
    // and spares whoever runs this a trip to the кабінет.
    await openShiftRequest(opts());
    let current = await getCurrentShift(opts());
    for (let i = 0; i < 60 && current?.status !== 'OPENED'; i++) {
      await sleep(3000);
      current = await getCurrentShift(opts());
    }
    if (current?.status !== 'OPENED') {
      console.error(`Could not open a shift on the test register (status: ${current?.status ?? 'none'})`);
      process.exit(3);
    }
    note('shift opened', { status: current.status });
  }

  /** Wait until a receipt leaves CREATED, keep it and its text, note what it says. */
  async function settle(name: string, created: CheckboxReceipt): Promise<CheckboxReceipt | null> {
    let receipt: CheckboxReceipt | null = created;
    for (let i = 0; i < 20 && receipt?.status === 'CREATED'; i++) {
      await sleep(1500);
      receipt = await getReceipt(opts(), created.id);
    }
    save(`${name}_receipt`, receipt);
    if (!receipt) {
      note(name, { receipt: null });
      return null;
    }
    const text = await getReceiptRendering(opts(), receipt.id, 'text', { width: 42 }).catch(() => null);
    if (text && typeof text.body === 'string') save(`${name}_text`, text.body);
    note(name, receiptFacts(receipt));
    return receipt;
  }

  /** One chain call; a refusal is a finding, kept with its code, not a crash. */
  async function step(
    name: string,
    request: unknown,
    send: () => Promise<CheckboxReceipt>
  ): Promise<CheckboxReceipt | null> {
    save(`${name}_request`, request);
    try {
      return await settle(name, await send());
    } catch (error) {
      if (error instanceof CheckboxApiError) {
        save(`${name}_error`, { status: error.status, code: error.code, body: error.body });
        note(name, { refused: error.status, code: error.code, body: error.body });
        return null;
      }
      throw error;
    }
  }

  /**
   * Open a chain under our own `custom_relation_id`; if Checkbox refuses the
   * opening, once more without it, so one refused field does not cost the
   * whole chain's answers.
   */
  async function open(name: string, lines: FiscalDocLine[], payments: CheckboxPayment[], customId: string) {
    const payload: CheckboxPrepaymentPayload = {
      id: crypto.randomUUID(),
      cashier_name: CASHIER,
      goods: goodsOf(lines),
      payments,
      custom_relation_id: customId,
    };
    let receipt = await step(name, payload, () => prepaymentReceipt(opts(), payload));
    if (!receipt) {
      const plain: CheckboxPrepaymentPayload = { ...payload, id: crypto.randomUUID() };
      delete plain.custom_relation_id;
      receipt = await step(`${name}_without_custom_id`, plain, () => prepaymentReceipt(opts(), plain));
    }
    const relationId = receipt?.pre_payment_relation_id ?? null;
    if (relationId) note(`${name} — relation id`, { ours: customId, theirs: relationId, same: relationId === customId });
    return { payload, receipt, relationId };
  }

  function pay(name: string, relationId: string, body: Omit<CheckboxChainPaymentPayload, 'id'>) {
    const payload: CheckboxChainPaymentPayload = { id: crypto.randomUUID(), cashier_name: CASHIER, ...body };
    return step(name, payload, () => prepaymentChainReceipt(opts(), relationId, payload));
  }

  async function relation(name: string, relationId: string): Promise<CheckboxPrepaymentRelation | null> {
    try {
      const info = await getPrepaymentRelation(opts(), relationId);
      save(`${name}_relation`, info);
      note(name, relationFacts(info));
      return info;
    } catch (error) {
      if (error instanceof CheckboxApiError) {
        save(`${name}_error`, { status: error.status, code: error.code, body: error.body });
        note(name, { refused: error.status, code: error.code });
        return null;
      }
      throw error;
    }
  }

  async function returnChain(name: string, relationId: string, body: CheckboxChainReturnPayload = {}) {
    const payload: CheckboxChainReturnPayload = { cashier_name: CASHIER, ...body };
    save(`${name}_request`, payload);
    try {
      const receipts = await returnPrepaymentChain(opts(), relationId, payload);
      note(name, { return_receipts: receipts.length });
      for (const [i, receipt] of receipts.entries()) await settle(`${name}_${i + 1}`, receipt);
    } catch (error) {
      if (error instanceof CheckboxApiError) {
        save(`${name}_error`, { status: error.status, code: error.code, body: error.body });
        note(name, { refused: error.status, code: error.code, body: error.body });
        return;
      }
      throw error;
    }
  }

  /** A debt is paid off over weeks: the chain must outlive the shift it was opened in. */
  async function breakShift(): Promise<void> {
    console.log('\n-- closing the shift (Z-report) and opening a new one');
    await closeShiftRequest(opts());
    for (let i = 0; i < 60 && (await getCurrentShift(opts())) != null; i++) await sleep(3000);
    await openShiftRequest(opts());
    let current = await getCurrentShift(opts());
    for (let i = 0; i < 60 && current?.status !== 'OPENED'; i++) {
      await sleep(3000);
      current = await getCurrentShift(opts());
    }
    note('shift break', { reopened: current?.status ?? null });
  }

  // ── A: the cap — 300 now, 100 later, the rest with change ─────────────────
  const a = await open('A1_open_300_cash', [pieces('Кепка', 1, 59000)], [cash(30000)], `ls-sbx-${RUN_ID}-a`);
  if (a.relationId) {
    await relation('A2_after_open', a.relationId);
    if (acrossShifts) await breakShift();
    await pay('A3_second_prepayment_100_cash', a.relationId, { payments: [cash(10000)] });
    const left = (await relation('A4_after_second', a.relationId))?.left_to_pay ?? 0;
    if (left > 0) {
      const closed = await pay('A5_rest_with_a_note', a.relationId, { payments: [cash(noteAbove(left))] });
      if (!closed) await pay('A5b_rest_exact', a.relationId, { payments: [cash(left)] });
    }
    await relation('A6_after_closing', a.relationId);
    await pay('A7_pay_a_paid_chain', a.relationId, { payments: [cash(1000)] });
    await step('A8_open_again_same_id', a.payload, () => prepaymentReceipt(opts(), a.payload));
    await returnChain('A9_return_whole_chain', a.relationId);
    await relation('A10_after_return', a.relationId);
  }

  // ── B: a line discount in the goods; undo = return a chain of one ─────────
  const b = await open('B1_open_50_card', [pieces('Хліб', 2, 4590, 918)], [card(5000)], `ls-sbx-${RUN_ID}-b`);
  if (b.relationId) {
    await relation('B2_after_open', b.relationId);
    await returnChain('B3_return_single_prepayment', b.relationId);
    await relation('B4_after_return', b.relationId);
    await pay('B5_pay_a_returned_chain', b.relationId, { payments: [card(3262)] });
  }

  // ── C, E: cash rounding on the after-payment ──────────────────────────────
  // C sends what our rule says the customer hands over (121,23 → 121,00 under
  // ROUND_50, the rounded sum Checkbox asks for on a sale); E sends the
  // unrounded rest and leaves the rounding to Checkbox. If C's 121,00 is taken
  // for one more prepayment, the chain stays open on 0,23 — C4 says so.
  const roundingLine = () => pieces('Перевірка заокруглення', 1, 22123);
  const c = await open('C1_open_100_cash', [roundingLine()], [cash(10000)], `ls-sbx-${RUN_ID}-c`);
  if (c.relationId) {
    const left = (await relation('C2_after_open', c.relationId))?.left_to_pay ?? 12123;
    const rounded = await pay('C3_rest_cash_rounded_round50', c.relationId, {
      payments: [cash(left + cashRoundingDelta(left, 50))],
      rounding_mode: 'ROUND_50',
    });
    const after = await relation('C4_after_rounded', c.relationId);
    const still = after?.left_to_pay ?? 0;
    note('C4 — closed by the rounded sum?', {
      receipt: rounded != null,
      status: after?.pre_payment_status ?? null,
      left_to_pay: still,
    });
    if (still > 0) {
      await pay('C5_rest_exact', c.relationId, { payments: [cash(still)] });
      await relation('C6_after_closing', c.relationId);
    }
    await returnChain('C7_return_round50', c.relationId, { rounding_mode: 'ROUND_50' });
  }
  const e = await open('E1_open_100_cash', [roundingLine()], [cash(10000)], `ls-sbx-${RUN_ID}-e`);
  if (e.relationId) {
    const left = (await relation('E2_after_open', e.relationId))?.left_to_pay ?? 12123;
    await pay('E3_rest_cash_unrounded_round50', e.relationId, {
      payments: [cash(left)],
      rounding_mode: 'ROUND_50',
    });
    const after = await relation('E4_after_closing', e.relationId);
    if ((after?.left_to_pay ?? 0) > 0) {
      await pay('E5_rest_exact', e.relationId, { payments: [cash(after?.left_to_pay ?? 0)] });
    }
    await returnChain('E6_return', e.relationId);
  }

  // ── D: a weighed line — whose sum is the chain's total? ───────────────────
  const cheese = weighed('Сир твердий', 350, 18990);
  const d = await open('D1_open_30_cash', [cheese], [cash(3000)], `ls-sbx-${RUN_ID}-d`);
  if (d.relationId) {
    const info = await relation('D2_after_open', d.relationId);
    note('D2 — sums', { ours_total: cheese.lineTotalCents, theirs_total: info?.total_sum ?? null });
    const ours = await pay('D3_rest_card_ours', d.relationId, { payments: [card(cheese.lineTotalCents - 3000)] });
    if (!ours && info?.left_to_pay) await pay('D3b_rest_card_theirs', d.relationId, { payments: [card(info.left_to_pay)] });
    await relation('D4_after_closing', d.relationId);
    await returnChain('D5_return', d.relationId);
  }

  save('run', { run_id: RUN_ID, across_shifts: acrossShifts, finished_at: new Date().toISOString(), findings });
  console.log(`\nRun kept in ${path.relative(process.cwd(), RUN_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
