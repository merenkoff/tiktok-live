import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { formatUah } from '../../lib/money';
import type { TodayAnalytics } from '../../types';

export function DashboardPage() {
  const [data, setData] = useState<TodayAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .today()
      .then(setData)
      .catch(() => setError('Не вдалося завантажити аналітику'));
  }, []);

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-sq-secondary text-sm">Завантаження…</p>;

  const metrics = [
    { label: 'Gross Sales', value: formatUah(data.gross_cents) },
    { label: 'Sales', value: String(data.sales_count) },
    { label: 'Average Sale', value: formatUah(data.avg_check_cents) },
    { label: 'Refunds', value: formatUah(data.refunded_cents) },
  ];

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Sales Reports</h2>
        <p className="text-sq-secondary text-sm mt-1">Сьогодні</p>
      </div>

      <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="sq-section-label">Sales summary overview</p>
          <span className="text-xs font-semibold text-sq-blue uppercase tracking-wide">
            Net {formatUah(data.net_cents)}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-3xl font-bold text-sq-text tracking-tight">{m.value}</p>
              <p className="text-xs text-sq-secondary mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm">
        <p className="sq-section-label mb-4">Top items</p>
        {data.top_items.length === 0 ? (
          <p className="text-sm text-sq-secondary">Поки немає продажів.</p>
        ) : (
          <ul className="divide-y divide-sq-divider">
            {data.top_items.map((item, idx) => (
              <li key={`${item.product_name}-${idx}`} className="py-3 flex justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-sq-text">{item.product_name}</p>
                  <p className="text-sq-secondary">{item.variant_label || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{item.qty_sold} шт</p>
                  <p className="text-sq-secondary">{formatUah(item.revenue_cents)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
