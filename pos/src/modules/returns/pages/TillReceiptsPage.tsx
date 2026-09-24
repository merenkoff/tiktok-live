// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatUah, useVertical } from '@pos/platform';
import type { LocalSaleRow, SaleDetail } from '@pos/platform';
import { ArrowLeft, Pencil, Receipt, SectionHead, useDragScroll, X } from '@pos/platform/ui';
import { returnsApi } from '../data/returnsApi';
import { RefundSaleDialog } from '../components/RefundSaleDialog';
import { FiscalBadge, FiscalDetailCard } from '../components/FiscalBadge';
import { SaleStatusChip } from '../components/SaleChips';

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

  /** Drop a queued sale the server will never accept. */
  async function discard(row: LocalSaleRow) {
    setError(null);
    try {
      await returnsApi.discardQueuedSale(row.client_uuid);
      setSelected(null);
      setDetail(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося видалити чек із черги');
    }
  }

  function onRefunded(updated: LocalSaleRow) {
    setRefunding(false);
    setSelected(updated);
    setDetail(updated.detail ?? detail);
    void reload().catch(() => undefined);
  }

  return (
    <>
      <header className="flex items-center gap-3 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0">
        <Receipt size={24} className="shrink-0" />
        <h1 className="text-2xl font-bold text-sq-heading">Чеки</h1>
        <Link
          to="/register"
          className="ml-auto min-h-12 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
        >
          <ArrowLeft size={20} aria-hidden />
          Каса
        </Link>
      </header>

      {error && (
        <div className="mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-4 md:gap-5 px-4 md:px-7 pb-4 md:pb-6 overflow-hidden">
        <section className="flex flex-col min-h-0 rounded-card bg-white shadow-card overflow-hidden">
          <div ref={listRef} className="flex-1 overflow-auto select-none">
            {rows.length === 0 ? (
              <Empty text="Поки немає чеків." />
            ) : (
              <ul>
                {rows.map((row) => {
                  const on = selected?.client_uuid === row.client_uuid;
                  return (
                    <li key={row.client_uuid} className="sq-row">
                      <button
                        type="button"
                        onClick={() => void openSale(row)}
                        aria-current={on || undefined}
                        className={`w-full text-left px-4 md:px-5 min-h-16 py-2.5 flex items-center gap-3 transition-colors ${
                          on ? 'bg-sq-selected' : 'hover:bg-sq-sidebar active:bg-sq-selected'
                        }`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-semibold text-sq-text tabular-nums truncate">
                            {row.receipt_number}
                          </span>
                          <span className="block text-[13px] text-sq-muted tabular-nums truncate">
                            {new Date(row.created_at).toLocaleString('uk-UA')} · {row.staff_name}
                          </span>
                        </span>
                        <span className="shrink-0 flex flex-col items-end gap-1">
                          <span className="text-base font-semibold text-sq-text tabular-nums">
                            {formatUah(row.total_cents)}
                          </span>
                          <span className="flex flex-wrap justify-end gap-1">
                            <SaleStatusChip status={row.status} />
                            <FiscalBadge status={row.fiscal_status} />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="hidden lg:flex flex-col min-h-0 rounded-card bg-white shadow-card overflow-hidden">
          {!selected ? (
            <div className="flex-1 grid place-items-center">
              <Empty text="Оберіть чек зліва." />
            </div>
          ) : (
            <SaleDetailPanel
              row={selected}
              detail={detail}
              loading={detailLoading}
              onRefund={() => setRefunding(true)}
              onDiscard={() => void discard(selected)}
            />
          )}
        </section>
      </div>

      {/* On narrow tills the detail lives in a sheet instead of the side column. */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-40 bg-white flex flex-col animate-fade-up">
          <div className="pl-5 pr-3 min-h-[60px] flex items-center justify-between gap-3 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))] shrink-0">
            <p className="text-[19px] font-bold text-sq-heading tabular-nums truncate">{selected.receipt_number}</p>
            <button
              type="button"
              aria-label="Закрити"
              className="w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
          </div>
          <SaleDetailPanel
            row={selected}
            detail={detail}
            loading={detailLoading}
            onRefund={() => setRefunding(true)}
            onDiscard={() => void discard(selected)}
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
  onDiscard,
}: {
  row: LocalSaleRow;
  detail: SaleDetail | null;
  loading: boolean;
  onRefund: () => void;
  onDiscard?: () => void;
}) {
  const bodyRef = useDragScroll<HTMLDivElement>();
  // A café's daily number sits on the detail, which is the only request that
  // carries it; the list rows are keyed by receipt number as everywhere else.
  const cafe = useVertical().id === 'cafe';

  return (
    <>
      <div ref={bodyRef} className="flex-1 overflow-auto px-5 md:px-6 py-5 space-y-5 select-none">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-[22px] font-bold text-sq-heading tabular-nums">
            {cafe && detail?.order_no != null && (
              <span className="inline-flex items-center h-7 px-2 rounded-md bg-sq-empty text-sm font-semibold tabular-nums">
                № {detail.order_no}
              </span>
            )}
            {/* The till's own number on a receipt still in the outbox (К3d).
                Spelled here rather than through `localOrderLabel`: this page
                ships in the `returns` remote and reaches the host only through
                `@pos/platform`, and «К» + n is not worth a platform export. */}
            {cafe && detail?.order_no == null && detail?.local_order_no != null && (
              <span
                className="inline-flex items-center h-7 px-2 rounded-md bg-sq-empty text-sm font-semibold tabular-nums"
                title="Номер каси — сервер призначить свій після синхронізації"
                data-testid="local-order-no"
              >
                К{detail.local_order_no}
              </span>
            )}
            {row.receipt_number}
          </h2>
          <p className="text-[15px] text-sq-secondary tabular-nums">
            {new Date(row.created_at).toLocaleString('uk-UA')} · {row.staff_name}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SaleStatusChip status={row.status} />
            {/* The list rows next to this one carry only `fiscal_status` — the
                mode lives on the document, which only the detail request
                returns. So an offline receipt reads as «реєструється» in the
                list and gets its real wording here, one tap away. */}
            <FiscalBadge status={row.fiscal_status} mode={detail?.fiscal?.mode} />
          </div>
          <FiscalDetailCard doc={detail?.fiscal} />
        </div>

        {detail ? (
          <ul>
            {detail.items.map((item) => (
              <li key={item.id} className="sq-row min-h-12 py-2 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="text-base text-sq-text">{item.product_name}</p>
                  <p className="text-[13px] text-sq-muted tabular-nums">
                    {item.variant_label} · {item.quantity} шт
                    {item.refunded_quantity > 0 ? ` (повернено ${item.refunded_quantity})` : ''}
                  </p>
                  {item.note && <p className="text-[13px] text-sq-muted italic"><Pencil size={16} aria-hidden className="inline-block align-[-3px] mr-1" />{item.note}</p>}
                </div>
                <span className="text-base font-medium text-sq-text tabular-nums shrink-0">
                  {formatUah(item.line_total_cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-sq-secondary">
            {loading ? 'Завантаження…' : 'Позиції цього чека недоступні офлайн.'}
          </p>
        )}

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-bold text-sq-heading">Разом</span>
          <span className="text-[26px] font-bold text-sq-heading tabular-nums">{formatUah(row.total_cents)}</span>
        </div>

        {detail && detail.payments.length > 0 && (
          <ul className="space-y-1.5 text-[15px]">
            {detail.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="text-sq-secondary">{PAYMENT_LABEL_UK[p.method] ?? p.method}</span>
                <span className="text-sq-text tabular-nums">{formatUah(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}

        {detail && detail.refunds.length > 0 && (
          <div>
            <SectionHead title="Повернення" />
            <ul>
              {detail.refunds.map((r) => (
                <li key={r.id} className="sq-row min-h-11 py-2 flex justify-between items-center gap-2 text-[15px]">
                  <span className="text-sq-secondary">
                    {r.refund_number ?? '—'}
                    {r.method ? ` · ${PAYMENT_LABEL_UK[r.method] ?? r.method}` : ''}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </span>
                  <span className="text-sq-text tabular-nums shrink-0">
                    −{formatUah(r.total_cents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="px-5 md:px-6 pt-3 pb-4 shrink-0 space-y-3 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
        <button
          type="button"
          className="w-full min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[17px] font-semibold text-red-600 hover:bg-sq-sidebar disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={onRefund}
          disabled={!canRefund(row)}
        >
          Повернення
        </button>
        {row.sync_state === 'dead' && (
          // A queued sale the server will never accept. Until now the only way
          // to clear one was to take the till offline first.
          <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm space-y-2">
            <p className="font-semibold">Чек не потрапив на сервер</p>
            <p>{row.detail?.fiscal?.error_message ?? 'Сервер відхилив цей чек.'}</p>
            <button
              type="button"
              className="w-full min-h-11 rounded-sq bg-white ring-1 ring-red-200 text-red-700 text-[15px] font-semibold"
              onClick={() => void onDiscard?.()}
            >
              Видалити з черги
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** A colour glyph and one quiet line, centred — Things' empty list. */
function Empty({ text }: { text: string }) {
  return (
    <div className="py-12 px-4 flex flex-col items-center gap-3 text-center">
      <Receipt size={48} />
      <p className="text-[15px] text-sq-secondary">{text}</p>
    </div>
  );
}
