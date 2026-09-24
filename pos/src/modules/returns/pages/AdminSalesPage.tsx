// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { formatUah, useVertical } from '@pos/platform';
import type { SaleDetail, SaleListItem } from '@pos/platform';
import { adminReturnsApi } from '../data/returnsApi';
import { FiscalBadge, FiscalDetailCard } from '../components/FiscalBadge';
import { Chip, SaleStatusChip } from '../components/SaleChips';
import { PageHeader, Pencil, Receipt, SectionHead } from '@pos/platform/ui';

const PAYMENT_LABEL_UK: Record<string, string> = {
  cash: 'Готівка',
  card: 'Картка',
  qr: 'QR-код',
};

export function AdminSalesPage() {
  const [sales, setSales] = useState<SaleListItem[]>([]);
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundQty, setRefundQty] = useState<Record<number, number>>({});

  async function reload() {
    setSales(await adminReturnsApi.listSales(100));
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити продажі'));
  }, []);

  async function openSale(id: number) {
    const sale = await adminReturnsApi.getSale(id);
    setSelected(sale);
    const initial: Record<number, number> = {};
    for (const item of sale.items) {
      initial[item.id] = 0;
    }
    setRefundQty(initial);
  }

  // Cancelling a receipt is a refund of everything left on it. Under ПРРО a
  // receipt the tax service has seen can only be undone that way, so the admin
  // and the till share one model rather than two.
  async function onRefundAll() {
    if (!selected) return;
    const items = selected.items
      .map((item) => ({
        sale_item_id: item.id,
        quantity: item.quantity - item.refunded_quantity,
      }))
      .filter((line) => line.quantity > 0);
    if (items.length === 0) {
      setError('За цим чеком уже все повернуто');
      return;
    }
    if (!confirm('Повернути весь чек і товар на склад?')) return;
    await submitRefund(items);
  }

  async function onRefund() {
    if (!selected) return;
    const items = Object.entries(refundQty)
      .filter(([, qty]) => qty > 0)
      .map(([sale_item_id, quantity]) => ({
        sale_item_id: Number(sale_item_id),
        quantity,
      }));
    if (items.length === 0) {
      setError('Оберіть кількість для повернення');
      return;
    }
    await submitRefund(items);
  }

  async function submitRefund(items: Array<{ sale_item_id: number; quantity: number }>) {
    if (!selected) return;
    try {
      const sale = await adminReturnsApi.refundSale(selected.id, items, {
        client_uuid: crypto.randomUUID(),
      });
      setSelected(sale);
      setRefundQty(Object.fromEntries(sale.items.map((i) => [i.id, 0])));
      await reload();
    } catch {
      setError('Не вдалося оформити повернення');
    }
  }

  // The daily order number is a café's — the counter calls it out. Anywhere
  // else the receipt number is the only name a sale has.
  const cafe = useVertical().id === 'cafe';

  return (
    <div className="animate-fade-up text-sq-text">
      <PageHeader glyph={Receipt} title="Продажі" subtitle="Історія чеків, скасування та повернення." />

      {error && <div className="mb-5 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-6 items-start">
        <section>
          {sales.length === 0 ? (
            <Empty text="Поки немає продажів." />
          ) : (
            <ul>
              {sales.map((sale) => {
                const on = selected?.id === sale.id;
                return (
                  <li key={sale.id} className="sq-row">
                    <button
                      type="button"
                      onClick={() => void openSale(sale.id)}
                      aria-current={on || undefined}
                      className={`w-[calc(100%+1rem)] text-left -mx-2 px-2 min-h-[60px] py-2 rounded-lg flex items-center gap-3 transition-colors ${
                        on ? 'bg-sq-selected' : 'hover:bg-sq-sidebar/60'
                      }`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 text-base font-medium text-sq-text tabular-nums">
                          {cafe && sale.order_no != null && (
                            <span
                              className="inline-flex items-center h-[22px] px-2 rounded-md bg-sq-empty text-xs font-semibold tabular-nums"
                              data-testid="sale-order-no"
                            >
                              № {sale.order_no}
                            </span>
                          )}
                          <span className="truncate">{sale.receipt_number}</span>
                        </span>
                        <span className="block text-[13px] text-sq-muted tabular-nums truncate">
                          {new Date(sale.created_at).toLocaleString('uk-UA')} · {sale.staff_name}
                        </span>
                      </span>
                      <span className="shrink-0 flex flex-col items-end gap-1">
                        <span className="text-base font-semibold text-sq-text tabular-nums">
                          {formatUah(sale.total_cents)}
                        </span>
                        <span className="flex flex-wrap justify-end gap-1">
                          <SaleStatusChip status={sale.status} />
                          {sale.qr_pending && <Chip tone="warning">QR не підтверджено</Chip>}
                          <FiscalBadge status={sale.fiscal_status} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="sq-card p-5 md:p-6 min-h-[240px]">
          {!selected ? (
            <Empty text="Оберіть чек зліва." />
          ) : (
            <div className="space-y-5">
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-[22px] font-bold text-sq-heading tabular-nums">
                  {cafe && selected.order_no != null && (
                    <span className="inline-flex items-center h-7 px-2 rounded-md bg-sq-empty text-sm font-semibold tabular-nums">
                      № {selected.order_no}
                    </span>
                  )}
                  {selected.receipt_number}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <SaleStatusChip status={selected.status} />
                  <FiscalBadge status={selected.fiscal_status} mode={selected.fiscal?.mode} />
                  <span className="text-[15px] text-sq-secondary">{selected.staff_name}</span>
                </div>
                <FiscalDetailCard doc={selected.fiscal} />
              </div>
              <ul>
                {selected.items.map((item) => (
                  <li key={item.id} className="sq-row min-h-12 py-2 flex justify-between gap-3 items-center">
                    <div className="min-w-0">
                      <p className="text-base text-sq-text">{item.product_name}</p>
                      <p className="text-[13px] text-sq-muted tabular-nums">
                        {item.variant_label} · {item.quantity} шт
                        {item.refunded_quantity > 0 ? ` (повернено ${item.refunded_quantity})` : ''}
                      </p>
                      {item.note && <p className="text-[13px] text-sq-muted italic"><Pencil size={16} aria-hidden className="inline-block align-[-3px] mr-1" />{item.note}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {selected.status !== 'voided' && selected.status !== 'refunded' && (
                        <input
                          type="number"
                          min={0}
                          max={item.quantity - item.refunded_quantity}
                          aria-label={`Повернути: ${item.product_name}`}
                          className="sq-input !w-20 text-center tabular-nums"
                          value={refundQty[item.id] ?? 0}
                          onChange={(e) =>
                            setRefundQty((prev) => ({
                              ...prev,
                              [item.id]: Number(e.target.value),
                            }))
                          }
                        />
                      )}
                      <span className="w-24 text-right text-base font-medium text-sq-text tabular-nums">
                        {formatUah(item.line_total_cents)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-bold text-sq-heading">Разом</span>
                <span className="text-[26px] font-bold text-sq-heading tabular-nums">{formatUah(selected.total_cents)}</span>
              </div>

              {selected.payments.length > 0 && (
                <ul className="space-y-1.5 text-[15px]">
                  {selected.payments.map((p) => (
                    <li key={p.id} className="flex justify-between items-center gap-2">
                      <span className="flex flex-wrap items-center gap-2 text-sq-secondary">
                        {PAYMENT_LABEL_UK[p.method] ?? p.method}
                        {p.method === 'qr' &&
                          (p.confirmed_at ? (
                            <Chip tone="success">оплату підтверджено</Chip>
                          ) : (
                            <Chip tone="warning">очікує підтвердження</Chip>
                          ))}
                      </span>
                      <span className="text-sq-text tabular-nums">{formatUah(p.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {selected.refunds.length > 0 && (
                <div>
                  <SectionHead title="Повернення" />
                  <ul>
                    {selected.refunds.map((r) => (
                      <li key={r.id} className="sq-row min-h-11 py-2 flex justify-between items-center gap-2 text-[15px]">
                        <span className="text-sq-secondary">
                          {r.refund_number ?? '—'}
                          {r.method ? ` · ${PAYMENT_LABEL_UK[r.method] ?? r.method}` : ''}
                          {r.reason ? ` · ${r.reason}` : ''}
                        </span>
                        <span className="text-sq-text tabular-nums shrink-0">−{formatUah(r.total_cents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selected.status === 'completed' || selected.status === 'partially_refunded') && (
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void onRefundAll()}
                    className="sq-btn-quiet !text-red-600"
                  >
                    Повернути все
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRefund()}
                    className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
                  >
                    Повернення
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** A colour glyph and one quiet line, centred — Things' empty list. */
function Empty({ text }: { text: string }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center">
      <Receipt size={48} />
      <p className="text-[15px] text-sq-secondary">{text}</p>
    </div>
  );
}
