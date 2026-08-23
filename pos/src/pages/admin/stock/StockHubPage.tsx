import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../services/api';
import { formatUah } from '../../../lib/money';
import { ManageStockModal } from '../../../components/ManageStockModal';
import type { LowStockRow, OnHandRow, StockDocument } from '../../../types';
import { useDragScroll } from '../../../hooks/useDragScroll';

const TYPE_LABEL: Record<string, string> = {
  receipt: 'Прихід',
  writeoff: 'Списання',
  adjustment: 'Корекція',
  inventory: 'Інвентаризація',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Чернетка',
  posted: 'Проведено',
  voided: 'Скасовано',
  reversed: 'Відмінено',
};

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
      [r.product_name, r.size, r.color, r.sku, r.barcode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [rows, q]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <p className="sq-section-label">Склад</p>
        <h1 className="text-2xl font-semibold mt-1">Огляд залишків</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { to: '/admin/stock/receipt', label: 'Прихід товару', hint: 'Receive' },
          { to: '/admin/stock/writeoff', label: 'Списання', hint: 'Damage / loss' },
          { to: '/admin/stock/adjust', label: 'Корекція', hint: 'Adjust' },
          { to: '/admin/stock/inventory', label: 'Інвентаризація', hint: 'Stock count' },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-5 hover:border-[#006AFF] transition-colors"
          >
            <p className="font-semibold text-[#1A1A1A]">{a.label}</p>
            <p className="text-xs text-[#6E6E6E] mt-1">{a.hint}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="/admin/stock/history" className="text-[#006AFF] hover:underline">
          Історія рухів
        </Link>
        <span className="text-[#E0E0E0]">·</span>
        <Link to="/admin/stock/movement" className="text-[#006AFF] hover:underline">
          Звіт «Рух за період»
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {low.length > 0 && (
        <div className="rounded-[4px] border border-[#F5D0C8] bg-[#FFF8F6] p-4">
          <p className="text-sm font-medium text-[#B33B1E]">Мало на складі</p>
          <ul className="mt-2 space-y-1 text-sm">
            {low.map((item) => (
              <li key={item.variant_id}>
                {item.product_name} {[item.size, item.color].filter(Boolean).join('/')} —{' '}
                <strong>{item.quantity}</strong> шт
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-[4px] border border-[#E0E0E0] bg-white overflow-hidden">
        <div className="p-3 border-b border-[#E0E0E0] flex gap-3 items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук товару, SKU, штрихкод…"
            className="flex-1 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
          />
          <span className="text-sm text-[#6E6E6E] whitespace-nowrap">{filtered.length} поз.</span>
        </div>
        <div ref={tableScrollRef} className="overflow-x-auto select-none">
          <table className="w-full text-sm">
            <thead className="bg-[#F5F5F5] text-left text-[#6E6E6E]">
              <tr>
                <th className="px-3 py-2 font-medium">Товар</th>
                <th className="px-3 py-2 font-medium">Варіант</th>
                <th className="px-3 py-2 font-medium text-right">On Hand</th>
                <th className="px-3 py-2 font-medium text-right">Ціна</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.variant_id} className="border-t border-[#E0E0E0]">
                  <td className="px-3 py-2.5">{row.product_name}</td>
                  <td className="px-3 py-2.5 text-[#6E6E6E]">
                    {[row.size, row.color].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setManage(row)}
                      className="font-semibold text-[#006AFF] hover:underline tabular-nums"
                    >
                      {row.quantity}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatUah(row.price_cents)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-[#6E6E6E]">
                    Немає товарів
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="sq-section-label mb-2">Останні документи</p>
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]">
          {docs.length === 0 && (
            <p className="p-4 text-sm text-[#6E6E6E]">Поки немає складських документів</p>
          )}
          {docs.map((d) => (
            <Link
              key={d.id}
              to={`/admin/stock/documents/${d.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-[#F5F5F5]"
            >
              <div>
                <p className="text-sm font-medium">
                  {TYPE_LABEL[d.type] ?? d.type} · {d.doc_number}
                </p>
                <p className="text-xs text-[#6E6E6E]">
                  {new Date(d.occurred_at).toLocaleString('uk-UA')}
                </p>
              </div>
              <span className="text-xs text-[#6E6E6E]">{STATUS_LABEL[d.status] ?? d.status}</span>
            </Link>
          ))}
        </div>
      </div>

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
