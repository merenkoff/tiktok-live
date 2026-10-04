// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The «Акт про видачу коштів» — what Порядок № 547 (розд. ІІІ п. 8) wants on
// paper when more than 100 ₴ is handed back: who the buyer is (by their
// document), what came back, how much was issued, and the number, date and
// time of the receipt it was bought on. Pure: the dialog, the receipt card
// and the tests build the same sheet from the same facts.

import type { FiscalPublicConfig, SaleDetail } from '@pos/platform';
import { RETURNED_BY_UK } from './refundReasons';

export interface ActGoodsLine {
  name: string;
  label: string;
  quantity: number;
  amount_cents: number;
}

export interface ActData {
  /** Trade name on top; the legal lines below it come from the ПРРО requisites when the store has them. */
  store_name: string;
  org_name: string | null;
  address: string | null;
  tax_id_line: string | null;
  /** The refund's own number doubles as the act's — one document, one number. */
  act_number: string;
  act_date: string;
  buyer_name: string | null;
  buyer_document: string | null;
  goods: ActGoodsLine[];
  total_cents: number;
  /** «готівкою» / «на платіжну картку» / … ; null on a refund that recorded no method. */
  returned_by: string | null;
  original: {
    receipt_number: string;
    date: string;
    time: string;
    /** The sale receipt's fiscal number, when the store fiscalises. */
    fiscal_code: string | null;
  };
  /** The return receipt's fiscal number, when it was registered. */
  refund_fiscal_code: string | null;
  cashier: string;
}

export interface ActStoreInfo {
  name: string;
  fiscal?: FiscalPublicConfig | null;
}

type Refund = SaleDetail['refunds'][number];

/** Рядок 4/5 of a receipt, reused on the act: «ПН <ІПН>» for a VAT payer, «ІД <номер>» otherwise. */
function taxIdLine(store: ActStoreInfo): string | null {
  const req = store.fiscal?.enabled ? store.fiscal.requisites : null;
  if (!req) return null;
  const org = req.organization;
  if (org.is_vat && org.tax_number) return `ПН ${org.tax_number}`;
  const id = org.edrpou || org.tax_number;
  return id ? `ІД ${id}` : null;
}

export function buildActPayload(
  sale: SaleDetail,
  refund: Refund,
  store: ActStoreInfo,
  /** The refund's fiscal number when it is known from the immediate response rather than the re-read refund. */
  refundFiscalCode?: string | null
): ActData {
  const req = store.fiscal?.enabled ? store.fiscal.requisites : null;
  const byId = new Map(sale.items.map((item) => [item.id, item]));
  const goods: ActGoodsLine[] = (refund.items ?? []).flatMap((line) => {
    const item = byId.get(line.sale_item_id);
    if (!item) return [];
    return [
      {
        name: item.product_name,
        label: item.variant_label,
        quantity: line.quantity,
        amount_cents: line.line_total_cents,
      },
    ];
  });
  const bought = new Date(sale.created_at);
  return {
    store_name: store.name,
    org_name: req?.organization.name ?? null,
    address: req?.point.address ?? req?.register.address ?? null,
    tax_id_line: taxIdLine(store),
    act_number: refund.refund_number ?? `RF-${refund.id}`,
    act_date: new Date(refund.created_at).toLocaleDateString('uk-UA'),
    buyer_name: refund.buyer_name?.trim() || null,
    buyer_document: refund.buyer_document?.trim() || null,
    goods,
    total_cents: refund.total_cents,
    returned_by: refund.method ? RETURNED_BY_UK[refund.method] : null,
    original: {
      receipt_number: sale.receipt_number,
      date: bought.toLocaleDateString('uk-UA'),
      time: bought.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
      fiscal_code: sale.fiscal?.fiscal_code ?? null,
    },
    refund_fiscal_code: refundFiscalCode ?? refund.fiscal?.fiscal_code ?? null,
    cashier: refund.staff_name,
  };
}
