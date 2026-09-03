// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { cashierApi } from '../../offline/cashierApi';
import { OfflineRefundError } from '../../offline';
import { getMeta } from '../../offline/db';
import { formatUah, refundLineAmount } from '../../lib/money';
import { buildRefundReceiptPayload } from '../../lib/receipt';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  printReceipt,
  type ReceiptData,
  type ReceiptPaperWidth,
} from '../../lib/printer';
import { usePrintableReceipt } from '../../hooks/usePrintableReceipt';
import { useAuthStore } from '../../hooks/useAuth';
import type { LocalSaleRow } from '../../offline/db';
import type { PaymentMethod, SaleDetail } from '../../types';

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
  const [done, setDone] = useState<{ row: LocalSaleRow; receipt: ReceiptData } | null>(null);
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
      const row = await cashierApi.refundSale(sale, lines, {
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
        receipt: buildRefundReceiptPayload(fresh, doc, lines, auth?.store.name ?? ''),
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

  // Same store flag that governs sale receipts.
  useEffect(() => {
    if (!done || !(auth?.store.auto_print_receipt ?? false)) return;
    void print(done.receipt);
    // Fires once per completed refund.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Закрити" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Повернення оформлено"
          className="relative w-full max-w-sm bg-white rounded-t-sq sm:rounded-sq p-6 text-center shadow-lg"
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={24} strokeWidth={2.5} />
          </div>
          <p className="sq-section-label mt-5">Повернено</p>
          <p className="text-3xl font-bold mt-1 text-sq-text">
            {formatUah(done.receipt.total_cents)}
          </p>
          <p className="text-sm text-sq-secondary mt-1">
            {done.receipt.receipt_number} · до чека {sale.receipt_number}
          </p>
          <button
            type="button"
            className="pos-btn-primary mt-6 w-full py-3.5"
            onClick={onClose}
          >
            Готово
          </button>
          <button
            type="button"
            className="mt-3 w-full min-h-12 text-sm font-medium text-sq-blue disabled:opacity-50"
            onClick={() => void print(done.receipt)}
            disabled={printing}
          >
            {printing ? 'Друк…' : 'Друкувати чек повернення'}
          </button>
          {printStatus && <p className="text-sq-secondary text-sm mt-1">{printStatus}</p>}
        </div>
        {printablePortal}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Закрити" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Повернення"
        className="relative w-full max-w-md max-h-[92dvh] bg-white rounded-t-sq sm:rounded-sq flex flex-col shadow-lg"
      >
        <div className="px-5 pt-5 pb-3 shrink-0">
          <p className="font-semibold text-sq-text">
            {everything ? 'Скасувати чек?' : 'Повернення'}
          </p>
          <p className="text-sm text-sq-secondary mt-0.5">
            {sale.receipt_number} · {formatUah(sale.total_cents)}
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5 space-y-3 min-h-0">
          {items.length === 0 ? (
            <p className="text-sm text-sq-secondary">
              {detail
                ? 'За цим чеком уже все повернуто.'
                : 'Позиції чека недоступні — відкрийте чек онлайн.'}
            </p>
          ) : (
            items.map((item) => {
              const max = available(item);
              const n = qty[item.id] ?? 0;
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sq-text truncate">{item.product_name}</p>
                    <p className="text-xs text-sq-secondary truncate">
                      {item.variant_label} · доступно {max} шт
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="w-11 h-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text disabled:opacity-30"
                      onClick={() => setLine(item.id, n - 1, max)}
                      disabled={n === 0}
                      aria-label={`Менше ${item.product_name}`}
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-8 text-center font-semibold tabular-nums">{n}</span>
                    <button
                      type="button"
                      className="w-11 h-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text disabled:opacity-30"
                      onClick={() => setLine(item.id, n + 1, max)}
                      disabled={n === max}
                      aria-label={`Більше ${item.product_name}`}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {items.length > 0 && (
            <>
              <button
                type="button"
                className="text-sm font-semibold text-sq-blue min-h-12"
                onClick={() =>
                  setQty(Object.fromEntries(items.map((i) => [i.id, everything ? 0 : available(i)])))
                }
              >
                {everything ? 'Зняти все' : 'Повернути все'}
              </button>

              <div>
                <p className="sq-section-label mb-1.5">Спосіб повернення</p>
                <div className="flex gap-2">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`flex-1 min-h-12 rounded-sq text-sm font-medium border ${
                        method === m.id
                          ? 'border-sq-blue text-sq-blue bg-sq-blue/5'
                          : 'border-sq-divider text-sq-text'
                      }`}
                      onClick={() => setMethod(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                className="pos-field text-sm"
                placeholder="Причина (необов'язково)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}

          {error && <p className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</p>}
        </div>

        <div className="p-5 pt-3 shrink-0 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-sq-secondary">До повернення</span>
            <span className="text-2xl font-bold text-sq-text">{formatUah(total)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 min-h-12 rounded-sq border border-sq-divider text-sm font-semibold text-sq-text disabled:opacity-50"
              onClick={onClose}
              disabled={busy}
            >
              Назад
            </button>
            <button
              type="button"
              className="flex-1 min-h-12 rounded-sq bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
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
