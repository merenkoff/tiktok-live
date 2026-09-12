// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type {
  FiscalActionResult,
  FiscalPublicConfig,
  FiscalRequisites,
  SaleDetail,
  SaleFiscalDoc,
} from '../types';
import type { ReceiptData, ReceiptFiscal, ReceiptHeader, ReceiptVatLine } from './printer';
import { refundLineAmount } from './money';

/**
 * What the builders need to know about the store: the trade name that tops
 * every receipt, and — for a fiscalising store — the provider-reported
 * requisites the header and fiscal block are printed from
 * (`auth.store.fiscal`, cached with the login so the till has it offline).
 */
export interface ReceiptStoreInfo {
  name: string;
  fiscal?: FiscalPublicConfig | null;
}

/** Рядок 4/5: «ПН <ІПН>» for a VAT payer, «ІД <податковий номер>» otherwise. */
export function taxIdLine(req: FiscalRequisites): string | null {
  const org = req.organization;
  if (org.is_vat && org.tax_number) return `ПН ${org.tax_number}`;
  const id = org.edrpou || org.tax_number;
  return id ? `ІД ${id}` : null;
}

/** Рядки 1–5 from the cached requisites; null when the store does not fiscalise or never fetched them. */
function headerOf(store: ReceiptStoreInfo): ReceiptHeader | null {
  const req = store.fiscal?.enabled ? store.fiscal.requisites : null;
  if (!req) return null;
  return {
    org_name: req.organization.name,
    point_name: req.point.name ?? req.register.title,
    address: req.point.address ?? req.register.address,
    tax_id_line: taxIdLine(req),
  };
}

/**
 * The rate every line is sold under. The store's «Код ставки за
 * замовчуванням» is what the sale was fiscalised with, so its letter wins;
 * the provider's own default is the fallback for a store that never set one.
 * Null outside a fiscal store.
 */
function defaultTax(store: ReceiptStoreInfo) {
  const req = store.fiscal?.enabled ? store.fiscal.requisites : null;
  if (!req) return null;
  const code = store.fiscal?.default_tax_code?.trim();
  return (
    (code ? req.taxes.find((t) => t.code === code) : undefined) ??
    req.taxes.find((t) => t.is_default) ??
    req.taxes[0] ??
    null
  );
}

/**
 * Рядок 21. Prices are VAT-inclusive, so the tax inside `total` is
 * `total × rate / (100 + rate)`; one line, because every position carries the
 * store's default letter today. Empty for a non-VAT rate.
 */
function vatLines(store: ReceiptStoreInfo, totalCents: number): ReceiptVatLine[] {
  const tax = defaultTax(store);
  if (!tax || tax.no_vat || tax.rate <= 0) return [];
  const amount = Math.round((Math.abs(totalCents) * tax.rate) / (100 + tax.rate));
  return [{ symbol: tax.symbol, rate: tax.rate, amount_cents: amount }];
}

/** Рядок 25: cash back — only when cash was taken and more than the total came in. */
function changeCents(
  payments: Array<{ method: string; amount_cents: number }>,
  totalCents: number
): number | null {
  const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const hasCash = payments.some((p) => p.method === 'cash');
  return hasCash && paid > totalCents ? paid - totalCents : null;
}

function producerOf(store: ReceiptStoreInfo): string | null {
  const provider = store.fiscal?.provider;
  if (!provider) return null;
  return provider === 'checkbox' ? 'ПРРО Checkbox' : `ПРРО ${provider}`;
}

/**
 * What the paper carries from a fiscal document, if anything.
 *
 * The till never reads `receipt_source` — the server only ships
 * `receipt_text` when the owner chose the provider's receipt AND it was
 * actually fetched, so "print it iff present" is exactly that setting with
 * the fetch-failed fallback built in.
 */
function fiscalParts(
  doc: SaleFiscalDoc | FiscalActionResult | null | undefined,
  store: ReceiptStoreInfo
): {
  provider_text: string | null;
  fiscal: ReceiptFiscal | null;
} {
  if (!doc || !doc.fiscal_code || !isPrintableFiscalDoc(doc)) {
    return { provider_text: null, fiscal: null };
  }
  const offline = doc.mode === 'offline';
  return {
    // An offline document never has provider text — there was no provider call
    // to fetch it from — so this falls back to our layout by construction.
    provider_text: doc.receipt_text?.trim() ? doc.receipt_text : null,
    fiscal: {
      fiscal_code: doc.fiscal_code,
      fiscal_date: doc.fiscal_date ? new Date(doc.fiscal_date).toLocaleString('uk-UA') : null,
      tax_url: doc.tax_url,
      offline,
      mode: offline ? 'offline' : 'online',
      control_number: doc.control_number ?? null,
      register_fiscal_number:
        store.fiscal?.register_fiscal_number ??
        store.fiscal?.requisites?.register.fiscal_number ??
        null,
      producer: producerOf(store),
    },
  };
}

