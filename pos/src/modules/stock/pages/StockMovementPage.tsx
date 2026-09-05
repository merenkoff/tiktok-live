// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@pos/platform';
import type { MovementSummaryRow } from '@pos/platform';
import { useDragScroll } from '@pos/platform/ui';

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
    <div className="max-w-6xl space-y-4">
      <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
        ← Склад
      </Link>
      <div>
        <p className="sq-section-label">Movement report</p>
        <h1 className="text-2xl font-semibold mt-1">Рух за період</h1>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm space-y-1">
          <span className="text-[#6E6E6E] block">Від</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-[#6E6E6E] block">До</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2"
          />
        </label>
        <button type="button" onClick={() => void load()} className="sq-btn-primary px-4 py-2.5 text-sm">
          Показати
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div ref={tableScrollRef} className="rounded-[4px] border border-[#E0E0E0] bg-white overflow-x-auto select-none">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-[#F5F5F5] text-left text-[#6E6E6E]">
            <tr>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 font-medium text-right">Початковий</th>
              <th className="px-3 py-2 font-medium text-right">Прихід</th>
              <th className="px-3 py-2 font-medium text-right">Продаж</th>
              <th className="px-3 py-2 font-medium text-right">Списання</th>
              <th className="px-3 py-2 font-medium text-right">Корекції</th>
              <th className="px-3 py-2 font-medium text-right">Інвент.</th>
              <th className="px-3 py-2 font-medium text-right">Кінцевий</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.variant_id} className="border-t border-[#E0E0E0]">
                <td className="px-3 py-2">
                  {row.product_name}{' '}
                  <span className="text-[#6E6E6E]">
                    {[row.size, row.color].filter(Boolean).join('/')}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.opening}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.receipt || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.sale || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.writeoff || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.adjust || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.inventory || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.closing}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[#6E6E6E]">
                  Немає руху за вибраний період
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
