import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../services/api';
import type { StockDocument, StockDocumentLine } from '../../../types';

export function StockInventoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<StockDocument | null>(null);
  const [lines, setLines] = useState<StockDocumentLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  async function load(documentId: number) {
    const d = await api.getStockDocument(documentId);
    setDoc(d);
    setLines(d.lines ?? []);
  }

  useEffect(() => {
    if (!id) return;
    void load(Number(id)).catch(() => setError('Не вдалося завантажити'));
  }, [id]);

  async function startFull() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createStockDocument({ type: 'inventory', note: 'Повна інвентаризація' });
      await api.bulkInventoryLines(created.id, {});
      navigate(`/admin/stock/inventory/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!doc) return;
    setBusy(true);
    try {
      const refreshed = await api.refreshInventorySystemQty(doc.id);
      setLines(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  async function setCounted(line: StockDocumentLine, counted: number) {
    if (!doc || doc.status !== 'draft') return;
    const updated = await api.updateStockDocumentLine(doc.id, line.id, { counted_qty: counted });
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, ...updated } : l)));
  }

  async function post() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const posted = await api.postStockDocument(doc.id, crypto.randomUUID());
      setDoc(posted);
      setLines(posted.lines ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка проведення');
    } finally {
      setBusy(false);
    }
  }

  const variances = useMemo(
    () =>
      lines.filter((l) => {
        const counted = l.counted_qty ?? l.system_qty ?? 0;
        const system = l.system_qty ?? 0;
        return counted !== system;
      }),
    [lines]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((l) =>
      [l.product_name, l.size, l.color].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [lines, q]);

  if (!id) {
    return (
      <div className="max-w-xl space-y-4">
        <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
          ← Склад
        </Link>
        <h1 className="text-2xl font-semibold">Інвентаризація</h1>
        <p className="text-sm text-[#6E6E6E]">
          Порахуйте фактичні залишки. Система порівняє з обліком і виправить різницю після проведення.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void startFull()}
          className="sq-btn-primary px-5 py-3 text-sm"
        >
          Почати повну інвентаризацію
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4 pb-24">
      <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
        ← Склад
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sq-section-label">Інвентаризація</p>
          <h1 className="text-2xl font-semibold">{doc?.doc_number ?? '…'}</h1>
          <p className="text-sm text-[#6E6E6E]">
            {doc?.status === 'draft' ? 'Чернетка — можна правити' : `Статус: ${doc?.status}`}
          </p>
        </div>
        {doc?.status === 'draft' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded-[4px] border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
          >
            Оновити облікові
          </button>
        )}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Пошук…"
        className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-[4px] border border-[#E0E0E0] bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F5F5] text-left text-[#6E6E6E]">
            <tr>
              <th className="px-3 py-2 font-medium">Товар</th>
              <th className="px-3 py-2 font-medium text-right">Облік</th>
              <th className="px-3 py-2 font-medium text-right">Пораховано</th>
              <th className="px-3 py-2 font-medium text-right">Різниця</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((line) => {
              const system = line.system_qty ?? 0;
              const counted = line.counted_qty ?? system;
              const diff = counted - system;
              return (
                <tr key={line.id} className="border-t border-[#E0E0E0]">
                  <td className="px-3 py-2">
                    {line.product_name}{' '}
                    <span className="text-[#6E6E6E]">
                      {[line.size, line.color].filter(Boolean).join('/')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{system}</td>
                  <td className="px-3 py-2 text-right">
                    {doc?.status === 'draft' ? (
                      <input
                        type="number"
                        min={0}
                        value={counted}
                        onChange={(e) => void setCounted(line, Number(e.target.value))}
                        className="w-20 text-right rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1"
                      />
                    ) : (
                      <span className="tabular-nums">{counted}</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      diff === 0 ? 'text-[#6E6E6E]' : diff < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {diff === 0 ? '—' : diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {doc?.status === 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[240px] border-t border-[#E0E0E0] bg-white p-4 flex items-center justify-between gap-3">
          <p className="text-sm">
            Розбіжностей: <strong>{variances.length}</strong>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Провести інвентаризацію? Залишки зміняться на пораховані (${variances.length} розбіжностей).`
                )
              ) {
                void post();
              }
            }}
            className="sq-btn-primary px-5 py-2.5 text-sm"
          >
            Провести
          </button>
        </div>
      )}
    </div>
  );
}
