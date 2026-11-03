// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/types.ts
//
// A fiscal check in the ДПС document format, as the fields are named in the
// tax office's own XML (TechDocs/prro/dps/examples/, «Опис всіх елементів»).
// Cashalot's WEB API takes exactly this as the `Check` of `RegisterCheck`
// (TechDocs/prro/cashalot/sources/webapi-2.1.0.8034.md), and an own ПРРО would
// serialise the same object to XML. Only the fields we actually send are here.
//
// Money in these objects is hryvnias with two decimals and quantities have
// three — the format's own units. Everything that computes them works in
// integer kopecks and thousandths and converts only at the edge (`money.ts`).

/** `CHECKHEAD.DOCTYPE` by name — Cashalot takes names, the XML takes numbers. */
export type DpsDocType = 'SaleGoods';

/** `CHECKHEAD.DOCSUBTYPE`: 0 / 1 / 2 / 4 of the ДПС list. */
export type DpsDocSubType = 'CheckGoods' | 'CheckReturn' | 'ServiceDeposit' | 'ServiceIssue';

/** One row of the store's tax table (`config.taxes` of a ДПС provider). */
export interface DpsTaxRate {
  /** Cyrillic, one letter: «А», «Б», … — what Положення № 13 prints. */
  letter: string;
  /** «ПДВ». */
  name: string;
  /** `CHECKTAX.TYPE`: 0 = ПДВ. The only kind v1 knows (no excise, no tax on top). */
  type: 0;
  /** Percent, e.g. 20 or 7. */
  rate: number;
}

export interface DpsCheckHead {
  DOCTYPE: DpsDocType;
  DOCSUBTYPE: DpsDocSubType;
  UID?: string;
  CASHIER?: string;
  /** A return: the fiscal number of the receipt it returns against. */
  ORDERRETNUM?: string;
  /** A test document: fiscal number assigned, not fiscal. */
  TESTING?: boolean;
}

export interface DpsCheckTotal {
  /** What the customer pays — after cash rounding when there is one. */
  SUM: number;
  DISCOUNTSUM?: number;
  /** Cash rounding, signed so that `SUM + RNDSUM = NORNDSUM` (example «Заокруглення»). */
  RNDSUM?: number;
  /** The total before rounding — what the goods came to. */
  NORNDSUM?: number;
}

export interface DpsPayRow {
  PAYFORMCD: number;
  PAYFORMNM: string;
  /** What this form pays of the check. */
  SUM: number;
  /** Cash handed over, when it is more than `SUM`. */
  PROVIDED?: number;
  /** The change, when there is any. */
  REMAINS?: number;
}

export interface DpsTaxRow {
  TYPE: number;
  NAME: string;
  LETTER: string;
  PRC: number;
  /** A tax not included in the price — never, in v1. */
  SIGN: boolean;
  /** Σ `COST` of the letter's lines, before discounts. */
  TURNOVER: number;
  /** The base the tax is computed from: Σ (`COST` − `DISCOUNTSUM`). */
  SOURCESUM: number;
  SUM: number;
}

export interface DpsBodyRow {
  CODE: string;
  NAME: string;
  BARCODE?: string;
  UKTZED?: string;
  UNITCD?: number;
  UNITNM?: string;
  AMOUNT: number;
  PRICE: number;
  LETTERS?: string;
  /** `PRICE × AMOUNT` — before the discount, which is its own field. */
  COST: number;
  /** 0 = a sum discount. */
  DISCOUNTTYPE?: 0;
  DISCOUNTSUM?: number;
}

export interface DpsCheck {
  CHECKHEAD: DpsCheckHead;
  CHECKTOTAL: DpsCheckTotal;
  CHECKPAY?: DpsPayRow[];
  CHECKTAX?: DpsTaxRow[];
  CHECKBODY?: DpsBodyRow[];
}

export interface DpsCheckOptions {
  /** The store's tax table; empty = a seller who is not a VAT payer (no `CHECKTAX`, no `LETTERS`). */
  taxes: readonly DpsTaxRate[];
  /** Mark the document `TESTING` — a test shift accepts nothing else, a fiscal one refuses it. */
  testing?: boolean;
  /** A copy of the request's `UID` in `CHECKHEAD`, for finding the document again. */
  uid?: string | null;
}
