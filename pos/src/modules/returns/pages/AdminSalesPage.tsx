// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { formatUah } from '@pos/platform';
import type { SaleDetail, SaleListItem } from '@pos/platform';
import { adminReturnsApi } from '../data/returnsApi';

const SALE_STATUS_UK: Record<string, string> = {
  completed: 'Завершено',
  voided: 'Скасовано',
  refunded: 'Повернено',
  partially_refunded: 'Часткове повернення',
};

function saleStatusLabel(status: string): string {
  return SALE_STATUS_UK[status] ?? status;
}

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

  return (
    <div className="space-y-6 animate-fade-up text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Продажі</h2>
        <p className="text-sq-secondary mt-1 text-sm">Історія чеків, скасування та повернення.</p>
      </div>

      {error && <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-sq-surface border border-sq-divider rounded-sq divide-y divide-sq-divider overflow-hidden shadow-sm">
          {sales.map((sale) => (
            <button
              key={sale.id}
              type="button"
              onClick={() => void openSale(sale.id)}
              className="w-full text-left px-4 py-3 hover:bg-sq-bg flex justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-sq-text">{sale.receipt_number}</p>
                <p className="text-xs text-sq-secondary">
                  {new Date(sale.created_at).toLocaleString('uk-UA')} · {sale.staff_name}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-sq-text">{formatUah(sale.total_cents)}</p>
                <p className="text-xs text-sq-secondary">
                  {saleStatusLabel(sale.status)}
                  {sale.qr_pending && (
                    <span className="ml-2 text-amber-600">QR не підтверджено</span>
                  )}
                </p>
              </div>
            </button>
          ))}
          {sales.length === 0 && <p className="p-4 text-sq-secondary text-sm">Поки немає продажів.</p>}
        </section>

        <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 min-h-[240px] shadow-sm">
          {!selected ? (
            <p className="text-sq-secondary text-sm">Оберіть чек зліва.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-sq-text">{selected.receipt_number}</h3>
                <p className="text-sm text-sq-secondary">
                  {saleStatusLabel(selected.status)} · {selected.staff_name}
                </p>
              </div>
              <ul className="space-y-2 text-sm">
                {selected.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2 items-center">
                    <div>
                      <p className="font-medium text-sq-text">{item.product_name}</p>
                      <p className="text-sq-secondary">
                        {item.variant_label} · {item.quantity} шт
                        {item.refunded_quantity > 0 ? ` (повернено ${item.refunded_quantity})` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.status !== 'voided' && selected.status !== 'refunded' && (
                        <input
                          type="number"
                          min={0}
                          max={item.quantity - item.refunded_quantity}
                          className="w-16 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1 text-sq-text"
                          value={refundQty[item.id] ?? 0}
                          onChange={(e) =>
                            setRefundQty((prev) => ({
                              ...prev,
                              [item.id]: Number(e.target.value),
                            }))
                          }
                        />
                      )}
                      <span className="font-semibold text-sq-text">{formatUah(item.line_total_cents)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="font-bold text-lg text-sq-text">Разом: {formatUah(selected.total_cents)}</p>

              {selected.payments.length > 0 && (
                <ul className="space-y-1.5 text-sm border-t border-sq-divider pt-3">
                  {selected.payments.map((p) => (
                    <li key={p.id} className="flex justify-between items-center gap-2">
                      <span className="text-sq-secondary">
                        {PAYMENT_LABEL_UK[p.method] ?? p.method}
                        {p.method === 'qr' &&
                          (p.confirmed_at ? (
                            <span className="ml-2 text-xs font-semibold text-emerald-600">
                              оплату підтверджено
                            </span>
                          ) : (
                            <span className="ml-2 text-xs font-semibold text-amber-600">
                              очікує підтвердження
                            </span>
                          ))}
                      </span>
                      <span className="font-medium text-sq-text">{formatUah(p.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {selected.refunds.length > 0 && (
                <ul className="space-y-1.5 text-sm border-t border-sq-divider pt-3">
                  <li className="sq-section-label">Повернення</li>
                  {selected.refunds.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="text-sq-secondary">
                        {r.refund_number ?? '—'}
                        {r.method ? ` · ${PAYMENT_LABEL_UK[r.method] ?? r.method}` : ''}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </span>
                      <span className="font-medium text-sq-text">−{formatUah(r.total_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {(selected.status === 'completed' || selected.status === 'partially_refunded') && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void onRefundAll()} className="rounded-sq border border-red-300 bg-red-50 text-red-700 px-4 py-2 text-sm font-semibold">
                    Повернути все
                  </button>
                  <button type="button" onClick={() => void onRefund()} className="sq-btn-primary px-4 py-2 text-sm">
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
