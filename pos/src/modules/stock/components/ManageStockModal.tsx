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
import { Segmented, Warehouse, X } from '@pos/platform/ui';
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

  /** A tab switches what the box means, so it resets what is in it too. */
  function chooseMode(m: Mode): void {
    setMode(m);
    switchPackMode(defaultPackMode(m === 'receive' ? 'receive' : 'count', pack));
    // «1» means one pack when the box opens in packs — the number
    // and the caption above it always agree.
    setQty(m === 'set' ? String(row.quantity) : '1');
    setReason(m === 'writeoff' ? defaultReason(writeoffReasons) : 'data_fix');
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(28,32,38,.32)] p-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Керувати залишком"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md bg-white rounded-card shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up"
      >
        <div className="px-5 pt-[18px] pb-3 flex items-center gap-2.5">
          <Warehouse size={24} className="shrink-0" />
          <h3 className="flex-1 text-[19px] font-bold text-sq-heading">Керувати залишком</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div>
            <p className="text-base font-semibold text-sq-text">
              {row.product_name}{' '}
              <span className="text-sq-muted font-normal">
                {row.label}
              </span>
            </p>
            <p className="text-sm text-sq-secondary mt-0.5 tabular-nums">
              Зараз: <strong className="text-sq-text">{row.quantity}</strong> {row.unit} ·{' '}
              {formatUah(row.price_cents)}
            </p>
          </div>

          <Segmented<Mode>
            value={mode}
            onChange={chooseMode}
            options={[
              { value: 'set', label: 'Має бути' },
              { value: 'receive', label: 'Прихід' },
              { value: 'writeoff', label: 'Списання' },
            ]}
          />

          <div className="space-y-1.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">{label}</span>
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
                className="sq-input !text-lg !font-semibold"
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
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">
                {packMode === 'pack' && pack
                  ? `Ціна закупки за ${pack.label} (₴)`
                  : `Ціна закупки за ${row.unit} (₴)`}
              </span>
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="sq-input"
              />
            </label>
          )}

          {mode !== 'receive' && (
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  aria-pressed={reason === r.code}
                  onClick={() => setReason(r.code)}
                  className={`h-9 px-3.5 rounded-[10px] text-[15px] transition-colors ${
                    reason === r.code
                      ? 'bg-sq-selected font-semibold text-sq-text'
                      : 'text-sq-secondary hover:bg-sq-selected/50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Коментар</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="sq-input"
              placeholder="необовʼязково"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="sq-btn-quiet flex-1">
              Скасувати
            </button>
            <button
              type="submit"
              disabled={saving}
              className="pos-btn-primary flex-1 min-h-11 px-4 rounded-sq text-[15px]"
            >
              {saving ? 'Збереження…' : 'Провести'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
