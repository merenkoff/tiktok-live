import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../services/api';
import { formatUah } from '../../../lib/money';
import type { StockDocument } from '../../../types';

const TYPE_LABEL: Record<string, string> = {
  receipt: 'Прихід',
  writeoff: 'Списання',
  adjustment: 'Корекція',
  inventory: 'Інвентаризація',
};

export function StockDocumentDetailPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<StockDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .getStockDocument(Number(id))
      .then(setDoc)
      .catch(() => setError('Документ не знайдено'));
  }, [id]);

  async function post() {
    if (!doc) return;
    setBusy(true);
    try {
      setDoc(await api.postStockDocument(doc.id, crypto.randomUUID()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function reverse() {
    if (!doc) return;
    if (!window.confirm('Скасувати проведення цього документа?')) return;
    setBusy(true);
    try {
      const rev = await api.reverseStockDocument(doc.id);
      setDoc(await api.getStockDocument(doc.id));
      void rev;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  if (error && !doc) {
    return (
      <div>
        <Link to="/admin/stock" className="text-sm text-[#006AFF]">
          ← Склад
        </Link>
        <p className="mt-4 text-red-600">{error}</p>
      </div>
    );
  }

  if (!doc) return <p className="text-[#6E6E6E]">Завантаження…</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
        ← Склад
      </Link>
      <div>
        <p className="sq-section-label">{TYPE_LABEL[doc.type] ?? doc.type}</p>
        <h1 className="text-2xl font-semibold">{doc.doc_number}</h1>
        <p className="text-sm text-[#6E6E6E] mt-1">
          {doc.status} · {new Date(doc.occurred_at).toLocaleString('uk-UA')}
          {doc.reason_code ? ` · ${doc.reason_code}` : ''}
        </p>
        {doc.note && <p className="text-sm mt-2">{doc.note}</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]">
        {(doc.lines ?? []).map((line) => (
          <div key={line.id} className="px-4 py-3 flex justify-between gap-3 text-sm">
            <div>
              <p className="font-medium">
                {line.product_name} {[line.size, line.color].filter(Boolean).join('/')}
              </p>
              {doc.type === 'inventory' && (
                <p className="text-xs text-[#6E6E6E]">
                  Облік {line.system_qty} → пораховано {line.counted_qty}
                </p>
              )}
              {line.unit_cost_cents != null && (
                <p className="text-xs text-[#6E6E6E]">Закупка {formatUah(line.unit_cost_cents)}</p>
              )}
            </div>
            <p className="font-semibold tabular-nums">
              {doc.type === 'inventory'
                ? line.quantity
                : doc.type === 'writeoff'
                  ? `−${line.quantity}`
                  : doc.type === 'adjustment'
                    ? line.quantity > 0
                      ? `+${line.quantity}`
                      : line.quantity
                    : `+${line.quantity}`}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {doc.status === 'draft' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void post()}
            className="sq-btn-primary px-4 py-2.5 text-sm"
          >
            Провести
          </button>
        )}
        {doc.status === 'posted' && doc.type !== 'inventory' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void reverse()}
            className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm"
          >
            Скасувати проведення
          </button>
        )}
        {doc.type === 'inventory' && (
          <Link
            to={`/admin/stock/inventory/${doc.id}`}
            className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm"
          >
            Відкрити підрахунок
          </Link>
        )}
      </div>
    </div>
  );
}
