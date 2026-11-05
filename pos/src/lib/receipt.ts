// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type {
  FiscalActionResult,
  FiscalPublicConfig,
  FiscalTaxLine,
  FiscalRequisites,
  SaleDetail,
  SaleFiscalDoc,
  VerticalId,
} from '../types';
import type { ReceiptData, ReceiptFiscal, ReceiptHeader, ReceiptVatLine } from './printer';
import { localOrderLabel } from './localOrderNo';
import { refundLineAmount } from './money';
import { formatQuantity, isWeighed, MANUAL_WEIGHT_NOTE } from './weighed';

/**
 * What the builders need to know about the store: the trade name that tops
 * every receipt, and — for a fiscalising store — the provider-reported
 * requisites the header and fiscal block are printed from
 * (`auth.store.fiscal`, cached with the login so the till has it offline).
 */
export interface ReceiptStoreInfo {
  name: string;
  fiscal?: FiscalPublicConfig | null;
  /**
   * What the store sells. Decides whether the daily order number goes on the
   * paper: a café's counter calls it out, a clothing store has no counter.
   */
  vertical?: VerticalId | null;
  /**
   * The guest menu's feedback sheet (`auth.store.feedback_url`), printed as
   * the QR «Оцініть нас» at the bottom of a sale receipt (phase F7). Null or
   * absent where the owner takes no feedback — the paper stays as it was.
   */
  feedback_url?: string | null;
}

/**
 * The store's fiscal config as register `registerNo` prints it (track ДК,
 * TechDocs/POS_DUAL_REGISTER.md): register 2 is another ФОП, so its receipt
 * carries that ФОП's requisites, ФН ПРРО and tax letter from
 * `fiscal.registers[]`. Register 1 is the config as it is. A register the
 * login no longer lists (switched off since) prints NO requisites rather than
 * register 1's — a header naming the other ФОП would be a wrong document.
 */
export function fiscalForRegister(
  fiscal: FiscalPublicConfig | null | undefined,
  registerNo: number | null | undefined
): FiscalPublicConfig | null | undefined {
  if (!fiscal || !registerNo || registerNo === 1) return fiscal;
  const extra = fiscal.registers?.find((r) => r.register_no === registerNo);
  return {
    ...fiscal,
    register_fiscal_number: extra?.register_fiscal_number ?? null,
    default_tax_code: extra?.default_tax_code ?? null,
    requisites: extra?.requisites ?? null,
  };
}

/** The store info a sale's own receipt is printed with: its register's ФОП. */
function storeForSale(store: ReceiptStoreInfo, sale: Pick<SaleDetail, 'fiscal_register'>): ReceiptStoreInfo {
  const fiscal = fiscalForRegister(store.fiscal, sale.fiscal_register);
  return fiscal === store.fiscal ? store : { ...store, fiscal };
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
  // The excise row is never a line's own rate (ДК4) — a seller who is not a
  // VAT payer has only that row, and then no line letter but the excise's.
  const vat = req.taxes.filter((t) => !t.excise);
  const code = store.fiscal?.default_tax_code?.trim();
  return (
    (code ? vat.find((t) => t.code === code) : undefined) ??
    vat.find((t) => t.is_default) ??
    vat[0] ??
    null
  );
}

/**
 * The excise letter an excise line adds to its rate (ДК4): from what the
 * document registered when it says, else from the register's tax table.
 */
function exciseSymbol(store: ReceiptStoreInfo, rows?: readonly FiscalTaxLine[] | null): string | null {
  const registered = rows?.find((r) => r.kind === 'excise')?.letter;
  if (registered) return registered;
  const req = store.fiscal?.enabled ? store.fiscal.requisites : null;
  return req?.taxes.find((t) => t.excise)?.symbol ?? null;
}

/** «А», «АГ», «Г» — a line's letters (рядок 11): its VAT letter, then the excise's on an excise line. */
function lineLetters(vat: string | null | undefined, excise: string | null, isExcise: boolean): string | null {
  const letters = `${vat ?? ''}${isExcise && excise ? excise : ''}`;
  return letters || null;
}

