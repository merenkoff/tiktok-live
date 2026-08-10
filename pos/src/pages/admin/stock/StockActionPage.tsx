import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../services/api';
import { formatUah, uahInputToCents } from '../../../lib/money';
import type { OnHandRow, StockDocumentType, Supplier } from '../../../types';

const WRITEOFF_REASONS = [
  { code: 'damaged', label: 'Брак' },
  { code: 'lost', label: 'Втрата' },
  { code: 'gift', label: 'Подарунок' },
  { code: 'other', label: 'Інше' },
];

const ADJUST_REASONS = [
  { code: 'found', label: 'Знайшли' },
  { code: 'loss', label: 'Не вистачає' },
  { code: 'data_fix', label: 'Помилка введення' },
  { code: 'other', label: 'Інше' },
];

interface LineDraft {
  variant_id: number;
  label: string;
  quantity: number;
  unit_cost_cents?: number;
  target_qty?: number;
  on_hand: number;
}

interface Props {
  type: Exclude<StockDocumentType, 'inventory'>;
}

export function StockActionPage({ type }: Props) {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<OnHandRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [newSupplier, setNewSupplier] = useState('');
  const [reason, setReason] = useState(type === 'writeoff' ? 'damaged' : 'data_fix');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title =
    type === 'receipt' ? 'Прихід товару' : type === 'writeoff' ? 'Списання' : 'Корекція залишку';

  useEffect(() => {
    void Promise.all([api.stockOnHand(), type === 'receipt' ? api.listSuppliers() : Promise.resolve([])])
      .then(([onHand, sup]) => {
        setCatalog(onHand);
        setSuppliers(sup as Supplier[]);
      })
      .catch(() => setError('Не вдалося завантажити'));
  }, [type]);

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return catalog.slice(0, 12);
    return catalog
      .filter((r) =>
        [r.product_name, r.size, r.color, r.sku, r.barcode]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
      .slice(0, 20);
  }, [catalog, q]);

  function addVariant(row: OnHandRow) {
    if (lines.some((l) => l.variant_id === row.variant_id)) return;
    const label = `${row.product_name} ${[row.size, row.color].filter(Boolean).join('/')}`;
    if (type === 'adjustment') {
      setLines((prev) => [
        ...prev,
        { variant_id: row.variant_id, label, quantity: 0, target_qty: row.quantity, on_hand: row.quantity },
      ]);
    } else {
      setLines((prev) => [
        ...prev,
        {
          variant_id: row.variant_id,
          label,
          quantity: 1,
          unit_cost_cents: row.cost_cents,
          on_hand: row.quantity,
        },
      ]);
    }
    setQ('');
  }

  async function ensureSupplier(): Promise<number | null> {
    if (type !== 'receipt') return null;
    if (supplierId) return Number(supplierId);
    if (!newSupplier.trim()) return null;
    const created = await api.createSupplier({ name: newSupplier.trim() });
    setSuppliers((s) => [...s, created]);
    setSupplierId(created.id);
    return created.id;
  }

  async function onSubmit(e: FormEvent, asDraft: boolean) {
    e.preventDefault();
    if (lines.length === 0) {
      setError('Додайте хоча б один товар');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sid = await ensureSupplier();
      const doc = await api.createStockDocument({
        type,
        supplier_id: sid,
        reason_code: type === 'receipt' ? null : reason,
        note: note || null,
      });
      for (const line of lines) {
        if (type === 'adjustment') {
          const target = line.target_qty ?? line.on_hand;
          if (target === line.on_hand) continue;
          await api.addStockDocumentLine(doc.id, {
            variant_id: line.variant_id,
            target_qty: target,
          });
        } else {
          await api.addStockDocumentLine(doc.id, {
            variant_id: line.variant_id,
            quantity: line.quantity,
            unit_cost_cents: type === 'receipt' ? line.unit_cost_cents ?? null : null,
          });
        }
      }
      if (type === 'adjustment') {
        const changed = lines.some((l) => (l.target_qty ?? l.on_hand) !== l.on_hand);
        if (!changed) throw new Error('Немає змін залишку');
      }
      if (!asDraft) {
        await api.postStockDocument(doc.id, crypto.randomUUID());
      }
      navigate(`/admin/stock/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  const reasons = type === 'writeoff' ? WRITEOFF_REASONS : ADJUST_REASONS;

  return (
    <form className="max-w-3xl space-y-5" onSubmit={(e) => void onSubmit(e, false)}>
      <div>
        <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
          ← Склад
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{title}</h1>
      </div>

      {type === 'receipt' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm text-[#6E6E6E]">Постачальник</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
            >
              <option value="">Без постачальника</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-[#6E6E6E]">Або новий</span>
            <input
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
              placeholder="Назва постачальника"
              className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
            />
          </label>
        </div>
      )}

      {type !== 'receipt' && (
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setReason(r.code)}
              className={`px-3 py-1.5 text-sm rounded-[4px] border ${
                reason === r.code
                  ? 'border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]'
                  : 'border-[#E0E0E0] bg-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm text-[#6E6E6E]">Коментар</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium">Додати товари</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук або штрихкод…"
          className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
        />
        {q.trim() && (
          <div className="rounded-[4px] border border-[#E0E0E0] bg-white max-h-48 overflow-auto">
            {searchHits.map((row) => (
              <button
                key={row.variant_id}
                type="button"
                onClick={() => addVariant(row)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[#F5F5F5] border-b border-[#E0E0E0] last:border-0"
              >
                {row.product_name} {[row.size, row.color].filter(Boolean).join('/')} · на складі{' '}
                {row.quantity}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]">
        {lines.length === 0 && (
          <p className="p-4 text-sm text-[#6E6E6E]">Поки немає рядків</p>
        )}
        {lines.map((line, idx) => (
          <div key={line.variant_id} className="p-3 flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[140px]">
              <p className="text-sm font-medium">{line.label}</p>
              <p className="text-xs text-[#6E6E6E]">На складі: {line.on_hand}</p>
            </div>
            {type === 'adjustment' ? (
              <label className="text-sm">
                Має бути{' '}
                <input
                  type="number"
                  min={0}
                  value={line.target_qty ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, target_qty: v } : l))
                    );
                  }}
                  className="ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
                />
              </label>
            ) : (
              <>
                <label className="text-sm">
                  К-сть{' '}
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, quantity: v } : l))
                      );
                    }}
                    className="ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
                  />
                </label>
                {type === 'receipt' && (
                  <label className="text-sm">
                    Закупка ₴{' '}
                    <input
                      value={((line.unit_cost_cents ?? 0) / 100).toFixed(2)}
                      onChange={(e) => {
                        const cents = uahInputToCents(e.target.value);
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, unit_cost_cents: cents } : l))
                        );
                      }}
                      className="ml-1 w-24 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
                    />
                  </label>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
              className="text-sm text-red-600"
            >
              Прибрати
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 sticky bottom-4">
        <button
          type="button"
          disabled={saving}
          onClick={(e) => void onSubmit(e as unknown as FormEvent, true)}
          className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm"
        >
          Зберегти чернетку
        </button>
        <button type="submit" disabled={saving} className="sq-btn-primary px-6 py-2.5 text-sm">
          {saving ? '…' : 'Провести'}
        </button>
      </div>
      {type === 'receipt' && lines.length > 0 && (
        <p className="text-xs text-[#6E6E6E]">
          Сума закупки:{' '}
          {formatUah(lines.reduce((s, l) => s + (l.unit_cost_cents ?? 0) * l.quantity, 0))}
        </p>
      )}
    </form>
  );
}
