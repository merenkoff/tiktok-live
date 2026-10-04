// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, Printer, X } from '@pos/platform/ui';
import {
  buildRefundReceiptPayload,
  DEFAULT_RECEIPT_PAPER_WIDTH,
  formatUah,
  getMeta,
  printReceipt,
  refundLineAmount,
  useAuthStore,
  usePrintableReceipt,
} from '@pos/platform';
import type {
  FiscalActionResult,
  LocalSaleRow,
  PaymentMethod,
  ReceiptData,
  ReceiptPaperWidth,
  RefundLineInput,
  RefundReasonCode,
  SaleDetail,
} from '@pos/platform';
import { returnsApi } from '../data/returnsApi';
import {
  daysSincePurchase,
  defaultRefundMethod,
  EXCHANGE_DAYS,
  needsAct,
  paidMethods,
  PAYMENT_LABEL_UK,
  REFUND_REASONS,
  refundErrorText,
} from '../lib/refundReasons';
import { buildActPayload } from '../lib/actPayload';
import { usePrintableAct } from '../hooks/usePrintableAct';

/**
 * What the exchange flow takes away from the dialog (clothing R1): the
 * return half as the cashier set it up, with its own idempotency key minted
 * here so a retry after a timeout cannot refund twice. The sale half is the
 * cart the cashier goes on to fill on the sell screen.
 */
export interface ExchangeDraft {
  saleId: number;
  saleClientUuid: string;
  receiptNumber: string;
  saleCreatedAt: string;
  refund: {
    items: RefundLineInput[];
    method: PaymentMethod;
    reason_code: RefundReasonCode | null;
    reason: string | null;
    buyer_name: string | null;
    buyer_document: string | null;
    client_uuid: string;
  };
  returnedCents: number;
  returnedLines: Array<{ name: string; label: string; quantity: number; amount_cents: number }>;
}

interface Props {
  sale: LocalSaleRow;
  detail: SaleDetail | null;
  /** Pre-select every refundable unit — used by the "cancel receipt" entry point. */
  selectAll?: boolean;
  /**
   * `exchange`: the same picker, but the primary action hands the return half
   * to `onExchange` instead of refunding — the goods are swapped, not given
   * back, and the money moves with the new receipt.
   */
  mode?: 'refund' | 'exchange';
  onClose: () => void;
  onRefunded: (sale: LocalSaleRow) => void;
  onExchange?: (draft: ExchangeDraft) => void;
}

const ALL_METHODS: PaymentMethod[] = ['cash', 'card', 'qr'];

function available(item: SaleDetail['items'][number]): number {
  return item.quantity - item.refunded_quantity;
}

/**
 * Returns money for part or all of a receipt. Cancelling a receipt is the same
 * operation with everything pre-selected — under ПРРО a receipt the tax service
 * has seen can only be undone by refunding it, so there is one flow, not two.
 *
 * What the dialog asks, and why (TechDocs/POS_CLOTHING.md «R1/R2/R4»):
 *  - the ground (ст. 8/9 of the consumer law) — «Брак» is the one that
 *    changes what happens to the goods, the server writes them off;
 *  - the method — only the ones the receipt was paid with, because the tax
 *    office's line is that card money goes back to the card;
 *  - the buyer's name and document above 100 ₴ — Порядок № 547 wants an act
 *    with them; optional, a buyer who declines must not block the return;
 *  - a fourteen-day hint (ст. 9), never a gate: the shop may take it back.
 */
