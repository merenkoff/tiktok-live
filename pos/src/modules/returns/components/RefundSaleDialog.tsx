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
  OfflineRefundError,
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
  SaleDetail,
} from '@pos/platform';
import { returnsApi } from '../data/returnsApi';

interface Props {
  sale: LocalSaleRow;
  detail: SaleDetail | null;
  /** Pre-select every refundable unit — used by the "cancel receipt" entry point. */
  selectAll?: boolean;
  onClose: () => void;
  onRefunded: (sale: LocalSaleRow) => void;
}

const METHODS: Array<{ id: PaymentMethod; label: string }> = [
  { id: 'cash', label: 'Готівка' },
  { id: 'card', label: 'Картка' },
  { id: 'qr', label: 'QR-код' },
];

function available(item: SaleDetail['items'][number]): number {
  return item.quantity - item.refunded_quantity;
}

/**
 * Returns money for part or all of a receipt. Cancelling a receipt is the same
 * operation with everything pre-selected — under ПРРО a receipt the tax service
 * has seen can only be undone by refunding it, so there is one flow, not two.
 */
export function RefundSaleDialog({ sale, detail, selectAll, onClose, onRefunded }: Props) {
  const items = useMemo(() => (detail?.items ?? []).filter((i) => available(i) > 0), [detail]);

  const [qty, setQty] = useState<Record<number, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, selectAll ? available(i) : 0]))
  );
  // Default to how they paid when there is only one method to give back to.
  const [method, setMethod] = useState<PaymentMethod>(
    detail?.payments.length === 1 ? detail.payments[0].method : 'cash'
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the refund lands — the dialog then becomes the print step.
  const [done, setDone] = useState<{
    row: LocalSaleRow;
    receipt: ReceiptData;
    /** The REFUND's fiscal result — captured here because `done` is frozen once. */
    fiscal?: FiscalActionResult | null;
  } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const auth = useAuthStore((s) => s.auth);
  const { printToPdf, printablePortal } = usePrintableReceipt();

  const total = items.reduce(
    (sum, i) =>
      sum + refundLineAmount(i.line_total_cents, i.quantity, i.refunded_quantity, qty[i.id] ?? 0),
    0
  );
  const picked = items.filter((i) => (qty[i.id] ?? 0) > 0);
  const everything = items.length > 0 && items.every((i) => (qty[i.id] ?? 0) === available(i));

  function setLine(id: number, next: number, max: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, next)) }));
  }

  async function confirm() {
    if (picked.length === 0) {
      setError('Оберіть, що повертаємо');
      return;
    }
    setBusy(true);
    setError(null);
    const lines = picked.map((i) => ({ sale_item_id: i.id, quantity: qty[i.id] }));
    try {
      const row = await returnsApi.refundSale(sale, lines, {
        method,
        reason: reason.trim() || undefined,
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
        receipt: buildRefundReceiptPayload(
          fresh,
          doc,
          lines,
          { name: auth?.store.name ?? '', fiscal: auth?.store.fiscal ?? null },
          row.refund_fiscal ?? null
        ),
        // `done` is set once and is all the success pane reads, so the fiscal
        // result has to be captured now — the `sale` prop is never refreshed.
        fiscal: row.refund_fiscal ?? null,
      });
      setBusy(false);
    } catch (e) {
      setError(
        e instanceof OfflineRefundError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Не вдалося оформити повернення'
      );
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
          {printStatus && <p className="text-sq-secondary text-sm mt-1">{printStatus}</p>}
        </div>
        {printablePortal}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-[rgba(28,32,38,.32)]" onClick={onClose} aria-label="Закрити" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Повернення"
        className="relative w-full max-w-md max-h-[92dvh] bg-white rounded-t-card sm:rounded-card flex flex-col shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up"
      >
        <div aria-hidden className="sm:hidden w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0" />
        <div className="pl-5 pr-3 pt-3 sm:pt-4 pb-3 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-sq-heading">
              {everything ? 'Скасувати чек?' : 'Повернення'}
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
                <p className="sq-section-label mb-2">Спосіб повернення</p>
                <div className="flex gap-2">
                  {METHODS.map((m) => {
                    const on = method === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        className={`flex-1 min-h-12 rounded-xl text-base transition-colors ${
                          on
                            ? 'bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold'
                            : 'bg-white ring-1 ring-sq-divider text-sq-text font-medium'
                        }`}
                        onClick={() => setMethod(m.id)}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                className="pos-field"
                placeholder="Причина (необов'язково)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}

          {error && <p className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>}
        </div>

        <div className="px-5 pt-3 pb-5 shrink-0 space-y-3 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))] mt-3">
          <div className="flex justify-between items-baseline">
            <span className="text-[15px] text-sq-secondary">До повернення</span>
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
            <button
              type="button"
              className="flex-1 min-h-[52px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-[17px] font-semibold disabled:opacity-50"
              onClick={() => void confirm()}
              disabled={busy || picked.length === 0}
            >
              {busy ? 'Оформлення…' : everything ? 'Скасувати чек' : 'Повернути'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const stepClass =
  'w-11 h-11 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-30';