/**
 * Does this document put a fiscal block on paper at all?
 *
 * `done` — yes, the ordinary case. `pending` + `mode: 'offline'` — also yes:
 * the fiscal number is a real tax-office code from the reserve, and the receipt
 * the customer is handed has to carry it together with the «ОФЛАЙН» mark. Any
 * other `pending` is a document still in flight with no number of its own, and
 * `failed` has nothing to print.
 */
function isPrintableFiscalDoc(doc: SaleFiscalDoc | FiscalActionResult): boolean {
  return doc.status === 'done' || (doc.status === 'pending' && doc.mode === 'offline');
}

/**
 * Is the fiscal block complete enough to hand the customer without a word?
 *
 * The till auto-prints only these. An offline receipt whose контрольне число
 * has not arrived yet is deliberately NOT complete: it is printable on demand
 * (the cashier presses «Друк чека» and knows what they are giving out), but
 * printing it automatically would quietly hand over a receipt missing a
 * required field. See TechDocs/POS_FISCAL_OFFLINE.md.
 */
export function fiscalBlockComplete(
  doc: SaleFiscalDoc | FiscalActionResult | null | undefined
): boolean {
  if (!doc || !doc.fiscal_code) return false;
  if (doc.status === 'done') return true;
  return doc.status === 'pending' && doc.mode === 'offline' && Boolean(doc.control_number);
}

export function buildReceiptPayload(
  sale: SaleDetail,
  store: ReceiptStoreInfo,
  customerName?: string | null
): ReceiptData {
  const tax = defaultTax(store);
  return {
    ...fiscalParts(sale.fiscal, store),
    header: headerOf(store),
    vat_lines: vatLines(store, sale.total_cents),
    change_cents: changeCents(sale.payments, sale.total_cents),
    store_name: store.name,
    kind: 'sale',
    receipt_number: sale.receipt_number,
    refund_of_receipt: null,
    created_at: new Date(sale.created_at).toLocaleString('uk-UA'),
    staff_name: sale.staff_name,
    customer_name: customerName ?? sale.customer_name ?? null,
    items: sale.items.map((item) => ({
      name: item.product_name,
      variant_label: item.variant_label,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      tax_symbol: tax?.symbol ?? null,
    })),
    subtotal_cents: sale.subtotal_cents,
    discount_cents: sale.cart_discount_cents ?? null,
    total_cents: sale.total_cents,
    payments: sale.payments.map((p) => ({ method: p.method, amount_cents: p.amount_cents })),
  };
}

/**
 * A refund is its own document, so it prints its own lines: only what came
 * back, priced at what was actually charged for those units, and the method
 * the money went out by — not the original sale's payments.
 */
export function buildRefundReceiptPayload(
  sale: SaleDetail,
  refund: SaleDetail['refunds'][number],
  lines: Array<{ sale_item_id: number; quantity: number }>,
  store: ReceiptStoreInfo,
  /** The REFUND's own fiscal document, from the refund response — never the sale's. */
  fiscal?: FiscalActionResult | null
): ReceiptData {
  const tax = defaultTax(store);
  const byId = new Map(sale.items.map((item) => [item.id, item]));
  const items = lines.flatMap((line) => {
    const item = byId.get(line.sale_item_id);
    if (!item) return [];
    // `refunded_quantity` already includes this refund, so step back over it to
    // price these units exactly as the server did.
    const before = item.refunded_quantity - line.quantity;
    const amount = refundLineAmount(
      item.line_total_cents,
      item.quantity,
      Math.max(0, before),
      line.quantity
    );
    return [
      {
        name: item.product_name,
        variant_label: item.variant_label,
        quantity: line.quantity,
        unit_price_cents: Math.round(amount / line.quantity),
        line_total_cents: amount,
        tax_symbol: tax?.symbol ?? null,
      },
    ];
  });

  return {
    ...fiscalParts(fiscal, store),
    header: headerOf(store),
    vat_lines: vatLines(store, refund.total_cents),
    // Money goes out, never back to the customer as change.
    change_cents: null,
    store_name: store.name,
    kind: 'refund',
    receipt_number: refund.refund_number ?? `RF-${refund.id}`,
    refund_of_receipt: sale.receipt_number,
    created_at: new Date(refund.created_at).toLocaleString('uk-UA'),
    staff_name: refund.staff_name,
    customer_name: sale.customer_name ?? null,
    items,
    subtotal_cents: refund.total_cents,
    discount_cents: null,
    total_cents: refund.total_cents,
    payments: refund.method ? [{ method: refund.method, amount_cents: refund.total_cents }] : [],
  };
}
