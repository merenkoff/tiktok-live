// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@pos/platform';
import type { StockMovementRow } from '@pos/platform';
import { ListOrdered, PageHeader } from '@pos/platform/ui';

const REASON_UK: Record<string, string> = {
  sale: 'Продаж',
  refund: 'Повернення',
  void: 'Скасування чека',
  seed: 'Початковий',
  adjust: 'Корекція',
  receipt: 'Прихід',
  writeoff: 'Списання',
  inventory: 'Інвентаризація',
  production: 'Виробництво',
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

  /** A tag-bar chip: the chosen one is grey, the rest are quiet text. */
  const chip = (on: boolean) =>
    `h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${
      on ? 'bg-sq-selected font-semibold text-sq-text' : 'text-sq-secondary hover:bg-sq-selected/50'
    }`;

  return (
    <div className="max-w-5xl space-y-5 animate-fade-up text-sq-text">
      <PageHeader back={{ to: '/admin/stock', label: 'Склад' }} glyph={ListOrdered} title="Історія рухів" />

      <div className="flex flex-wrap gap-1" role="group" aria-label="Причина">
        <button
          type="button"
          aria-pressed={!reason}
          onClick={() => {
            setReason('');
            void reload('');
          }}
          className={chip(!reason)}
        >
          Усі
        </button>
        {Object.entries(REASON_UK).map(([code, label]) => (
          <button
            key={code}
            type="button"
            aria-pressed={reason === code}
            onClick={() => {
              setReason(code);
              void reload(code);
            }}
            className={chip(reason === code)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul>
        {rows.map((row) => (
          <li key={row.id} className="sq-row min-h-12 py-2 flex gap-3 justify-between">
            <div className="min-w-0">
              <p className="text-base">
                {row.product_name}{' '}
                <span className="text-sq-muted">
                  {row.label}
                </span>
              </p>
              <p className="text-[13px] text-sq-secondary mt-0.5">
                {REASON_UK[row.reason] ?? row.reason}
                {row.staff_name ? ` · ${row.staff_name}` : ''}
                {row.note ? ` · ${row.note}` : ''}
              </p>
              <p className="text-[13px] text-sq-muted tabular-nums">
                {new Date(row.occurred_at).toLocaleString('uk-UA')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p
                className={`text-base font-semibold tabular-nums ${
                  row.delta >= 0 ? 'text-sq-success-ink' : 'text-sq-danger'
                }`}
              >
                {row.delta >= 0 ? `+${row.delta}` : row.delta}
              </p>
              {row.reference_type === 'stock_document' && row.reference_id && (
                <Link
                  to={`/admin/stock/documents/${row.reference_id}`}
                  className="text-[13px] font-semibold text-sq-blue"
                >
                  Документ
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && (
        <div className="py-10 flex flex-col items-center gap-2">
          <ListOrdered size={48} />
          <p className="text-[15px] text-sq-secondary">Немає рухів за період</p>
        </div>
      )}
    </div>
  );
}
