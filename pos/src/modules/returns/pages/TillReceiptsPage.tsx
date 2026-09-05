// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUah } from '@pos/platform';
import type { LocalSaleRow, SaleDetail } from '@pos/platform';
import { useDragScroll } from '@pos/platform/ui';
import { returnsApi } from '../data/returnsApi';
import { RefundSaleDialog } from '../components/RefundSaleDialog';

const SALE_STATUS_UK: Record<string, string> = {
  completed: 'Завершено',
  voided: 'Скасовано',
  refunded: 'Повернено',
  partially_refunded: 'Часткове повернення',
};

function statusLabel(row: LocalSaleRow): string {
  return SALE_STATUS_UK[row.status] ?? row.status;
}

function statusClass(row: LocalSaleRow): string {
  if (row.status === 'voided' || row.status === 'refunded') return 'text-red-600';
  if (row.status === 'partially_refunded') return 'text-amber-600';
  return 'text-sq-secondary';
}

const PAYMENT_LABEL_UK: Record<string, string> = {
  cash: 'Готівка',
  card: 'Картка',
  qr: 'QR-код',
};

/** Anything still holding unreturned units can be refunded further. */
function canRefund(row: LocalSaleRow): boolean {
  return row.status === 'completed' || row.status === 'partially_refunded';
}

/**
 * The cashier's own receipts screen — the terminal-side counterpart of the web
 * admin's Продажі page, trimmed to what a till needs: find a receipt, look at
 * it, cancel it. Partial refunds stay in the admin UI.
 */