/**
 * Рядки 21–22 as the document registered them — «ПДВ А 20%», «Акциз Г 5%» —
 * where it says (ДК4, `tax_rows`); null to fall back to the arithmetic.
 */
function registeredTaxLines(rows: readonly FiscalTaxLine[] | null | undefined): ReceiptVatLine[] | null {
  if (!rows?.length) return null;
  return rows.map((row) => ({
    symbol: row.letter,
    rate: row.rate,
    amount_cents: Math.abs(row.amount_cents),
    ...(row.kind === 'excise' ? { name: row.name || 'Акциз' } : {}),
  }));
}

/**
 * Рядок 21. Prices are VAT-inclusive, so the tax inside `total` is
 * `total × rate / (100 + rate)`; one line, because every position carries the
 * store's default letter today. Empty for a non-VAT rate.
 *
 * When the document carries the figure the provider REGISTERED (`vat_cents`,
 * Cashalot's own `CHECKTAX`), that figure is printed instead: the ДПС
 * arithmetic is «base minus the rounded net», which differs from the direct
 * formula by a kopeck on a tie, and the paper must say what the tax office
 * was told.
 */
function vatLines(
  store: ReceiptStoreInfo,
  totalCents: number,
  registered?: number | null
): ReceiptVatLine[] {
  const tax = defaultTax(store);
  if (!tax || tax.no_vat || tax.rate <= 0) return [];
  const amount =
    typeof registered === 'number'
      ? Math.abs(registered)
      : Math.round((Math.abs(totalCents) * tax.rate) / (100 + tax.rate));
  return [{ symbol: tax.symbol, rate: tax.rate, amount_cents: amount }];
}

/**
 * Рядок 25: cash back — only when cash was taken and more than was due came
 * in. «Due» is the sum after cash rounding (рядок 24, «До сплати»).
 */
function changeCents(
  payments: Array<{ method: string; amount_cents: number }>,
  dueCents: number
): number | null {
  const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const hasCash = payments.some((p) => p.method === 'cash');
  return hasCash && paid > dueCents ? paid - dueCents : null;
}

/**
 * The row a weighed line prints instead of «quantity x price» — «0.350 кг x
 * 189.90», with the receipt's own decimal point (`receipt.rs` `money`), and
 * the hand-typed weight said under it (TechDocs/grocery/G4_WEIGHED.md). Empty
 * for a line counted by the piece, which prints as it always did.
 */
function weighedRow(item: {
  quantity: number;
  unit?: string;
  unit_price_cents: number;
  price_per?: number;
  weight_source?: string | null;
}): { quantity_text?: string; note?: string } {
  if (!isWeighed(item.price_per)) return {};
  const weight = formatQuantity(item.quantity, item.unit ?? '', item.price_per).replace(',', '.');
  return {
    quantity_text: `${weight} x ${(item.unit_price_cents / 100).toFixed(2)}`,
    ...(item.weight_source === 'manual' ? { note: MANUAL_WEIGHT_NOTE } : {}),
  };
}

/** Рядок 35: the ПРРО's name as its producer spells it; the raw id for one this build does not know. */
const PRODUCER: Readonly<Record<string, string>> = {
  checkbox: 'ПРРО Checkbox',
  cashalot: 'ПРРО Cashalot',
};

