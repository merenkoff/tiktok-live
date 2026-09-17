// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatUah } from '@pos/platform';
import type { Product, ProductVariant } from '@pos/platform';

/**
 * Assembling composites: the florist makes ten bouquets, each taking its stems
 * off the shelf.
 *
 * Deliberately its own page rather than another `type` on `StockActionPage`.
 * Production does not pick from the whole catalogue — only composites the store
 * assembles in advance can be made — and the thing the operator needs on screen
 * is the bill of materials and whether there is enough of it, neither of which
 * the receipt/writeoff line editor has any notion of.
 */
interface Producible {
  product: Product;
  variant: ProductVariant;
  caption: string;
}

export function StockProductionPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [variantId, setVariantId] = useState<number | ''>('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .getProducts()
      .then(setProducts)
      .catch(() => setError('Не вдалося завантажити товари'));
  }, []);

  /** Only `own` composites: a derived one is assembled by the sale itself. */
  const producible = useMemo<Producible[]>(() => {
    const out: Producible[] = [];
    for (const product of products) {
      if (!product.is_active) continue;
      if (product.kind !== 'composite') continue;
      // `?? 'own'` matches the column default: a payload that predates
      // `stock_mode` describes a composite assembled in advance.
      if ((product.stock_mode ?? 'own') !== 'own') continue;
      for (const variant of product.variants) {
        if (!variant.is_active) continue;
        out.push({
          product,
          variant,
          caption: variant.label ? `${product.name} · ${variant.label}` : product.name,
        });
      }
    }
    return out.sort((a, b) => a.caption.localeCompare(b.caption, 'uk'));
  }, [products]);

  const selected = producible.find((row) => row.variant.id === variantId) ?? null;
  const quantity = Number(qty) || 0;

  /** What this run will consume, and whether the shelf can pay for it. */
  const bom = useMemo(() => {
    const components = selected?.variant.components ?? [];
    const stockOf = new Map<number, number>();
    for (const product of products) {
      for (const variant of product.variants) stockOf.set(variant.id, variant.quantity);
    }
    return components.map((component) => {
      const need = component.quantity * quantity;
      const have = stockOf.get(component.component_variant_id) ?? 0;
      return {
        ...component,
        need,
        have,
        short: need > have,
      };
    });
  }, [selected, products, quantity]);

  const maxRuns = useMemo(() => {
    const components = selected?.variant.components ?? [];
    if (components.length === 0) return 0;
    const stockOf = new Map<number, number>();
    for (const product of products) {
      for (const variant of product.variants) stockOf.set(variant.id, variant.quantity);
    }
    return components.reduce((min, component) => {
      const have = stockOf.get(component.component_variant_id) ?? 0;
      return Math.min(min, Math.floor(have / component.quantity));
    }, Number.POSITIVE_INFINITY);
  }, [selected, products]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected || quantity <= 0) return;
    setError(null);
    setSaving(true);
    try {
      const doc = await api.createStockDocument({
        type: 'production',
        note: note.trim() || null,
      });
      await api.addStockDocumentLine(doc.id, {
        variant_id: selected.variant.id,
        quantity,
      });
      const posted = await api.postStockDocument(doc.id);
      navigate(`/admin/stock/documents/${posted.id}`);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? null)
          : null;
      setError(message ?? 'Не вдалося провести виробництво');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="sq-section-label">Склад</p>
        <h1 className="text-2xl font-semibold mt-1">Виробництво</h1>
        <p className="text-sm text-sq-secondary mt-1">
          Збираємо складений товар зі складників. Складники спишуться, зібране стане на облік.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {producible.length === 0 ? (
        <p className="text-sm text-sq-secondary">
          Немає що збирати. Створіть товар «Складений — збираємо заздалегідь» у розділі «Товари».
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs text-sq-secondary">Що збираємо</span>
            <select
              className="w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">Оберіть…</option>
              {producible.map((row) => (
                <option key={row.variant.id} value={row.variant.id}>
                  {row.caption}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 max-w-[12rem]">
            <span className="text-xs text-sq-secondary">Скільки зібрати</span>
            <input
              className="w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-sq-secondary">Примітка (необовʼязково)</span>
            <input
              className="w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Наприклад: замовлення на суботу"
            />
          </label>

          {selected && (
            <div className="rounded-sq border border-sq-divider bg-sq-surface p-4 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-sq-text">Піде на це</p>
                <p className="text-xs text-sq-secondary">
                  Зі складників вистачить на {Number.isFinite(maxRuns) ? maxRuns : 0} шт
                </p>
              </div>
              {bom.length === 0 && (
                <p className="text-sm text-red-600">
                  У цього варіанта порожній склад — заповніть його в картці товару.
                </p>
              )}
              <table className="w-full text-sm">
                <tbody>
                  {bom.map((row) => (
                    <tr key={row.component_variant_id} className="border-t border-sq-divider">
                      <td className="py-2 pr-2">
                        {row.product_name}
                        {row.label ? ` · ${row.label}` : ''}
                      </td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {row.need} {row.unit}
                      </td>
                      <td
                        className={`py-2 text-right whitespace-nowrap text-xs ${
                          row.short ? 'text-red-600 font-semibold' : 'text-sq-secondary'
                        }`}
                      >
                        є {row.have} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-sq-secondary pt-1">
                Собівартість зібраного порахується зі складників. Поточна ціна продажу —{' '}
                {formatUah(selected.variant.price_cents)}.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !selected || quantity <= 0 || bom.length === 0}
            className="sq-btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saving ? 'Проведення…' : 'Зібрати і провести'}
          </button>
        </form>
      )}
    </div>
  );
}
