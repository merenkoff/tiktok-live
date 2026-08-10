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

const STATUS_LABEL: Record<string, string> = {
  draft: 'Чернетка',
  posted: 'Проведено',
  voided: 'Скасовано',
  reversed: 'Відмінено',
};

function apiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return 'Помилка';
}

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
    const stubs = (doc.lines ?? []).filter((l) => l.is_placeholder).length;
    if (stubs > 0) {
      const ok = window.confirm(
        `Буде створено ${stubs} ${stubs === 1 ? 'новий товар' : 'нових товарів'} у каталозі. Продовжити?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      setDoc(await api.postStockDocument(doc.id, crypto.randomUUID()));
    } catch (err) {
      setError(apiError(err));
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
      setError(apiError(err));
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
          {STATUS_LABEL[doc.status] ?? doc.status} · {new Date(doc.occurred_at).toLocaleString('uk-UA')}
          {doc.reason_code ? ` · ${doc.reason_code}` : ''}
        </p>
        {doc.note && <p className="text-sm mt-2">{doc.note}</p>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]">
        {(doc.lines ?? []).map((line) => {
          const isStub = Boolean(line.is_placeholder);
          const fromStub = Boolean(line.placeholder_name) && !isStub;
          return (
            <div key={line.id} className="px-4 py-3 flex justify-between gap-3 text-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {line.product_name} {[line.size, line.color].filter(Boolean).join('/')}
                  </p>
                  {isStub && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]">
                      Новий
                    </span>
                  )}
                </div>
                {isStub && (
                  <p className="text-xs text-[#6E6E6E]">Створиться при проведенні</p>
                )}
                {fromStub && line.product_id != null && (
                  <Link
                    to="/admin/products"
                    className="text-xs text-[#006AFF] hover:underline"
                  >
                    Відкрити в каталозі
                  </Link>
                )}
                {doc.type === 'inventory' && (
                  <p className="text-xs text-[#6E6E6E]">
                    Облік {line.system_qty} → пораховано {line.counted_qty}
                  </p>
                )}
                {line.unit_cost_cents != null && (
                  <p className="text-xs text-[#6E6E6E]">Закупка {formatUah(line.unit_cost_cents)}</p>
                )}
                {isStub && line.placeholder_price_cents != null && (
                  <p className="text-xs text-[#6E6E6E]">
                    Ціна продажу {formatUah(line.placeholder_price_cents)}
                  </p>
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
          );
        })}
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