export function TillReceiptsPage() {
  const [rows, setRows] = useState<LocalSaleRow[]>([]);
  const [selected, setSelected] = useState<LocalSaleRow | null>(null);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useDragScroll<HTMLDivElement>();

  async function reload() {
    setRows(await returnsApi.listSales(50));
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити чеки'));
  }, []);

  async function openSale(row: LocalSaleRow) {
    setSelected(row);
    setDetail(row.detail ?? null);
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await returnsApi.getSale(row));
    } catch {
      setError('Не вдалося завантажити чек');
    } finally {
      setDetailLoading(false);
    }
  }

  function onRefunded(updated: LocalSaleRow) {
    setRefunding(false);
    setSelected(updated);
    setDetail(updated.detail ?? detail);
    void reload().catch(() => undefined);
  }

  const body = (
    <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-3 p-3 overflow-hidden">
      <section className="flex flex-col min-h-0 bg-white border border-sq-divider rounded-sq overflow-hidden">
        <div className="px-4 py-3 border-b border-sq-divider flex items-center justify-between shrink-0">
          <h1 className="text-lg font-semibold text-sq-text">Чеки</h1>
          <Link to="/register" className="text-sm font-semibold text-sq-blue min-h-12 flex items-center">
            ← Каса
          </Link>
        </div>
        <div ref={listRef} className="flex-1 overflow-auto divide-y divide-sq-divider select-none">
          {rows.map((row) => (
            <button
              key={row.client_uuid}
              type="button"
              onClick={() => void openSale(row)}
              className={`w-full text-left px-4 py-3 min-h-12 flex justify-between gap-3 ${
                selected?.client_uuid === row.client_uuid ? 'bg-sq-bg' : 'hover:bg-sq-bg'
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-sq-text truncate">{row.receipt_number}</p>
                <p className="text-xs text-sq-secondary truncate">
                  {new Date(row.created_at).toLocaleString('uk-UA')} · {row.staff_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sq-text">{formatUah(row.total_cents)}</p>
                <p className={`text-xs ${statusClass(row)}`}>{statusLabel(row)}</p>
              </div>
            </button>
          ))}
          {rows.length === 0 && <p className="p-4 text-sq-secondary text-sm">Поки немає чеків.</p>}
        </div>
      </section>

      <section className="hidden lg:flex flex-col min-h-0 bg-white border border-sq-divider rounded-sq overflow-hidden">
        {!selected ? (
          <p className="p-5 text-sq-secondary text-sm">Оберіть чек зліва.</p>
        ) : (
          <SaleDetailPanel
            row={selected}
            detail={detail}
            loading={detailLoading}
            onRefund={() => setRefunding(true)}
          />
        )}
      </section>
    </div>
  );

  return (
    <>
      {error && (
        <div className="mx-3 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm shrink-0">
          {error}
        </div>
      )}
      {body}

      {/* On narrow tills the detail lives in a sheet instead of the side column. */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-40 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-sq-divider flex items-center justify-between shrink-0">
            <p className="font-semibold text-sq-text">{selected.receipt_number}</p>
            <button
              type="button"
              className="text-sm font-semibold text-sq-blue min-h-12 px-2"
              onClick={() => setSelected(null)}
            >
              Закрити
            </button>
          </div>
          <SaleDetailPanel
            row={selected}
            detail={detail}
            loading={detailLoading}
            onRefund={() => setRefunding(true)}
          />
        </div>
      )}

      {refunding && selected && (
        <RefundSaleDialog
          sale={selected}
          detail={detail}
          onClose={() => setRefunding(false)}
          onRefunded={onRefunded}
        />
      )}
    </>
  );
}

function SaleDetailPanel({
  row,
  detail,
  loading,
  onRefund,
}: {
  row: LocalSaleRow;
  detail: SaleDetail | null;
  loading: boolean;
  onRefund: () => void;
}) {
  const bodyRef = useDragScroll<HTMLDivElement>();

  return (
    <>
      <div ref={bodyRef} className="flex-1 overflow-auto p-5 space-y-4 select-none">
        <div>
          <h2 className="text-xl font-bold text-sq-text">{row.receipt_number}</h2>
          <p className="text-sm text-sq-secondary">
            {new Date(row.created_at).toLocaleString('uk-UA')} · {row.staff_name}
          </p>
          <p className={`text-sm font-semibold mt-1 ${statusClass(row)}`}>{statusLabel(row)}</p>
        </div>

        {detail ? (
          <ul className="space-y-2 text-sm">
            {detail.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-2">
                <div>
                  <p className="font-medium text-sq-text">{item.product_name}</p>
                  <p className="text-sq-secondary">
                    {item.variant_label} · {item.quantity} шт
                    {item.refunded_quantity > 0 ? ` (повернено ${item.refunded_quantity})` : ''}
                  </p>
                </div>
                <span className="font-semibold text-sq-text shrink-0">
                  {formatUah(item.line_total_cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-sq-secondary">
            {loading ? 'Завантаження…' : 'Позиції цього чека недоступні офлайн.'}
          </p>
        )}

        <p className="font-bold text-lg text-sq-text">Разом: {formatUah(row.total_cents)}</p>

        {detail && detail.payments.length > 0 && (
          <ul className="space-y-1.5 text-sm border-t border-sq-divider pt-3">
            {detail.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="text-sq-secondary">{PAYMENT_LABEL_UK[p.method] ?? p.method}</span>
                <span className="font-medium text-sq-text">{formatUah(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}

        {detail && detail.refunds.length > 0 && (
          <ul className="space-y-1.5 text-sm border-t border-sq-divider pt-3">
            <li className="sq-section-label">Повернення</li>
            {detail.refunds.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="text-sq-secondary">
                  {r.refund_number ?? '—'}
                  {r.method ? ` · ${PAYMENT_LABEL_UK[r.method] ?? r.method}` : ''}
                  {r.reason ? ` · ${r.reason}` : ''}
                </span>
                <span className="font-medium text-sq-text shrink-0">
                  −{formatUah(r.total_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-sq-divider shrink-0">
        <button
          type="button"
          className="w-full min-h-12 rounded-sq border border-red-300 bg-red-50 text-red-700 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onRefund}
          disabled={!canRefund(row)}
        >
          Повернення
        </button>
      </div>
    </>
  );
}
