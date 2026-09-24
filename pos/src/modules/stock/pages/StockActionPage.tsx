// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  baseToPack,
  defaultPackMode,
  formatUah,
  packOf,
  QuantityUnitToggle,
  quantityToBase,
  uahInputToCents,
  enrichGtinFromSources,
  gtinSourceLabel,
  isInternalBarcode,
  useVertical,
} from '@pos/platform';
import type {
  AttributeValues,
  GtinHint,
  OnHandRow,
  PackMode,
  StockDocumentType,
  Supplier,
  VerticalPublicConfig,
} from '@pos/platform';
import { AttributeFields, Package, PageHeader, Plus, SectionHead, useDragScroll } from '@pos/platform/ui';
import { TYPE_GLYPH } from '../lib/documents';
import { ADJUST_REASONS, defaultReason, writeoffReasonsOf } from '../lib/reasons';

/**
 * A short read-out of what the operator typed, for the draft row on screen.
 *
 * Deliberately not called a label: the real caption is derived server-side by
 * the store's vertical when the line is saved, and only that one is stored,
 * printed and shown everywhere else.
 */
function attributeSummary(vertical: VerticalPublicConfig, attributes: AttributeValues): string {
  return vertical.attributes
    .filter((spec) => spec.inLabel)
    .map((spec) => {
      const value = attributes[spec.key];
      if (value == null || value === '') return '';
      return spec.unitSuffix ? `${value} ${spec.unitSuffix}` : String(value);
    })
    .filter(Boolean)
    .join(' · ');
}

type ExistingLine = {
  kind: 'existing';
  variant_id: number;
  label: string;
  /**
   * ALWAYS base units, whatever the box on screen is counting in — the pack is
   * a typing aid and this is the number the document is made of.
   */
  quantity: number;
  /** Per BASE unit, same rule as the quantity. */
  unit_cost_cents?: number;
  price_cents?: number;
  target_qty?: number;
  on_hand: number;
  /** The variant's own unit, so the row stops saying «шт» about millilitres. */
  unit: string;
  /** The purchase pack, if this variant has one (migration 054). */
  pack_qty: number | null;
  pack_label: string;
  /** Which side of the toggle this row is on. */
  packMode: PackMode;
};

/**
 * The four conversions the rows on this screen need. `quantity`,
 * `target_qty` and `unit_cost_cents` are ALWAYS base units in state — what a
 * pack changes is only what the box shows and what a keystroke means.
 */
function shownQty(line: ExistingLine, base: number): number {
  const pack = packOf(line);
  if (line.packMode !== 'pack' || !pack) return base;
  // Four decimals so a round-trip through the box is lossless for anything a
  // person would actually type.
  return Math.round(baseToPack(base, pack.qty) * 10000) / 10000;
}

function typedToBase(line: ExistingLine, raw: string): number {
  return quantityToBase(Number(raw), line.packMode, packOf(line));
}

function shownCost(line: ExistingLine, centsPerBase: number): number {
  const pack = packOf(line);
  if (line.packMode !== 'pack' || !pack) return centsPerBase;
  return centsPerBase * pack.qty;
}

/**
 * Kept UNROUNDED in state on purpose. 15 ₴ for a 1000 ml bottle is 1.5 cents
 * per millilitre; rounding that to 2 on every keystroke would redraw the box
 * as «20,00 ₴» while the person is still typing «15». The single rounding
 * happens once, on the way out — the integer `unit_cost_cents` column is what
 * loses the half-kopiyka, and it lost it before packs existed too.
 */
function typedCostToBase(line: ExistingLine, raw: string): number {
  const cents = uahInputToCents(raw);
  const pack = packOf(line);
  if (line.packMode !== 'pack' || !pack) return cents;
  return cents / pack.qty;
}

type PlaceholderLine = {
  kind: 'placeholder';
  clientKey: string;
  name: string;
  quantity: number;
  price_cents: number;
  unit_cost_cents?: number;
  /** Vertical-defined attributes of the product this line will create. */
  attributes: AttributeValues;
  unit: string;
  /** What the operator typed, shown on the draft row until the server saves it. */
  summary: string;
  sku: string;
  barcode: string;
};