function producerOf(store: ReceiptStoreInfo): string | null {
  const provider = store.fiscal?.provider;
  if (!provider) return null;
  return PRODUCER[provider] ?? `ПРРО ${provider}`;
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
  // Ours from the reserve, or the provider's own offline session: both are
  // receipts the tax office has not seen yet, and Положення № 13 рядок 31
  // wants «ОФЛАЙН» on either. The printer only knows the two words.
  const offline = doc.mode === 'offline' || doc.mode === 'provider_offline';
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
 * required field. See TechDocs/prro/POS_FISCAL_OFFLINE.md.
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
  storeInfo: ReceiptStoreInfo,
  customerName?: string | null
): ReceiptData {
  const store = storeForSale(storeInfo, sale);
  const tax = defaultTax(store);
  const excise = exciseSymbol(store, sale.fiscal?.tax_rows);
  // НБУ № 25: the cash part may have been rounded. The goods' total — and the
  // VAT inside it — stay as they are; only what was due moves.
  const rounding = sale.rounding_cents ?? 0;
  return {
    ...fiscalParts(sale.fiscal, store),
    header: headerOf(store),
    vat_lines:
      registeredTaxLines(sale.fiscal?.tax_rows) ?? vatLines(store, sale.total_cents, sale.fiscal?.vat_cents),
    change_cents: changeCents(sale.payments, sale.total_cents + rounding),
    rounding_cents: rounding || null,
    store_name: store.name,
    kind: 'sale',
    receipt_number: sale.receipt_number,
    refund_of_receipt: null,
    order_no: store.vertical === 'cafe' ? (sale.order_no ?? null) : null,
    // The till's own «К17» on a receipt printed while the sale is still in
    // the outbox — the server's number wins the moment there is one.
    order_label:
      store.vertical === 'cafe' && sale.order_no == null && sale.local_order_no != null
        ? localOrderLabel(sale.local_order_no)
        : null,
    created_at: new Date(sale.created_at).toLocaleString('uk-UA'),
    staff_name: sale.staff_name,
    customer_name: customerName ?? sale.customer_name ?? null,
    items: sale.items.map((item) => ({
      name: item.product_name,
      variant_label: item.variant_label,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      tax_symbol: lineLetters(tax?.symbol, excise, item.excise === true),
      ...weighedRow(item),
      // A bottle sold whole carries its own stamps, a pour the stamp of the
      // bottle it was the first pour from (ДК5) — on paper both are the
      // line's stamps, as they are in the ДПС document.
      ...(item.excise_labels?.length || item.bottle_labels?.length
        ? { excise_labels: [...(item.excise_labels ?? []), ...(item.bottle_labels ?? [])] }
        : {}),
    })),
    subtotal_cents: sale.subtotal_cents,
    discount_cents: sale.cart_discount_cents ?? null,
    total_cents: sale.total_cents,
    payments: sale.payments.map((p) => ({ method: p.method, amount_cents: p.amount_cents })),
    // A sale asks to be rated; a refund (below) never does.
    feedback_url: store.feedback_url ?? null,
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
  /** `excise_labels`: the stamps of the bottles that came back, when the caller knows them (ДК4). */
  lines: Array<{ sale_item_id: number; quantity: number; excise_labels?: string[] }>,
  storeInfo: ReceiptStoreInfo,
  /** The REFUND's own fiscal document, from the refund response — never the sale's. */
  fiscal?: FiscalActionResult | null
): ReceiptData {
  // A refund is registered on the sale's own register (ДК1), so it prints that ФОП.
  const store = storeForSale(storeInfo, sale);
  const tax = defaultTax(store);
  const excise = exciseSymbol(store, fiscal?.tax_rows);
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
    // A weighed line comes back whole and keeps the sale line's price per
    // kilogram: «sum / quantity» would be a price per GRAM.
    const weighed = isWeighed(item.price_per);
    return [
      {
        name: item.product_name,
        variant_label: item.variant_label,
        quantity: line.quantity,
        unit_price_cents: weighed ? item.unit_price_cents : Math.round(amount / line.quantity),
        line_total_cents: amount,
        tax_symbol: lineLetters(tax?.symbol, excise, item.excise === true),
        ...(weighed ? weighedRow({ ...item, quantity: line.quantity }) : {}),
        ...(line.excise_labels?.length ? { excise_labels: line.excise_labels } : {}),
      },
    ];
  });

  // A cash refund hands back the sum after rounding (НБУ № 25, пп. 4, 4-1).
  const rounding = refund.rounding_cents ?? 0;
  return {
    ...fiscalParts(fiscal, store),
    header: headerOf(store),
    vat_lines: registeredTaxLines(fiscal?.tax_rows) ?? vatLines(store, refund.total_cents, fiscal?.vat_cents),
    // Money goes out, never back to the customer as change.
    change_cents: null,
    rounding_cents: rounding || null,
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
    payments: refund.method
      ? [{ method: refund.method, amount_cents: refund.total_cents + rounding }]
      : [],
  };
}
