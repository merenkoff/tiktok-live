// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { api } from '@pos/platform';
import type { MovementSummaryRow } from '@pos/platform';
import { BarChart3, PageHeader, useDragScroll } from '@pos/platform/ui';

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export function StockMovementPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<MovementSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tableScrollRef = useDragScroll<HTMLDivElement>();

  async function load() {
    setError(null);
    try {
      const data = await api.stockMovementSummary(
        startOfDayIso(new Date(from)),
        endOfDayIso(new Date(to))
      );
      setRows(data);
    } catch {
      setError('Не вдалося побудувати звіт');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl space-y-5 animate-fade-up text-sq-text">
      <PageHeader back={{ to: '/admin/stock', label: 'Склад' }} glyph={BarChart3} title="Рух за період" />

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-sq-secondary">Від</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="sq-input"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-sq-secondary">До</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="sq-input"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
        >
          Показати
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div ref={tableScrollRef} className="overflow-x-auto select-none">
        <table className="sq-table min-w-[800px]">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="text-right">Початковий</th>
              <th className="text-right">Прихід</th>
              <th className="text-right">Продаж</th>
              <th className="text-right">Списання</th>
              <th className="text-right">Корекції</th>
              <th className="text-right">Інвент.</th>
              <th className="text-right">Кінцевий</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.variant_id}>
                <td>
                  {row.product_name}{' '}
                  <span className="text-sq-muted">
                    {row.label}
                  </span>
                </td>
                <td className="text-right tabular-nums">{row.opening}</td>
                <td className="text-right tabular-nums">{row.receipt || '—'}</td>
                <td className="text-right tabular-nums">{row.sale || '—'}</td>
                <td className="text-right tabular-nums">{row.writeoff || '—'}</td>
                <td className="text-right tabular-nums">{row.adjust || '—'}</td>
                <td className="text-right tabular-nums">{row.inventory || '—'}</td>
                <td className="text-right tabular-nums font-semibold text-sq-heading">{row.closing}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10">
                  <div className="flex flex-col items-center gap-2">
                    <BarChart3 size={48} />
                    <p className="text-[15px] text-sq-secondary">Немає руху за вибраний період</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
