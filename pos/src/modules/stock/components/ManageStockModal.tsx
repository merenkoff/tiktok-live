// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useState } from 'react';
import {
  api,
  baseCostToPack,
  defaultPackMode,
  formatUah,
  packCostToBase,
  packOf,
  QuantityUnitToggle,
  quantityToBase,
  uahInputToCents,
  useVertical,
} from '@pos/platform';
import type { OnHandRow, PackMode } from '@pos/platform';
import { ADJUST_REASONS, defaultReason, writeoffReasonsOf } from '../lib/reasons';

type Mode = 'receive' | 'writeoff' | 'set';

interface Props {
  row: OnHandRow;
  onClose: () => void;
  onSaved: () => void;
}

export function ManageStockModal({ row, onClose, onSaved }: Props) {
  // How this variant arrives, if it does (migration 054). Null for a shop that
  // does not buy in packs — and then nothing below draws anything extra.
  const pack = packOf(row);
  // К5e: the write-off vocabulary is the store's vertical's — a kitchen says
  // «Зіпсувалося», a boutique «Брак» — while a correction is about counting
  // and reads the same everywhere.
  const vertical = useVertical();
  const writeoffReasons = writeoffReasonsOf(vertical);
  const [mode, setMode] = useState<Mode>('set');
  // What the box is counting in. Receiving opens in packs (oil arrives in
  // bottles); «має бути» and a write-off open in base units, because what is
  // written off is 200 ml, not 0.2 of a bottle.
  const [packMode, setPackMode] = useState<PackMode>(defaultPackMode('count', pack));
  const [qty, setQty] = useState(String(row.quantity));
  const [cost, setCost] = useState(String((row.cost_cents / 100).toFixed(2)));
  const [reason, setReason] = useState('data_fix');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Switching sides rescales what is already on screen — both the quantity's
   * caption and the purchase price. Showing a per-millilitre price under a
   * label that says «за пляшку» would be the one lie this feature could tell.
   */
  function switchPackMode(next: PackMode): void {
    if (!pack || next === packMode) return;
    const cents = uahInputToCents(cost);
    const rescaled =
      next === 'pack' ? baseCostToPack(cents, pack.qty) : packCostToBase(cents, pack.qty);
    setCost((rescaled / 100).toFixed(2));
    setPackMode(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const typed = Number(qty);
      if (!Number.isFinite(typed) || typed < 0) throw new Error('Некоректна кількість');
      // Whatever the box counted in, base units are what leaves the screen.
      const n = quantityToBase(typed, packMode, pack);
      if (!Number.isInteger(n)) {
        throw new Error(`Вийде ${n} ${row.unit} — склад рахується цілими`);
      }

      if (mode === 'receive') {
        if (n <= 0) throw new Error('Кількість має бути більше 0');
        const doc = await api.createStockDocument({ type: 'receipt', note: note || 'Прихід' });
        await api.addStockDocumentLine(doc.id, {
          variant_id: row.variant_id,
          quantity: n,
          // Typed per pack when the box counts packs — `unit_cost_cents` has
          // only ever meant cents per BASE unit.
          unit_cost_cents:
            packMode === 'pack' && pack
              ? packCostToBase(uahInputToCents(cost), pack.qty)
              : uahInputToCents(cost),
        });
        await api.postStockDocument(doc.id, crypto.randomUUID());
      } else if (mode === 'writeoff') {
        if (n <= 0) throw new Error('Кількість має бути більше 0');
        if (reason === 'other' && !note.trim()) throw new Error('Додайте коментар');
        const doc = await api.createStockDocument({
          type: 'writeoff',
          reason_code: reason,
          note: note || null,
        });
        await api.addStockDocumentLine(doc.id, { variant_id: row.variant_id, quantity: n });
        await api.postStockDocument(doc.id, crypto.randomUUID());
      } else {
        if (n === row.quantity) throw new Error('Залишок уже такий');
        const doc = await api.createStockDocument({
          type: 'adjustment',
          reason_code: reason,
          note: note || null,
        });
        await api.addStockDocumentLine(doc.id, {
          variant_id: row.variant_id,
          target_qty: n,
        });
        await api.postStockDocument(doc.id, crypto.randomUUID());
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
                'Помилка збереження'
            )
          : err instanceof Error
            ? err.message
            : 'Помилка збереження';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const reasons = mode === 'writeoff' ? writeoffReasons : ADJUST_REASONS;
  const label =
    mode === 'receive' ? 'Скільки надійшло' : mode === 'writeoff' ? 'Скільки списати' : 'Має бути';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-[4px] bg-white border border-[#E0E0E0] p-5 space-y-4 shadow-lg"
      >
        <div>
          <p className="sq-section-label">Керувати залишком</p>
          <h2 className="text-lg font-semibold mt-1">
            {row.product_name}{' '}
            <span className="text-[#6E6E6E] font-normal">
              {row.label}
            </span>
          </h2>
          <p className="text-sm text-[#6E6E6E] mt-1">
            Зараз: <strong className="text-[#1A1A1A]">{row.quantity}</strong> {row.unit} ·{' '}
            {formatUah(row.price_cents)}
          </p>
        </div>

        <div className="flex gap-1 p-1 bg-[#F5F5F5] rounded-[4px]">
          {(
            [
              ['set', 'Має бути'],
              ['receive', 'Прихід'],
              ['writeoff', 'Списання'],
            ] as const
          ).map(([m, t]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                switchPackMode(defaultPackMode(m === 'receive' ? 'receive' : 'count', pack));
                // «1» means one pack when the box opens in packs — the number
                // and the caption above it always agree.
                setQty(m === 'set' ? String(row.quantity) : '1');
                setReason(m === 'writeoff' ? defaultReason(writeoffReasons) : 'data_fix');
              }}
              className={`flex-1 py-2 text-sm rounded-[4px] ${
                mode === m ? 'bg-white font-medium shadow-sm' : 'text-[#6E6E6E]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="block space-y-1">
            <span className="text-sm text-[#6E6E6E]">{label}</span>
            <input
              type="number"
              min={0}
              // A number box defaults to step=1, and native validation would
              // then block «1,5 ящика» with a browser tooltip instead of the
              // named message below. Half a pack is a legitimate thing to
              // type; what is refused is the base units it comes out to.
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-3 text-lg font-semibold"
              autoFocus
            />
          </label>
          <QuantityUnitToggle
            pack={pack}
            unit={row.unit}
            mode={packMode}
            value={Number(qty)}
            onModeChange={switchPackMode}
          />
        </div>

        {mode === 'receive' && (
          <label className="block space-y-1">
            <span className="text-sm text-[#6E6E6E]">
              {packMode === 'pack' && pack
                ? `Ціна закупки за ${pack.label} (₴)`
                : `Ціна закупки за ${row.unit} (₴)`}
            </span>
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
            />
          </label>
        )}

        {mode !== 'receive' && (
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
            placeholder="необовʼязково"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[4px] border border-[#E0E0E0] py-2.5 text-sm"
          >
            Скасувати
          </button>
          <button type="submit" disabled={saving} className="sq-btn-primary flex-1 py-2.5 text-sm">
            {saving ? 'Збереження…' : 'Провести'}
          </button>
        </div>
      </form>
    </div>
  );
}