type LineDraft = ExistingLine | PlaceholderLine;

interface Props {
  type: Exclude<StockDocumentType, 'inventory'>;
}

function apiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return 'Помилка';
}

function looksLikeBarcode(value: string): boolean {
  return /^\d{8,}$/.test(value.trim());
}

export function StockActionPage({ type }: Props) {
  const vertical = useVertical();
  // К5e: what this shop may say. A kitchen writes food off as «Зіпсувалося»
  // or «Проба»; a boutique has no such word, and the server refuses one that
  // is not on its vertical's list.
  const reasons = type === 'writeoff' ? writeoffReasonsOf(vertical) : ADJUST_REASONS;
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<OnHandRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [newSupplier, setNewSupplier] = useState('');
  const [reason, setReason] = useState(type === 'writeoff' ? defaultReason(reasons) : 'data_fix');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const catalogScrollRef = useDragScroll<HTMLDivElement>();

  const [stubOpen, setStubOpen] = useState(false);
  const [stubName, setStubName] = useState('');
  const [stubQty, setStubQty] = useState('1');
  const [stubPrice, setStubPrice] = useState('');
  const [stubCost, setStubCost] = useState('');
  const [stubAttributes, setStubAttributes] = useState<AttributeValues>({});
  const [stubUnit, setStubUnit] = useState(vertical.defaultUnit);
  const [stubSku, setStubSku] = useState('');
  const [stubBarcodeBusy, setStubBarcodeBusy] = useState(false);
  const [stubBarcode, setStubBarcode] = useState('');
  const [similarWarn, setSimilarWarn] = useState<string[]>([]);
  const [gtinHint, setGtinHint] = useState<GtinHint | null>(null);
  const [gtinLooking, setGtinLooking] = useState(false);
  /** The hint's picture is a third-party URL; some of them 404. */
  const [gtinImageBroken, setGtinImageBroken] = useState(false);
  const gtinDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gtinHintClearedRef = useRef(false);

  const title =
    type === 'receipt' ? 'Прихід товару' : type === 'writeoff' ? 'Списання' : 'Корекція залишку';

  const subtitle =
    type === 'receipt'
      ? 'Оберіть товари з поставки або створіть новий — картка зʼявиться в каталозі лише після проведення.'
      : type === 'writeoff'
        ? 'Спишіть брак, втрату або подарунок. Кількість не може перевищувати залишок.'
        : 'Вкажіть, скільки товару має бути на складі. Система сама порахує різницю.';

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api.stockOnHand(),
      type === 'receipt' ? api.listSuppliers() : Promise.resolve([] as Supplier[]),
    ])
      .then(([onHand, sup]) => {
        setCatalog(onHand);
        setSuppliers(sup);
      })
      .catch(() => setError('Не вдалося завантажити товари'))
      .finally(() => setLoading(false));
  }, [type]);

  const selectedIds = useMemo(
    () => new Set(lines.filter((l): l is ExistingLine => l.kind === 'existing').map((l) => l.variant_id)),
    [lines]
  );

  const placeholderCount = useMemo(
    () => lines.filter((l) => l.kind === 'placeholder').length,
    [lines]
  );

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = !needle
      ? catalog
      : catalog.filter((r) =>
          [r.product_name, r.label, r.sku, r.barcode]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
        );
    return list.slice(0, needle ? 40 : 60);
  }, [catalog, q]);

  function addVariant(row: OnHandRow) {
    if (selectedIds.has(row.variant_id)) return;
    const label = `${row.product_name} ${row.label}`.trim();
    const pack = packOf(row);
    // Receiving opens in packs — oil arrives in bottles. A write-off and a
    // correction open in base units, because what is written off is 200 ml.
    const packMode = defaultPackMode(type === 'receipt' ? 'receive' : 'count', pack);
    const packFields = {
      unit: row.unit,
      pack_qty: pack?.qty ?? null,
      pack_label: pack?.label ?? '',
      packMode,
    };
    if (type === 'adjustment') {
      setLines((prev) => [
        ...prev,
        {
          kind: 'existing',
          variant_id: row.variant_id,
          label,
          quantity: 0,
          target_qty: row.quantity,
          on_hand: row.quantity,
          ...packFields,
        },
      ]);
    } else {
      setLines((prev) => [
        ...prev,
        {
          kind: 'existing',
          variant_id: row.variant_id,
          label,
          // One pack when the box counts packs: the number and the caption
          // above it always agree.
          quantity: packMode === 'pack' && pack ? pack.qty : 1,
          unit_cost_cents: row.cost_cents,
          on_hand: row.quantity,
          ...packFields,
        },
      ]);
    }
    setQ('');
    setStubOpen(false);
  }

  async function generateStubBarcode() {
    setStubBarcodeBusy(true);
    try {
      const code = await api.generateInternalBarcode();
      // Straight to the field, not through onStubBarcodeChange: there is
      // nothing to look up for a code we just invented.
      setStubBarcode(code);
    } catch {
      setError('Не вдалося згенерувати штрихкод');
    } finally {
      setStubBarcodeBusy(false);
    }
  }

  function openStubForm() {
    const query = q.trim();
    const barcodeLike = looksLikeBarcode(query);
    setStubName(barcodeLike ? '' : query);
    setStubBarcode(barcodeLike ? query : '');
    setStubSku('');
    setStubQty('1');
    setStubPrice('');
    setStubCost('');
    setStubAttributes({});
    setStubUnit(vertical.defaultUnit);
    setGtinHint(null);
    gtinHintClearedRef.current = false;
    const needle = (barcodeLike ? '' : query).toLowerCase();
    const similar = needle
      ? catalog
          .filter((r) => r.product_name.toLowerCase().includes(needle))
          .map((r) => r.product_name)
          .filter((name, i, arr) => arr.indexOf(name) === i)
          .slice(0, 5)
      : [];
    setSimilarWarn(similar);
    setStubOpen(true);
    if (barcodeLike) {
      void runGtinEnrich(query);
    }
  }

  async function runGtinEnrich(code: string) {
    if (type !== 'receipt' || gtinHintClearedRef.current) return;
    if (!looksLikeBarcode(code)) return;
    // A code we minted is in no public database. Fanning out to three Open*Facts
    // hosts for it spends their goodwill on a guaranteed miss.
    if (isInternalBarcode(code)) return;
    setGtinLooking(true);
    try {
      const { hint } = await enrichGtinFromSources(code, {
        getGtinCache: async (c) => {
          const r = await api.getGtinCache(c);
          if (!r.found) return { found: false };
          return {
            found: true as const,
            hint: {
              gtin: r.gtin,
              name: r.name,
              brand: r.brand,
              image_url: r.image_url,
              best_source: r.best_source,
            },
          };
        },
        ingestGtin: (g, results) => api.ingestGtin(g, results),
        lookupQuotaProviders: (g) => api.lookupGtinQuotaProviders(g),
      });
      if (hint?.name && !gtinHintClearedRef.current) {
        setGtinImageBroken(false);
        setGtinHint(hint);
        setStubName((prev) => (prev.trim() ? prev : hint.name!));
      }
    } catch {
      // silent
    } finally {
      setGtinLooking(false);
    }
  }

  function onStubBarcodeChange(value: string) {
    setStubBarcode(value);
    gtinHintClearedRef.current = false;
    if (gtinDebounceRef.current) clearTimeout(gtinDebounceRef.current);
    gtinDebounceRef.current = setTimeout(() => {
      void runGtinEnrich(value.trim());
    }, 400);
  }

  function clearGtinHint() {
    gtinHintClearedRef.current = true;
    setGtinHint(null);
  }

  function addStubToDocument() {
    const name = stubName.trim();
    if (!name) {
      setError('Вкажіть назву нового товару');
      return;
    }
    const quantity = Number(stubQty);
    if (!quantity || quantity <= 0) {
      setError('Кількість має бути більше 0');
      return;
    }
    const priceCents = uahInputToCents(stubPrice);
    if (stubPrice.trim() === '' || priceCents < 0) {
      setError('Вкажіть ціну продажу');
      return;
    }
    const costRaw = stubCost.trim();
    const unitCostCents = costRaw === '' ? undefined : uahInputToCents(costRaw);
    // Same key the server de-duplicates on (`placeholder_attributes` jsonb
    // equality) — catching it here just saves a round trip.
    const attributes = stubAttributes;
    const attrKey = JSON.stringify(
      vertical.attributes.map((spec) => attributes[spec.key] ?? null)
    );
    const dup = lines.some(
      (l) =>
        l.kind === 'placeholder' &&
        l.name.toLowerCase() === name.toLowerCase() &&
        JSON.stringify(vertical.attributes.map((spec) => l.attributes[spec.key] ?? null)) ===
          attrKey
    );
    if (dup) {
      setError('Такий новий товар уже є в документі');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        kind: 'placeholder',
        clientKey: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        quantity,
        price_cents: priceCents,
        unit_cost_cents: unitCostCents,
        attributes,
        unit: stubUnit,
        summary: attributeSummary(vertical, attributes),
        sku: stubSku.trim(),
        barcode: stubBarcode.trim(),
      },
    ]);
    setStubOpen(false);
    setQ('');
    setError(null);
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
      setError('Додайте хоча б один товар зі списку нижче');
      return;
    }
    if (type === 'adjustment') {
      const changed = lines.some(
        (l) => l.kind === 'existing' && (l.target_qty ?? l.on_hand) !== l.on_hand
      );
      if (!changed) {
        setError('Змініть «Має бути» хоча б для одного товару');
        return;
      }
    }
    if (type === 'writeoff' || type === 'adjustment') {
      if (reason === 'other' && !note.trim()) {
        setError('Для причини «Інше» потрібен коментар');
        return;
      }
    }
    if (type === 'writeoff') {
      const over = lines.find(
        (l): l is ExistingLine => l.kind === 'existing' && l.quantity > l.on_hand
      );
      if (over) {
        setError(`На складі лише ${over.on_hand} ${over.unit}: ${over.label}`);
        return;
      }
    }
    const fractional = lines.find(
      (l): l is ExistingLine =>
        l.kind === 'existing' &&
        !Number.isInteger(type === 'adjustment' ? (l.target_qty ?? l.on_hand) : l.quantity)
    );
    if (fractional) {
      const value =
        type === 'adjustment' ? fractional.target_qty ?? fractional.on_hand : fractional.quantity;
      setError(
        `Вийде ${value} ${fractional.unit} — склад рахується цілими: ${fractional.label}`
      );
      return;
    }
    if (type === 'receipt' && !asDraft && placeholderCount > 0) {
      const ok = window.confirm(
        `Буде створено ${placeholderCount} ${
          placeholderCount === 1 ? 'новий товар' : 'нових товарів'
        } у каталозі. Продовжити?`
      );
      if (!ok) return;
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
        if (line.kind === 'placeholder') {
          await api.addStockDocumentPlaceholderLine(doc.id, {
            name: line.name,
            quantity: line.quantity,
            price_cents: line.price_cents,
            unit_cost_cents: line.unit_cost_cents ?? null,
            attributes: line.attributes,
            unit: line.unit,
            sku: line.sku || null,
            barcode: line.barcode || null,
          });
          continue;
        }
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
            unit_cost_cents:
              type === 'receipt' && line.unit_cost_cents != null
                ? Math.round(line.unit_cost_cents)
                : null,
          });
        }
      }
      if (!asDraft) {
        await api.postStockDocument(doc.id, crypto.randomUUID());
      }
      navigate(`/admin/stock/documents/${doc.id}`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  const showCreateCta = type === 'receipt' && !loading && searchHits.length === 0 && q.trim().length > 0;

  return (
    <form
      className="max-w-3xl space-y-6 pb-24 animate-fade-up text-sq-text"
      onSubmit={(e) => void onSubmit(e, false)}
    >
      <PageHeader
        back={{ to: '/admin/stock', label: 'Склад' }}
        glyph={TYPE_GLYPH[type]}
        title={title}
        subtitle={subtitle}
      />

      {type === 'receipt' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Постачальник</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}
              className="sq-input"
            >
              <option value="">Без постачальника</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Або новий</span>
            <input
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
              placeholder="Назва постачальника"
              className="sq-input"
            />
          </label>
        </div>
      )}

      {type !== 'receipt' && (
        <div>
          <p className="text-[13px] font-semibold text-sq-secondary mb-1.5">Причина</p>
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
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-sq-secondary">Коментар</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="sq-input"
          placeholder={reason === 'other' ? 'обовʼязково для «Інше»' : 'необовʼязково'}
        />
      </label>

      <section>
        <SectionHead title="Товари в документі" count={lines.length} />
        <div>
          {lines.length === 0 && (
            <div className="py-6 flex flex-col items-center gap-2 text-center">
              <Package size={48} />
              <p className="text-[15px] text-sq-secondary">
                Поки порожньо — оберіть товар зі списку каталогу нижче.
              </p>
            </div>
          )}
          {lines.map((line, idx) => {
            if (line.kind === 'placeholder') {
              return (
                <div key={line.clientKey} className="sq-row py-3 flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[140px] self-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold">{line.name}</p>
                      <span className="h-[22px] px-2 rounded-md inline-flex items-center bg-amber-50 text-amber-800 text-xs font-medium">
                        Новий
                      </span>
                    </div>
                    <p className="text-[13px] text-sq-muted">Створиться при проведенні</p>
                    {(line.summary || line.barcode) && (
                      <p className="text-[13px] text-sq-muted">
                        {line.summary}
                        {line.barcode ? ` · ${line.barcode}` : ''}
                      </p>
                    )}
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-sq-secondary">К-сть</span>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx && l.kind === 'placeholder' ? { ...l, quantity: v } : l
                          )
                        );
                      }}
                      className="sq-input max-w-[6rem]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-sq-secondary">Ціна ₴</span>
                    <input
                      value={(line.price_cents / 100).toFixed(2)}
                      onChange={(e) => {
                        const cents = uahInputToCents(e.target.value);
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx && l.kind === 'placeholder' ? { ...l, price_cents: cents } : l
                          )
                        );
                      }}
                      className="sq-input max-w-[7rem]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-sq-secondary">Закупка ₴</span>
                    <input
                      value={((line.unit_cost_cents ?? 0) / 100).toFixed(2)}
                      onChange={(e) => {
                        const cents = uahInputToCents(e.target.value);
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === idx && l.kind === 'placeholder'
                              ? { ...l, unit_cost_cents: cents }
                              : l
                          )
                        );
                      }}
                      className="sq-input max-w-[7rem]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="min-h-11 text-[15px] text-red-600 font-semibold"
                  >
                    Прибрати
                  </button>
                </div>
              );
            }

            const delta = (line.target_qty ?? line.on_hand) - line.on_hand;
            return (
              <div key={line.variant_id} className="sq-row py-3 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[140px] self-center">
                  <p className="text-base font-semibold">{line.label}</p>
                  <p className="text-[13px] text-sq-muted tabular-nums">
                    Зараз на складі: {line.on_hand} {line.unit}
                  </p>
                </div>
                {type === 'adjustment' ? (
                  <div className="flex items-end gap-3">
                    <label className="flex flex-col gap-1 whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-sq-secondary">Має бути</span>
                      <input
                        type="number"
                        min={0}
                        // See ManageStockModal: a default step=1 would let the
                        // browser block half a pack before our own message.
                        step="any"
                        value={shownQty(line, line.target_qty ?? 0)}
                        onChange={(e) => {
                          const v = typedToBase(line, e.target.value);
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx && l.kind === 'existing' ? { ...l, target_qty: v } : l
                            )
                          );
                        }}
                        className="sq-input max-w-[6rem] !font-semibold"
                      />
                    </label>
                    <span
                      className={`min-h-11 inline-flex items-center text-[15px] tabular-nums font-semibold ${
                        delta === 0
                          ? 'text-sq-muted'
                          : delta > 0
                            ? 'text-sq-success-ink'
                            : 'text-sq-danger'
                      }`}
                    >
                      {delta === 0 ? 'без змін' : delta > 0 ? `+${delta}` : delta}
                    </span>
                  </div>
                ) : (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-semibold text-sq-secondary">К-сть</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={shownQty(line, line.quantity)}
                        onChange={(e) => {
                          const v = typedToBase(line, e.target.value);
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx && l.kind === 'existing' ? { ...l, quantity: v } : l
                            )
                          );
                        }}
                        className="sq-input max-w-[6rem]"
                      />
                    </label>
                    {type === 'receipt' && (
                      <label className="flex flex-col gap-1">
                        <span className="text-[13px] font-semibold text-sq-secondary">
                          Закупка за {line.packMode === 'pack' ? line.pack_label : line.unit} ₴
                        </span>
                        <input
                          value={(shownCost(line, line.unit_cost_cents ?? 0) / 100).toFixed(2)}
                          onChange={(e) => {
                            const cents = typedCostToBase(line, e.target.value);
                            setLines((prev) =>
                              prev.map((l, i) =>
                                i === idx && l.kind === 'existing'
                                  ? { ...l, unit_cost_cents: cents }
                                  : l
                              )
                            );
                          }}
                          className="sq-input max-w-[7rem]"
                        />
                      </label>
                    )}
                  </>
                )}
                <QuantityUnitToggle
                  className="w-32"
                  pack={packOf(line)}
                  unit={line.unit}
                  mode={line.packMode}
                  value={shownQty(
                    line,
                    type === 'adjustment' ? line.target_qty ?? line.on_hand : line.quantity
                  )}
                  onModeChange={(next) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx && l.kind === 'existing' ? { ...l, packMode: next } : l
                      )
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="min-h-11 text-[15px] text-red-600 font-semibold"
                >
                  Прибрати
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHead title="Каталог — натисніть, щоб додати" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук назви, SKU або штрихкоду…"
          className="sq-input mt-3 mb-1"
          autoFocus
        />
        <div ref={catalogScrollRef} className="max-h-72 overflow-auto select-none">
          {loading && <p className="py-4 text-sm text-sq-muted">Завантаження каталогу…</p>}
          {!loading && searchHits.length === 0 && (
            <div className="py-4 space-y-3">
              <p className="text-[15px] text-sq-secondary">
                Нічого не знайдено{q.trim() ? ` для «${q.trim()}»` : ''}
              </p>
              {showCreateCta && (
                <button
                  type="button"
                  onClick={openStubForm}
                  className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5"
                >
                  <Plus size={20} />
                  Створити новий товар
                </button>
              )}
            </div>
          )}
          {searchHits.map((row) => {
            const added = selectedIds.has(row.variant_id);
            return (
              <button
                key={row.variant_id}
                type="button"
                disabled={added}
                onClick={() => addVariant(row)}
                className={`sq-row w-full min-h-11 text-left px-2 py-2 text-[15px] flex items-center justify-between gap-3 ${
                  added ? 'text-sq-muted' : 'hover:bg-sq-sidebar/60'
                }`}
              >
                <span>
                  <span className={added ? '' : 'text-sq-text'}>{row.product_name}</span>{' '}
                  <span className="text-sq-muted">
                    {row.label}
                  </span>
                </span>
                <span className="text-sm tabular-nums whitespace-nowrap text-sq-muted">
                  {added ? 'додано' : `${row.quantity} шт`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {stubOpen && type === 'receipt' && (
        <div className="sq-card p-5 space-y-4">
          <div>
            <h3 className="text-[17px] font-bold text-sq-heading">Новий товар у приході</h3>
            <p className="text-[13px] text-sq-secondary mt-0.5">
              Картка зʼявиться в каталозі лише після «Провести».
            </p>
          </div>
          {similarWarn.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-sq px-3 py-2">
              Можливо це вже є: {similarWarn.join(', ')}?
            </p>
          )}
          {gtinLooking && (
            <p className="text-[13px] text-sq-muted">Шукаємо назву за штрихкодом…</p>
          )}
          {gtinHint?.name && (
            // Brand and picture are here to answer one question the name alone
            // cannot: is this the item in my hand? The cache stored both all
            // along and showed neither.
            <div className="flex items-start gap-3 text-sm text-sq-text bg-sq-blue/10 rounded-sq px-3 py-2.5">
              {gtinHint.image_url && !gtinImageBroken && (
                <img
                  src={gtinHint.image_url}
                  alt=""
                  loading="lazy"
                  // The lookup already went to this host from this browser, so
                  // the image leaks nothing new — but send no referrer anyway.
                  referrerPolicy="no-referrer"
                  onError={() => setGtinImageBroken(true)}
                  className="w-12 h-12 rounded-lg object-cover bg-white shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p>
                  Знайдено: <span className="font-medium">{gtinHint.name}</span>
                </p>
                <p className="text-[13px] text-sq-secondary">
                  {gtinHint.brand ? `${gtinHint.brand} · ` : ''}
                  {gtinSourceLabel(gtinHint.best_source)}
                </p>
              </div>
              <button
                type="button"
                onClick={clearGtinHint}
                className="text-sq-blue text-[13px] font-semibold shrink-0"
              >
                Очистити підказку
              </button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[13px] font-semibold text-sq-secondary">Назва *</span>
              <input
                value={stubName}
                onChange={(e) => setStubName(e.target.value)}
                className="sq-input"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Кількість *</span>
              <input
                type="number"
                min={1}
                value={stubQty}
                onChange={(e) => setStubQty(e.target.value)}
                className="sq-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Ціна продажу *</span>
              <input
                value={stubPrice}
                onChange={(e) => setStubPrice(e.target.value)}
                placeholder="грн"
                className="sq-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Закупка</span>
              <input
                value={stubCost}
                onChange={(e) => {
                  const v = e.target.value;
                  setStubCost(v);
                  if (!stubPrice.trim() && v.trim()) setStubPrice(v);
                }}
                placeholder="грн"
                className="sq-input"
              />
            </label>
            <AttributeFields
              className="grid gap-2"
              schema={vertical.attributes}
              value={stubAttributes}
              onChange={setStubAttributes}
              unit={{ value: stubUnit, options: vertical.units, onChange: setStubUnit }}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Артикул (SKU)</span>
              <input
                value={stubSku}
                onChange={(e) => setStubSku(e.target.value)}
                className="sq-input"
              />
              <span className="block text-[13px] text-sq-muted">код з бирки постачальника</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Штрихкод</span>
              <div className="flex gap-2">
                <input
                  value={stubBarcode}
                  onChange={(e) => onStubBarcodeChange(e.target.value)}
                  className="sq-input"
                />
                <button
                  type="button"
                  disabled={stubBarcodeBusy}
                  onClick={() => void generateStubBarcode()}
                  title="Внутрішній код магазину — коли бирка не сканується"
                  className="sq-btn-quiet shrink-0 whitespace-nowrap"
                >
                  Згенерувати
                </button>
              </div>
              <span className="block text-[13px] text-sq-muted">
                те, що читає сканер — або згенеруйте внутрішній код
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addStubToDocument}
              className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
            >
              Додати в прихід
            </button>
            <button type="button" onClick={() => setStubOpen(false)} className="sq-btn-quiet">
              Скасувати
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-sq-surface shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
        <button
          type="button"
          disabled={saving}
          onClick={(e) => void onSubmit(e as unknown as FormEvent, true)}
          className="sq-btn-quiet"
        >
          Зберегти чернетку
        </button>
        <button
          type="submit"
          disabled={saving || loading}
          className="pos-btn-primary min-h-11 px-6 rounded-sq text-[15px]"
        >
          {saving ? '…' : 'Провести'}
        </button>
      </div>
      {type === 'receipt' && lines.length > 0 && (
        <p className="text-[13px] text-sq-muted tabular-nums">
          Сума закупки:{' '}
          {formatUah(
            lines.reduce((s, l) => {
              if (l.kind === 'placeholder') {
                return s + (l.unit_cost_cents ?? 0) * l.quantity;
              }
              return s + (l.unit_cost_cents ?? 0) * l.quantity;
            }, 0)
          )}
          {placeholderCount > 0 ? ` · нових товарів: ${placeholderCount}` : ''}
        </p>
      )}
    </form>
  );
}
