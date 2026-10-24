// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/check.ts
//
// Our fiscal documents (`../types.ts`) → a check in the ДПС format.
//
// The rules come from the official examples (TechDocs/prro/dps/examples/,
// read in TechDocs/prro/dps/document-structures.md) and Cashalot's answers:
// - a line's `COST` is `PRICE × AMOUNT` BEFORE its discount, which is its own
//   `DISCOUNTSUM` (example «Знижки»: 100.00 at −50 % is COST 100.00, DISCOUNTSUM
//   50.00) — the same derived discount the Checkbox payload sends;
// - `CHECKTOTAL.SUM` is what the customer pays; with cash rounding it is the
//   rounded sum, `NORNDSUM` the goods' total and `RNDSUM` the difference signed
//   so that `SUM + RNDSUM = NORNDSUM` (example «Заокруглення»: 12.60, 12.57, −0.03);
// - the cash row pays what is left of `SUM` after the cashless rows, with
//   `PROVIDED`/`REMAINS` when more was handed over;
// - a return names the receipt it returns against in `ORDERRETNUM`.
//
// Every check that can be made before sending is made here and refused as
// `rejected`: the document then never left, so the sale may be voided rather
// than kept as «maybe fiscalised».

import { FiscalError } from '../errors.js';
import type {
  FiscalDocLine,
  FiscalDocPayment,
  FiscalRefundDoc,
  FiscalSaleDoc,
  FiscalServiceDoc,
} from '../types.js';
import { toAmount, toUah } from './money.js';
import { payForm } from './payments.js';
import { computeCheckTax, resolveLetter, type DpsTaxedLine } from './taxes.js';
import type {
  DpsBodyRow,
  DpsCheck,
  DpsCheckHead,
  DpsCheckOptions,
  DpsCheckTotal,
  DpsDocSubType,
  DpsPayRow,
} from './types.js';
import { unitFields } from './units.js';

const MAX_NAME = 128;
const MAX_CODE = 64;
const MAX_CASHIER = 128;

/** What a built check says besides itself — the VAT the adapter reports as `vatCents`. */
export interface DpsBuiltCheck {
  check: DpsCheck;
  vatCents: number;
}

function head(subType: DpsDocSubType, cashierName: string, opts: DpsCheckOptions): DpsCheckHead {
  const cashier = cashierName.trim().slice(0, MAX_CASHIER);
  return {
    DOCTYPE: 'SaleGoods',
    DOCSUBTYPE: subType,
    ...(opts.uid ? { UID: opts.uid } : {}),
    ...(cashier ? { CASHIER: cashier } : {}),
    ...(opts.testing ? { TESTING: true } : {}),
  };
}

/** A line's cost before its discount, in kopecks — integer today (whole units), rounded to be safe. */
function costOf(line: FiscalDocLine): number {
  return Math.round((line.unitPriceCents * line.quantityMilli) / 1000);
}

function body(
  lines: readonly FiscalDocLine[],
  opts: DpsCheckOptions
): { rows: DpsBodyRow[]; taxed: DpsTaxedLine[]; discountCents: number } {
  const rows: DpsBodyRow[] = [];
  const taxed: DpsTaxedLine[] = [];
  let discountCents = 0;

  for (const line of lines) {
    const name = line.name.trim().slice(0, MAX_NAME);
    const cost = costOf(line);
    const discount = cost - line.lineTotalCents;
    if (discount < 0) {
      throw new FiscalError(
        `Рядок «${name}»: сума ${line.lineTotalCents} більша за ціну × кількість ${cost}`,
        'rejected'
      );
    }

    let letters: string | undefined;
    if (opts.taxes.length > 0) {
      const rate = resolveLetter(line.taxCode, opts.taxes);
      if (!rate) {
        throw new FiscalError(
          line.taxCode
            ? `Рядок «${name}»: ставки «${line.taxCode}» немає в таблиці податків ПРРО`
            : `Рядок «${name}» без ставки податку — задайте код ставки за замовчуванням`,
          'rejected'
        );
      }
      letters = rate.letter;
      taxed.push({ letter: rate.letter, costCents: cost, discountCents: discount });
    }

    discountCents += discount;
    const code = (line.barcode ?? line.sourceLineRef ?? name).trim().slice(0, MAX_CODE);
    rows.push({
      CODE: code,
      NAME: name,
      ...(line.barcode ? { BARCODE: line.barcode } : {}),
      ...(line.uktzed ? { UKTZED: line.uktzed } : {}),
      ...unitFields(line.unit),
      AMOUNT: toAmount(line.quantityMilli),
      PRICE: toUah(line.unitPriceCents),
      ...(letters ? { LETTERS: letters } : {}),
      COST: toUah(cost),
      ...(discount > 0 ? { DISCOUNTTYPE: 0 as const, DISCOUNTSUM: toUah(discount) } : {}),
    });
  }
  return { rows, taxed, discountCents };
}

