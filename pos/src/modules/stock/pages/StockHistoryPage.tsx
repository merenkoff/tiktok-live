// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@pos/platform';
import type { StockMovementRow } from '@pos/platform';

const REASON_UK: Record<string, string> = {
  sale: 'Продаж',
  refund: 'Повернення',
  void: 'Скасування чека',
  seed: 'Початковий',
  adjust: 'Корекція',
  receipt: 'Прихід',
  writeoff: 'Списання',
  inventory: 'Інвентаризація',
};

export function StockHistoryPage() {
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function reload(r?: string) {
    const data = await api.stockMovements({
      reason: r || undefined,
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
    });
    setRows(data);
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити історію'));
  }, []);

  return (
    <div className="max-w-5xl space-y-4">
      <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
        ← Склад
      </Link>
      <div>
        <p className="sq-section-label">Inventory history</p>
        <h1 className="text-2xl font-semibold mt-1">Історія рухів</h1>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setReason('');
            void reload('');
          }}
          className={`px-3 py-1.5 text-sm rounded-[4px] border ${
            !reason ? 'border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]' : 'border-[#E0E0E0] bg-white'
          }`}
        >
          Усі
        </button>
        {Object.entries(REASON_UK).map(([code, label]) => (
          <button
            key={code}
            type="button"
            onClick={() => {
              setReason(code);
              void reload(code);
            }}
            className={`px-3 py-1.5 text-sm rounded-[4px] border ${
              reason === code
                ? 'border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]'
                : 'border-[#E0E0E0] bg-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]">
        {rows.map((row) => (
          <div key={row.id} className="px-4 py-3 flex flex-wrap gap-3 justify-between text-sm">
            <div>
              <p className="font-medium">
                {row.product_name}{' '}
                <span className="text-[#6E6E6E] font-normal">
                  {[row.size, row.color].filter(Boolean).join('/')}
                </span>
              </p>
              <p className="text-xs text-[#6E6E6E] mt-0.5">
                {REASON_UK[row.reason] ?? row.reason}
                {row.staff_name ? ` · ${row.staff_name}` : ''}
                {row.note ? ` · ${row.note}` : ''}
              </p>
              <p className="text-xs text-[#6E6E6E]">
                {new Date(row.occurred_at).toLocaleString('uk-UA')}
              </p>
            </div>
            <div className="text-right">
              <p
                className={`font-semibold tabular-nums ${
                  row.delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {row.delta >= 0 ? `+${row.delta}` : row.delta}
              </p>
              {row.reference_type === 'stock_document' && row.reference_id && (
                <Link
                  to={`/admin/stock/documents/${row.reference_id}`}
                  className="text-xs text-[#006AFF] hover:underline"
                >
                  Документ
                </Link>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="p-6 text-sm text-[#6E6E6E] text-center">Немає рухів за період</p>
        )}
      </div>
    </div>
  );
}
