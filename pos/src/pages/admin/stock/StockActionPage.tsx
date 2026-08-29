// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../services/api';
import { formatUah, uahInputToCents } from '../../../lib/money';
import { enrichGtinFromSources, gtinSourceLabel, type GtinHint } from '../../../lib/gtinLookup';
import type { OnHandRow, StockDocumentType, Supplier } from '../../../types';
import { useDragScroll } from '../../../hooks/useDragScroll';

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

type ExistingLine = {
  kind: 'existing';
  variant_id: number;
  label: string;
  quantity: number;
  unit_cost_cents?: number;
  price_cents?: number;
  target_qty?: number;
  on_hand: number;
};

type PlaceholderLine = {
  kind: 'placeholder';
  clientKey: string;
  name: string;
  quantity: number;
  price_cents: number;
  unit_cost_cents?: number;
  size: string;
  color: string;
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
  const [loading, setLoading] = useState(true);
  const catalogScrollRef = useDragScroll<HTMLDivElement>();

  const [stubOpen, setStubOpen] = useState(false);
  const [stubName, setStubName] = useState('');
  const [stubQty, setStubQty] = useState('1');
  const [stubPrice, setStubPrice] = useState('');
  const [stubCost, setStubCost] = useState('');
  const [stubSize, setStubSize] = useState('');
  const [stubColor, setStubColor] = useState('');
  const [stubBarcode, setStubBarcode] = useState('');
  const [similarWarn, setSimilarWarn] = useState<string[]>([]);
  const [gtinHint, setGtinHint] = useState<GtinHint | null>(null);
  const [gtinLooking, setGtinLooking] = useState(false);
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
          [r.product_name, r.size, r.color, r.sku, r.barcode]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle))
        );
    return list.slice(0, needle ? 40 : 60);
  }, [catalog, q]);

  function addVariant(row: OnHandRow) {
    if (selectedIds.has(row.variant_id)) return;
    const label = `${row.product_name} ${[row.size, row.color].filter(Boolean).join('/')}`.trim();
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
        },
      ]);
    } else {
      setLines((prev) => [
        ...prev,
        {
          kind: 'existing',
          variant_id: row.variant_id,
          label,
          quantity: 1,
          unit_cost_cents: row.cost_cents,
          on_hand: row.quantity,
        },
      ]);
    }
    setQ('');
    setStubOpen(false);
  }

  function openStubForm() {
    const query = q.trim();
    const barcodeLike = looksLikeBarcode(query);
    setStubName(barcodeLike ? '' : query);
    setStubBarcode(barcodeLike ? query : '');
    setStubQty('1');
    setStubPrice('');
    setStubCost('');
    setStubSize('');
    setStubColor('');
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
        setGtinHint(hint);
        setStubName((prev) => (prev.trim() ? prev : hint.name!));
        if (hint.brand) {
          // brand is informational only for now
        }
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
    const size = stubSize.trim();
    const color = stubColor.trim();
    const dup = lines.some(
      (l) =>
        l.kind === 'placeholder' &&
        l.name.toLowerCase() === name.toLowerCase() &&
        l.size === size &&
        l.color === color
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
        size,
        color,
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
        setError(`На складі лише ${over.on_hand} шт: ${over.label}`);
        return;
      }
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
            size: line.size,
            color: line.color,
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
            unit_cost_cents: type === 'receipt' ? line.unit_cost_cents ?? null : null,
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

  const reasons = type === 'writeoff' ? WRITEOFF_REASONS : ADJUST_REASONS;
  const showCreateCta = type === 'receipt' && !loading && searchHits.length === 0 && q.trim().length > 0;

  return (
    <form className="max-w-3xl space-y-5 pb-24" onSubmit={(e) => void onSubmit(e, false)}>
      <div>
        <Link to="/admin/stock" className="text-sm text-[#006AFF] hover:underline">
          ← Склад
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{title}</h1>
        <p className="text-sm text-[#6E6E6E] mt-1">{subtitle}</p>
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
        <div>
          <p className="text-sm text-[#6E6E6E] mb-1.5">Причина</p>
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
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm text-[#6E6E6E]">Коментар</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
          placeholder={reason === 'other' ? 'обовʼязково для «Інше»' : 'необовʼязково'}
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Товари в документі</p>
          <p className="text-xs text-[#6E6E6E]">{lines.length} поз.</p>
        </div>

        <div className="rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]">
          {lines.length === 0 && (
            <p className="p-4 text-sm text-[#6E6E6E]">
              Поки порожньо — оберіть товар зі списку каталогу нижче.
            </p>
          )}
          {lines.map((line, idx) => {
            if (line.kind === 'placeholder') {
              return (
                <div key={line.clientKey} className="p-3 flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{line.name}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]">
                        Новий
                      </span>
                    </div>
                    <p className="text-xs text-[#6E6E6E]">Створиться при проведенні</p>
                    {(line.size || line.color || line.barcode) && (
                      <p className="text-xs text-[#6E6E6E]">
                        {[line.size, line.color].filter(Boolean).join(' / ')}
                        {line.barcode ? ` · ${line.barcode}` : ''}
                      </p>
                    )}
                  </div>
                  <label className="text-sm">
                    К-сть{' '}
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
                      className="ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
                    />
                  </label>
                  <label className="text-sm">
                    Ціна ₴{' '}
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
                      className="ml-1 w-24 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
                    />
                  </label>
                  <label className="text-sm">
                    Закупка ₴{' '}
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
                      className="ml-1 w-24 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-sm text-red-600"
                  >
                    Прибрати
                  </button>
                </div>
              );
            }

            const delta = (line.target_qty ?? line.on_hand) - line.on_hand;
            return (
              <div key={line.variant_id} className="p-3 flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-medium">{line.label}</p>
                  <p className="text-xs text-[#6E6E6E]">Зараз на складі: {line.on_hand} шт</p>
                </div>
                {type === 'adjustment' ? (
                  <div className="flex items-center gap-2">
                    <label className="text-sm whitespace-nowrap">
                      Має бути{' '}
                      <input
                        type="number"
                        min={0}
                        value={line.target_qty ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx && l.kind === 'existing' ? { ...l, target_qty: v } : l
                            )
                          );
                        }}
                        className="ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5 font-semibold"
                      />
                    </label>
                    <span
                      className={`text-sm tabular-nums font-medium ${
                        delta === 0
                          ? 'text-[#6E6E6E]'
                          : delta > 0
                            ? 'text-emerald-700'
                            : 'text-red-600'
                      }`}
                    >
                      {delta === 0 ? 'без змін' : delta > 0 ? `+${delta}` : delta}
                    </span>
                  </div>
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
                            prev.map((l, i) =>
                              i === idx && l.kind === 'existing' ? { ...l, quantity: v } : l
                            )
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
                              prev.map((l, i) =>
                                i === idx && l.kind === 'existing'
                                  ? { ...l, unit_cost_cents: cents }
                                  : l
                              )
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
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Каталог — натисніть, щоб додати</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук назви, SKU або штрихкоду…"
          className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
          autoFocus
        />
        <div
          ref={catalogScrollRef}
          className="rounded-[4px] border border-[#E0E0E0] bg-white max-h-72 overflow-auto divide-y divide-[#E0E0E0] select-none"
        >
          {loading && <p className="p-4 text-sm text-[#6E6E6E]">Завантаження каталогу…</p>}
          {!loading && searchHits.length === 0 && (
            <div className="p-4 space-y-3">
              <p className="text-sm text-[#6E6E6E]">
                Нічого не знайдено{q.trim() ? ` для «${q.trim()}»` : ''}
              </p>
              {showCreateCta && (
                <button
                  type="button"
                  onClick={openStubForm}
                  className="sq-btn-primary px-4 py-2 text-sm"
                >
                  + Створити новий товар
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
                className={`w-full text-left px-3 py-2.5 text-sm flex justify-between gap-3 ${
                  added ? 'bg-[#F5F5F5] text-[#6E6E6E]' : 'hover:bg-[#E8F1FF]'
                }`}
              >
                <span>
                  <span className="font-medium">{row.product_name}</span>{' '}
                  <span className="text-[#6E6E6E]">
                    {[row.size, row.color].filter(Boolean).join('/')}
                  </span>
                </span>
                <span className="tabular-nums whitespace-nowrap text-[#6E6E6E]">
                  {added ? 'додано' : `${row.quantity} шт`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {stubOpen && type === 'receipt' && (
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Новий товар у приході</p>
            <p className="text-xs text-[#6E6E6E] mt-0.5">
              Картка зʼявиться в каталозі лише після «Провести».
            </p>
          </div>
          {similarWarn.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-[4px] px-3 py-2">
              Можливо це вже є: {similarWarn.join(', ')}?
            </p>
          )}
          {gtinLooking && (
            <p className="text-xs text-[#6E6E6E]">Шукаємо назву за штрихкодом…</p>
          )}
          {gtinHint?.name && (
            <div className="flex flex-wrap items-center gap-2 text-sm bg-[#E8F1FF] border border-[#C5DBFF] rounded-[4px] px-3 py-2">
              <span>
                Знайдено: <span className="font-medium">{gtinHint.name}</span>
                {gtinHint.best_source
                  ? ` · ${gtinSourceLabel(gtinHint.best_source)}`
                  : ''}
              </span>
              <button type="button" onClick={clearGtinHint} className="text-[#006AFF] text-xs underline">
                Очистити підказку
              </button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-[#6E6E6E]">Назва *</span>
              <input
                value={stubName}
                onChange={(e) => setStubName(e.target.value)}
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
                autoFocus
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[#6E6E6E]">Кількість *</span>
              <input
                type="number"
                min={1}
                value={stubQty}
                onChange={(e) => setStubQty(e.target.value)}
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[#6E6E6E]">Ціна продажу *</span>
              <input
                value={stubPrice}
                onChange={(e) => setStubPrice(e.target.value)}
                placeholder="грн"
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[#6E6E6E]">Закупка</span>
              <input
                value={stubCost}
                onChange={(e) => {
                  const v = e.target.value;
                  setStubCost(v);
                  if (!stubPrice.trim() && v.trim()) setStubPrice(v);
                }}
                placeholder="грн"
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[#6E6E6E]">Розмір</span>
              <input
                value={stubSize}
                onChange={(e) => setStubSize(e.target.value)}
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[#6E6E6E]">Колір</span>
              <input
                value={stubColor}
                onChange={(e) => setStubColor(e.target.value)}
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-sm text-[#6E6E6E]">Штрихкод</span>
              <input
                value={stubBarcode}
                onChange={(e) => onStubBarcodeChange(e.target.value)}
                className="w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addStubToDocument} className="sq-btn-primary px-4 py-2 text-sm">
              Додати в прихід
            </button>
            <button
              type="button"
              onClick={() => setStubOpen(false)}
              className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2 text-sm"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-[#F5F5F5] border-t border-[#E0E0E0]">
        <button
          type="button"
          disabled={saving}
          onClick={(e) => void onSubmit(e as unknown as FormEvent, true)}
          className="rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm"
        >
          Зберегти чернетку
        </button>
        <button type="submit" disabled={saving || loading} className="sq-btn-primary px-6 py-2.5 text-sm">
          {saving ? '…' : 'Провести'}
        </button>
      </div>
      {type === 'receipt' && lines.length > 0 && (
        <p className="text-xs text-[#6E6E6E]">
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