/**
 * The payment rows for a check that must collect `dueCents`.
 *
 * Cashless rows go as they are. Cash is one row paying the rest of the sum;
 * what was handed over beyond it is `PROVIDED` with the change in `REMAINS`.
 * Refused: cashless above the sum, cash short of the rest, cash with nothing
 * left to pay.
 */
function payRows(payments: readonly FiscalDocPayment[], dueCents: number): DpsPayRow[] {
  const cashless = payments.filter((p) => p.method !== 'cash');
  const cashlessTotal = cashless.reduce((sum, p) => sum + p.amountCents, 0);
  const tendered = payments
    .filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amountCents, 0);

  if (cashlessTotal > dueCents) {
    throw new FiscalError(
      `Безготівкові оплати ${cashlessTotal} більші за суму чека ${dueCents}`,
      'rejected'
    );
  }
  const cashDue = dueCents - cashlessTotal;
  if (tendered < cashDue) {
    throw new FiscalError(`Оплат ${cashlessTotal + tendered} менше за суму чека ${dueCents}`, 'rejected');
  }
  if (cashDue === 0 && tendered > 0) {
    throw new FiscalError('Готівка в чеку, сума якого вже сплачена безготівково', 'rejected');
  }

  const rows: DpsPayRow[] = cashless.map((p) => ({ ...payForm(p.method), SUM: toUah(p.amountCents) }));
  if (cashDue > 0) {
    rows.unshift({
      ...payForm('cash'),
      SUM: toUah(cashDue),
      ...(tendered > cashDue
        ? { PROVIDED: toUah(tendered), REMAINS: toUah(tendered - cashDue) }
        : {}),
    });
  }
  return rows;
}

function totals(
  goodsCents: number,
  discountCents: number,
  roundingCents: number
): DpsCheckTotal {
  return {
    SUM: toUah(goodsCents + roundingCents),
    ...(discountCents > 0 ? { DISCOUNTSUM: toUah(discountCents) } : {}),
    ...(roundingCents !== 0
      ? { RNDSUM: toUah(-roundingCents), NORNDSUM: toUah(goodsCents) }
      : {}),
  };
}

function goodsCheck(
  subType: 'CheckGoods' | 'CheckReturn',
  doc: FiscalSaleDoc | FiscalRefundDoc,
  opts: DpsCheckOptions,
  extraHead: Partial<DpsCheckHead>
): DpsBuiltCheck {
  if (doc.lines.length === 0) throw new FiscalError('Чек без рядків', 'rejected');
  const { rows, taxed, discountCents } = body(doc.lines, opts);
  const goods = doc.lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  if (goods !== doc.totalCents) {
    throw new FiscalError(`Рядки чека дають ${goods}, а сума документа ${doc.totalCents}`, 'rejected');
  }
  const rounding = doc.cashRounding?.amountCents ?? 0;
  const tax = opts.taxes.length > 0 ? computeCheckTax(taxed, opts.taxes) : { rows: [], vatCents: 0 };

  return {
    check: {
      CHECKHEAD: { ...head(subType, doc.cashierName, opts), ...extraHead },
      CHECKTOTAL: totals(goods, discountCents, rounding),
      CHECKPAY: payRows(doc.payments, goods + rounding),
      ...(tax.rows.length > 0 ? { CHECKTAX: tax.rows } : {}),
      CHECKBODY: rows,
    },
    vatCents: tax.vatCents,
  };
}

/** A sale — `DOCSUBTYPE CheckGoods`. */
export function buildSaleCheck(doc: FiscalSaleDoc, opts: DpsCheckOptions): DpsBuiltCheck {
  return goodsCheck('CheckGoods', doc, opts, {});
}

/** A return — `DOCSUBTYPE CheckReturn` against the fiscal number of the sale. */
export function buildRefundCheck(doc: FiscalRefundDoc, opts: DpsCheckOptions): DpsBuiltCheck {
  const original = doc.relatedProviderDocId.trim();
  if (!original) throw new FiscalError('Повернення без фіскального номера продажу', 'rejected');
  return goodsCheck('CheckReturn', doc, opts, { ORDERRETNUM: original });
}

/** Службове внесення / видача — only the sum, no lines and no payments (example «Службове внесення»). */
export function buildServiceCheck(doc: FiscalServiceDoc, opts: DpsCheckOptions): DpsBuiltCheck {
  if (doc.amountCents <= 0) throw new FiscalError('Сума службового чека має бути більшою за нуль', 'rejected');
  return {
    check: {
      CHECKHEAD: head(doc.kind === 'service_in' ? 'ServiceDeposit' : 'ServiceIssue', doc.cashierName, opts),
      CHECKTOTAL: { SUM: toUah(doc.amountCents) },
    },
    vatCents: 0,
  };
}