export function RefundSaleDialog({
  sale,
  detail,
  selectAll,
  mode = 'refund',
  onClose,
  onRefunded,
  onExchange,
}: Props) {
  const exchange = mode === 'exchange';
  const items = useMemo(() => (detail?.items ?? []).filter((i) => available(i) > 0), [detail]);

  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, selectAll ? available(i) : 0]))
  );
  // Default to how they paid: the only lawful method when there is one.
  const paid = useMemo(() => paidMethods(detail), [detail]);
  const [method, setMethod] = useState<PaymentMethod>(() => defaultRefundMethod(detail));
  // The detail can land after the dialog opened (the till shows the row
  // first): a method the receipt was not paid with would be refused, so
  // follow the payments as soon as they are known.
  useEffect(() => {
    if (paid.length > 0 && !paid.includes(method)) setMethod(paid[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid]);
  const [reasonCode, setReasonCode] = useState<RefundReasonCode | null>(null);
  const [reason, setReason] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerDocument, setBuyerDocument] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the refund lands — the dialog then becomes the print step.
  const [done, setDone] = useState<{
    row: LocalSaleRow;
    receipt: ReceiptData;
    /** The REFUND's fiscal result — captured here because `done` is frozen once. */
    fiscal?: FiscalActionResult | null;
    /** The refund as the server recorded it — the act is built from it. */
    refund: SaleDetail['refunds'][number];
    sale: SaleDetail;
  } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const auth = useAuthStore((s) => s.auth);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  const { printAct, actPortal } = usePrintableAct();

  const total = items.reduce(
    (sum, i) =>
      sum + refundLineAmount(i.line_total_cents, i.quantity, i.refunded_quantity, qty[i.id] ?? 0),
    0
  );
  const picked = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const everything = items.length > 0 && items.every((i) => (qty[i.id] ?? 0) === available(i));
  const actWanted = needsAct(total);
  const days = daysSincePurchase(sale.created_at);
  const storeInfo = { name: auth?.store.name ?? '', fiscal: auth?.store.fiscal ?? null };

  function setLine(id: number, next: number, max: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, next)) }));
  }

  function lines(): RefundLineInput[] {
    return picked.map((i) => ({ sale_item_id: i.id, quantity: qty[i.id] }));
  }

  function startExchange() {
    if (picked.length === 0) {
      setError('Оберіть, що повертаємо');
      return;
    }
    onExchange?.({
      saleId: sale.server_id ?? detail?.id ?? 0,
      saleClientUuid: sale.client_uuid,
      receiptNumber: sale.receipt_number,
      saleCreatedAt: sale.created_at,
      refund: {
        items: lines(),
        method,
        reason_code: reasonCode,
        reason: reason.trim() || null,
        buyer_name: buyerName.trim() || null,
        buyer_document: buyerDocument.trim() || null,
        client_uuid: crypto.randomUUID(),
      },
      returnedCents: total,
      returnedLines: picked.map((i) => ({
        name: i.product_name,
        label: i.variant_label,
        quantity: qty[i.id],
        amount_cents: refundLineAmount(i.line_total_cents, i.quantity, i.refunded_quantity, qty[i.id]),
      })),
    });
  }

  async function confirm() {
    if (picked.length === 0) {
      setError('Оберіть, що повертаємо');
      return;
    }
    setBusy(true);
    setError(null);
    const requested = lines();
    try {
      const row = await returnsApi.refundSale(sale, requested, {
        method,
        reason: reason.trim() || undefined,
        reason_code: reasonCode,
        buyer_name: buyerName.trim() || null,
        buyer_document: buyerDocument.trim() || null,
      });
      onRefunded(row);

      // A locally-dropped sale never became a refund document, so there is
      // nothing to print — close out instead of showing the print step.
      const fresh = row.detail;
      const doc = fresh?.refunds[fresh.refunds.length - 1];
      if (!fresh || !doc) {
        onClose();
        return;
      }
      setDone({
        row,
        receipt: buildRefundReceiptPayload(fresh, doc, requested, storeInfo, row.refund_fiscal ?? null),
        // `done` is set once and is all the success pane reads, so the fiscal
        // result has to be captured now — the `sale` prop is never refreshed.
        fiscal: row.refund_fiscal ?? null,
        refund: doc,
        sale: fresh,
      });
      setBusy(false);
    } catch (e) {
      // The server's own sentence («Чек оплачено карткою — повернення теж на
      // картку»), never «Request failed with status code 400».
      setError(refundErrorText(e, 'Не вдалося оформити повернення'));
      setBusy(false);
    }
  }

  async function print(receipt: ReceiptData) {
    const [name, mm] = await Promise.all([
      getMeta<string>('receiptPrinterName'),
      getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
    ]);
    if (!name) {
      printToPdf(receipt);
      return;
    }
    setPrinting(true);
    setPrintStatus(null);
    try {
      await printReceipt(name, receipt, mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH);
      setPrintStatus('Чек повернення надіслано на друк');
    } catch (e) {
      setPrintStatus(`Не вдалося надрукувати: ${typeof e === 'string' ? e : String(e)}`);
    } finally {
      setPrinting(false);
    }
  }

  // Same store flag that governs sale receipts — and the same fiscal gate:
  // never auto-print an un-fiscalised refund in a ПРРО store, the customer
  // would keep a slip that looks like a refund receipt and carries no number.
  // The manual button below stays.
  useEffect(() => {
    if (!done || !(auth?.store.auto_print_receipt ?? false)) return;
    if ((auth?.store.fiscal?.enabled ?? false) && done.fiscal?.status !== 'done') return;
    void print(done.receipt);
    // Fires once per completed refund.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
        <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" onClick={onClose} aria-label="Закрити" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Повернення оформлено"
          className="relative w-full max-w-sm bg-white rounded-t-card sm:rounded-card px-6 pt-8 pb-6 text-center shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up"
        >
          <div className="mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={40} />
          </div>
          {done.fiscal?.status === 'failed' && (
            // Still the success pane, never an error: the money really did go
            // back. An error screen here would make the cashier refund twice.
            <div
              role="alert"
              className="mt-4 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left"
            >
              <p className="font-semibold">Чек повернення не зареєстровано в ПРРО</p>
              {done.fiscal.message && <p className="mt-1">{done.fiscal.message}</p>}
              <p className="mt-1">Реєстрація повториться автоматично.</p>
            </div>
          )}
          <p className="mt-[18px] text-sm font-semibold text-sq-secondary">Повернено</p>
          <p className="text-[34px] leading-tight font-bold mt-1 text-sq-heading tabular-nums">
            {formatUah(done.receipt.total_cents)}
          </p>
          <p className="text-sm text-sq-muted mt-1 tabular-nums">
            {done.receipt.receipt_number} · до чека {sale.receipt_number}
          </p>
          {done.refund.writeoff_doc_number && (
            <p className="text-sm text-sq-muted mt-1 tabular-nums">
              Списано як брак · {done.refund.writeoff_doc_number}
            </p>
          )}
          <button
            type="button"
            className="pos-btn-primary mt-6 w-full min-h-[52px] rounded-xl text-[17px]"
            onClick={onClose}
          >
            Готово
          </button>
          <button
            type="button"
            className="mt-2 w-full min-h-12 inline-flex items-center justify-center gap-2 text-[15px] font-semibold text-sq-blue disabled:opacity-50"
            onClick={() => void print(done.receipt)}
            disabled={printing}
          >
            <Printer size={20} />
            {printing ? 'Друк…' : 'Друкувати чек повернення'}
          </button>
          {needsAct(done.receipt.total_cents) && (
            <button
              type="button"
              className="mt-1 w-full min-h-12 inline-flex items-center justify-center gap-2 text-[15px] font-semibold text-sq-blue"
              onClick={() =>
                printAct(buildActPayload(done.sale, done.refund, storeInfo, done.fiscal?.fiscal_code ?? null))
              }
            >
              <Printer size={20} />
              Акт про видачу коштів
            </button>
          )}
          {printStatus && <p className="text-sq-secondary text-sm mt-1">{printStatus}</p>}
        </div>
        {printablePortal}
        {actPortal}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" onClick={onClose} aria-label="Закрити" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={exchange ? 'Обмін' : 'Повернення'}
        className="relative w-full max-w-md max-h-[92dvh] bg-white rounded-t-card sm:rounded-card flex flex-col shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up"
      >
        <div aria-hidden className="sm:hidden w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0" />
        <div className="pl-5 pr-3 pt-3 sm:pt-4 pb-3 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-sq-heading">
              {exchange ? 'Обмін: що повертаємо?' : everything ? 'Скасувати чек?' : 'Повернення'}
            </p>
            <p className="text-sm text-sq-secondary mt-0.5 tabular-nums">
              {sale.receipt_number} · {formatUah(sale.total_cents)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрити"
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 space-y-4 min-h-0">
          {/* A refund references the sale's fiscal document. Without one the
              refund goes through financially but can never be registered — and
              nothing on the server will ever retry it, because the ledger has
              no row for it. Say so before the money leaves the drawer. */}
          {(auth?.store.fiscal?.enabled ?? false) &&
            (sale.fiscal_status ?? 'none') !== 'done' && (
              <p className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm">
                Цей продаж не зареєстровано в ПРРО — чек повернення теж не буде
                зареєстровано.
              </p>
            )}
          {/* Ст. 9: fourteen days, the purchase day not counted. A hint and
              nothing more — the shop may take goods back later if it wants to. */}
          {items.length > 0 && !selectAll && days > EXCHANGE_DAYS && (
            <p className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm" data-testid="refund-days-hint">
              Чек від {new Date(sale.created_at).toLocaleDateString('uk-UA')} — минуло {days} дн.
              Обмін і повернення належної якості за законом — {EXCHANGE_DAYS} днів, не рахуючи дня
              купівлі; далі на розсуд магазину.
            </p>
          )}
          {items.length === 0 ? (
            <p className="text-[15px] text-sq-secondary">
              {detail
                ? 'За цим чеком уже все повернуто.'
                : 'Позиції чека недоступні — відкрийте чек онлайн.'}
            </p>
          ) : (
            <ul>
              {items.map((item) => {
                const max = available(item);
                const n = qty[item.id] ?? 0;
                return (
                  <li key={item.id} className="sq-row min-h-[60px] py-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base text-sq-text truncate">{item.product_name}</p>
                      <p className="text-[13px] text-sq-muted truncate">
                        {item.variant_label} · доступно {max} шт
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        className={stepClass}
                        onClick={() => setLine(item.id, n - 1, max)}
                        disabled={n === 0}
                        aria-label={`Менше ${item.product_name}`}
                      >
                        <Minus size={20} />
                      </button>
                      <span className="w-8 text-center text-[17px] font-semibold text-sq-text tabular-nums">{n}</span>
                      <button
                        type="button"
                        className={stepClass}
                        onClick={() => setLine(item.id, n + 1, max)}
                        disabled={n === max}
                        aria-label={`Більше ${item.product_name}`}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {items.length > 0 && (
            <>
              <button
                type="button"
                className="text-[15px] font-semibold text-sq-blue min-h-11 -mt-2"
                onClick={() =>
                  setQty(Object.fromEntries(items.map((i) => [i.id, everything ? 0 : available(i)])))
                }
              >
                {everything ? 'Зняти все' : 'Повернути все'}
              </button>

              <div>
                <p className="sq-section-label mb-2">Причина</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Причина">
                  {REFUND_REASONS.map((r) => {
                    const on = reasonCode === r.code;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        aria-pressed={on}
                        className={`min-h-11 px-3.5 rounded-xl text-[15px] transition-colors ${
                          on
                            ? 'bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold'
                            : 'bg-white ring-1 ring-sq-divider text-sq-text font-medium'
                        }`}
                        onClick={() => setReasonCode(on ? null : r.code)}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {reasonCode === 'defect' && (
                  <p className="mt-2 text-[13px] text-sq-secondary">
                    Товар спишеться як брак, а не повернеться на полицю.
                  </p>
                )}
              </div>

              <div>
                <p className="sq-section-label mb-2">
                  {exchange ? 'Спосіб повернення, якщо новий товар дешевший' : 'Спосіб повернення'}
                </p>
                <div className="flex gap-2">
                  {ALL_METHODS.map((m) => {
                    const on = method === m;
                    // The server refuses any other method: what was paid by
                    // card goes back to the card. A receipt with no payment
                    // rows (seeded data) keeps every button.
                    const allowed = paid.length === 0 || paid.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        disabled={!allowed}
                        title={allowed ? undefined : 'Чек оплачено іншим способом'}
                        className={`flex-1 min-h-12 rounded-xl text-base transition-colors disabled:opacity-40 ${
                          on
                            ? 'bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold'
                            : 'bg-white ring-1 ring-sq-divider text-sq-text font-medium'
                        }`}
                        onClick={() => setMethod(m)}
                      >
                        {PAYMENT_LABEL_UK[m]}
                      </button>
                    );
                  })}
                </div>
                {paid.length > 0 && (
                  <p className="mt-1.5 text-[13px] text-sq-secondary">
                    Повернення — тим самим способом, яким платили.
                  </p>
                )}
              </div>

              <input
                className="pos-field"
                placeholder="Коментар (необов'язково)"
                aria-label="Коментар"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />

              {/* Порядок № 547 розд. ІІІ п. 8: above 100 ₴ the act names the
                  buyer by their document. Optional on purpose — a buyer who
                  declines must not block the return; the act prints with blanks. */}
              {actWanted && (
                <div className="rounded-xl bg-sq-empty px-4 py-3 space-y-2" data-testid="refund-buyer">
                  <p className="text-[13px] font-semibold text-sq-secondary">
                    Для акта про видачу коштів (понад 100 ₴)
                  </p>
                  <input
                    className="pos-field"
                    placeholder="ПІБ покупця"
                    aria-label="ПІБ покупця"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                  <input
                    className="pos-field"
                    placeholder="Документ (серія, номер, ким виданий)"
                    aria-label="Документ покупця"
                    value={buyerDocument}
                    onChange={(e) => setBuyerDocument(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>}
        </div>

        <div className="px-5 pt-3 pb-5 shrink-0 space-y-3 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))] mt-3">
          <div className="flex justify-between items-baseline">
            <span className="text-[15px] text-sq-secondary">{exchange ? 'Повертається' : 'До повернення'}</span>
            <span className="text-[26px] font-bold text-sq-heading tabular-nums">{formatUah(total)}</span>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              className="flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50"
              onClick={onClose}
              disabled={busy}
            >
              Назад
            </button>
            {exchange ? (
              <button
                type="button"
                className="flex-1 min-h-[52px] rounded-xl pos-btn-primary text-[17px] disabled:opacity-50"
                onClick={startExchange}
                disabled={busy || picked.length === 0}
              >
                Далі: новий товар
              </button>
            ) : (
              <button
                type="button"
                className="flex-1 min-h-[52px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-[17px] font-semibold disabled:opacity-50"
                onClick={() => void confirm()}
                disabled={busy || picked.length === 0}
              >
                {busy ? 'Оформлення…' : everything ? 'Скасувати чек' : 'Повернути'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const stepClass =
  'w-11 h-11 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-30';
