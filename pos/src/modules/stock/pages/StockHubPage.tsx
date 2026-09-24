// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatUah } from '@pos/platform';
import type { LowStockRow, OnHandRow, StockDocument } from '@pos/platform';
import {
  AlertTriangle,
  FileText,
  Package,
  PageHeader,
  SectionHead,
  Warehouse,
  useDragScroll,
} from '@pos/platform/ui';
import { ManageStockModal } from '../components/ManageStockModal';
import { STATUS_LABEL, TYPE_GLYPH, TYPE_LABEL, statusChipClass } from '../lib/documents';

/** The five documents the owner starts from here, in the order a day uses them. */
const ACTIONS = [
  { to: '/admin/stock/receipt', type: 'receipt', label: 'Прихід товару', hint: 'Від постачальника' },
  { to: '/admin/stock/writeoff', type: 'writeoff', label: 'Списання', hint: 'Брак і втрати' },
  { to: '/admin/stock/adjust', type: 'adjustment', label: 'Корекція', hint: 'Виправити залишок' },
  { to: '/admin/stock/inventory', type: 'inventory', label: 'Інвентаризація', hint: 'Перерахувати все' },
  { to: '/admin/stock/production', type: 'production', label: 'Виробництво', hint: 'Зібрати складений товар' },
] as const;

export function StockHubPage() {
  const [rows, setRows] = useState<OnHandRow[]>([]);
  const [low, setLow] = useState<LowStockRow[]>([]);
  const [docs, setDocs] = useState<StockDocument[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState<OnHandRow | null>(null);
  const tableScrollRef = useDragScroll<HTMLDivElement>();

  async function reload() {
    const [onHand, lowStock, recent] = await Promise.all([
      api.stockOnHand(),
      api.stockLow(),
      api.listStockDocuments({}),
    ]);
    setRows(onHand);
    setLow(lowStock.slice(0, 5));
    setDocs(recent.slice(0, 8));
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити склад'));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.product_name, r.label, r.sku, r.barcode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [rows, q]);

  return (
    <div className="space-y-7 animate-fade-up max-w-6xl text-sq-text">
      <PageHeader
        glyph={Warehouse}
        title="Склад"
        actions={
          <>
            <Link to="/admin/stock/history" className="sq-btn-quiet">
              Історія рухів
            </Link>
            <Link to="/admin/stock/movement" className="sq-btn-quiet">
              Звіт «Рух за період»
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {ACTIONS.map((a) => {
          const Icon = TYPE_GLYPH[a.type];
          return (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-xl bg-sq-sidebar px-[18px] py-4 flex flex-col gap-2 hover:bg-sq-selected/60 transition-colors"
            >
              <Icon size={24} />
              <span className="text-[15px] font-semibold text-sq-heading leading-tight">{a.label}</span>
              <span className="text-[13px] text-sq-secondary leading-snug">{a.hint}</span>
            </Link>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {low.length > 0 && (
        <section>
          <SectionHead title="Мало на складі" />
          <ul>
            {low.map((item) => (
              <li key={item.variant_id} className="sq-row min-h-11 py-1.5 flex items-center gap-3">
                <AlertTriangle size={24} className="shrink-0" />
                <span className="flex-1 min-w-0 text-base truncate">
                  {item.product_name} <span className="text-sq-muted">{item.label}</span>
                </span>
                <span className="text-sm tabular-nums text-sq-danger font-semibold shrink-0">
                  {item.quantity} шт
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHead title="Огляд залишків" />
        <div className="flex gap-3 items-center pt-3 pb-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук товару, SKU, штрихкод…"
            className="sq-input flex-1"
          />
          <span className="text-sm text-sq-muted tabular-nums whitespace-nowrap">{filtered.length} поз.</span>
        </div>
        <div ref={tableScrollRef} className="overflow-x-auto select-none">
          <table className="sq-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Варіант</th>
                <th className="text-right">Залишок</th>
                <th className="text-right">Ціна</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.variant_id}>
                  <td>{row.product_name}</td>
                  <td className="text-sq-muted">{row.label || '—'}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => setManage(row)}
                      className="min-h-9 px-1 font-semibold text-sq-blue hover:underline tabular-nums"
                    >
                      {row.quantity}
                    </button>
                  </td>
                  <td className="text-right tabular-nums">{formatUah(row.price_cents)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10">
                    <div className="flex flex-col items-center gap-2">
                      <Package size={48} />
                      <p className="text-[15px] text-sq-secondary">Немає товарів</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHead title="Останні документи" />
        {docs.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2">
            <FileText size={48} />
            <p className="text-[15px] text-sq-secondary">Поки немає складських документів</p>
          </div>
        ) : (
          <ul>
            {docs.map((d) => {
              const Icon = TYPE_GLYPH[d.type] ?? FileText;
              return (
                <li key={d.id} className="sq-row">
                  <Link
                    to={`/admin/stock/documents/${d.id}`}
                    className="min-h-12 py-1.5 -mx-2 px-2 rounded-lg flex items-center gap-3 hover:bg-sq-sidebar/60"
                  >
                    <Icon size={24} className="shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-base truncate">
                        {TYPE_LABEL[d.type] ?? d.type} · {d.doc_number}
                      </span>
                      <span className="block text-[13px] text-sq-muted tabular-nums">
                        {new Date(d.occurred_at).toLocaleString('uk-UA')}
                      </span>
                    </span>
                    <span className={statusChipClass(d.status)}>{STATUS_LABEL[d.status] ?? d.status}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {manage && (
        <ManageStockModal
          row={manage}
          onClose={() => setManage(null)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}
