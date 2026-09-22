// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DEFAULT_TAG_COLOR, api, assetUrl, formatUah, type TagColorKey, uahInputToCents, useAuthStore, useVertical } from '@pos/platform';
import { PriceTagsDialog } from '../components/PriceTagsDialog';
import type {
  ModifierGroup,
  AttributeValues,
  PosTag,
  TagStation,
  Product,
  ProductComponentInput,
  ProductStockMode,
  ProductVariant,
} from '@pos/platform';
import { CompositionEditor } from '../components/CompositionEditor';
import { ModifierGroupChips } from '../components/ModifierGroupChips';
import { PackFields } from '../components/PackFields';
import { componentOptions } from '../components/componentOptions';
import type { ComponentOption } from '../components/componentOptions';
import { AttributeFields, ProductPhotoField, useDragScroll } from '@pos/platform/ui';
import { TagColorSwatches } from '../components/TagColorSwatches';

const MAX_TAG_DEPTH = 3;

/**
 * `'' | ProductStockMode` rather than a separate kind + mode pair: the two
 * composite modes behave differently enough at the till that the owner should
 * pick one deliberately, and a checkbox plus a switch invites picking neither.
 */
type ProductShape = '' | ProductStockMode;

function shapeOf(product: Pick<Product, 'kind' | 'stock_mode'>): ProductShape {
  if (product.kind !== 'composite') return '';
  return product.stock_mode === 'derived' ? 'derived' : 'own';
}

/** Says where the components go, which is the whole difference between the modes. */
function compositionHint(shape: Exclude<ProductShape, ''>): string {
  return shape === 'derived'
    ? 'Продаж спише складники зі складу.'
    : 'Складники спише документ виробництва — «Склад → Виробництво».';
}

const SHAPE_OPTIONS: Array<{ value: ProductShape; label: string }> = [
  { value: '', label: 'Звичайний товар' },
  { value: 'derived', label: 'Складений — збирається при продажу' },
  { value: 'own', label: 'Складений — збираємо заздалегідь' },
];

function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children?.length) out.push(...flattenTags(t.children));
  }
  return out;
}

/** "Вік / 0–1 / 3–6 міс" — full path for a nested tag. */
function tagPathLabel(flatTags: PosTag[], tag: PosTag): string {
  const parts = [tag.name];
  let current = tag;
  while (current.parent_id != null) {
    const parent = flatTags.find((t) => t.id === current.parent_id);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(' / ');
}

const fieldClass =
  'rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sm text-sq-text w-full';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<number | 'all' | 'needs_review'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tagsOpen, setTagsOpen] = useState(false);
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColorKey>(DEFAULT_TAG_COLOR);
  const [newTagCatalogBar, setNewTagCatalogBar] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<number | ''>('');
  const [savingTagId, setSavingTagId] = useState<number | null>(null);

  const vertical = useVertical();
  const [name, setName] = useState('');
  const [attributes, setAttributes] = useState<AttributeValues>({});
  const [unit, setUnit] = useState(vertical.defaultUnit);
  const [price, setPrice] = useState('690');
  const [qty, setQty] = useState('1');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  // How it arrives, not how it is counted (migration 054). Raw text: the pair
  // is validated by the server, and half of it is refused there by name.
  const [pack, setPack] = useState({ qty: '', label: '' });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [composite, setComposite] = useState<ProductShape>('');
  // An ingredient or a semi-finished product: on the shelf, off the menu.
  const [sellable, setSellable] = useState(true);
  const [components, setComponents] = useState<ProductComponentInput[]>([]);
  // The questions the new product asks, in order (`/admin/modifiers` owns the questions).
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);

  const flatTags = useMemo(() => flattenTags(tags), [tags]);
  // A recipe may go into a recipe only where the vertical says so (a café's
  // sauce inside a sandwich, never a bouquet inside a bouquet).
  const maxDepth = vertical.maxCompositionDepth ?? 1;
  const partOptions = useMemo(
    () => componentOptions(products, { maxDepth }),
    [products, maxDepth]
  );

  async function reload() {
    const [plist, tlist, glist] = await Promise.all([
      api.getProducts(),
      api.getTags(),
      api.listModifierGroups(),
    ]);
    setProducts(plist);
    setTags(tlist);
    setGroups(glist);
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити'));
  }, []);

  const visible = products.filter((p) => {
    if (!p.is_active) return false;
    if (filterTag === 'needs_review') return Boolean(p.needs_review);
    if (filterTag === 'all') return true;
    return p.tag_ids?.includes(filterTag);
  });

  const needsReviewCount = products.filter((p) => p.is_active && p.needs_review).length;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.createProduct({
        name,
        image_url: imageUrl,
        ...(composite ? { kind: 'composite' as const, stock_mode: composite } : {}),
        sellable,
        variants: [
          {
            attributes,
            unit,
            sku: sku || undefined,
            barcode: barcode || undefined,
            price_cents: uahInputToCents(price),
            // A derived composite keeps no stock of its own; the server refuses
            // an opening quantity on one rather than silently dropping it.
            quantity: composite === 'derived' ? 0 : Number(qty) || 0,
            pack_qty: pack.qty.trim() === '' ? null : Number(pack.qty),
            pack_label: pack.label.trim() === '' ? null : pack.label,
            ...(composite ? { components } : {}),
          },
        ],
      });
      // The questions travel separately, like tags — and only when there are any.
      if (groupIds.length) await api.setProductModifierGroups(created.id, groupIds);
      setShowCreate(false);
      setName('');
      setBarcode('');
      setSku('');
      setPack({ qty: '', label: '' });
      setImageUrl(null);
      setComposite('');
      setSellable(true);
      setComponents([]);
      setGroupIds([]);
      await reload();
    } catch (err) {
      setError(saveErrorMessage(err, 'Не вдалося створити товар'));
    }
  }

  async function onCreateTag(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createTag({
        name: newTagName,
        parent_id: null,
        color: newTagColor,
        show_in_catalog_bar: newTagCatalogBar,
      });
      setNewTagName('');
      setNewTagColor(DEFAULT_TAG_COLOR);
      setNewTagCatalogBar(false);
      await reload();
    } catch {
      setError('Не вдалося створити групу');
    }
  }

  async function createChildTag(parentId: number, name: string) {
    setError(null);
    try {
      await api.createTag({ name, parent_id: parentId, color: DEFAULT_TAG_COLOR });
      await reload();
    } catch {
      setError(`Не вдалося створити підгрупу (макс. ${MAX_TAG_DEPTH} рівні)`);
    }
  }

  async function patchTag(
    tag: PosTag,
    patch: { color?: string | null; show_in_catalog_bar?: boolean; station?: TagStation | null }
  ) {
    setSavingTagId(tag.id);
    setError(null);
    try {
      await api.updateTag(tag.id, patch);
      await reload();
    } catch {
      setError('Не вдалося оновити мітку');
    } finally {
      setSavingTagId(null);
    }
  }

  async function onBulkAssign() {
    if (bulkTagId === '' || selected.size === 0) return;
    try {
      await api.assignTag(Number(bulkTagId), [...selected]);
      setSelected(new Set());
      await reload();
    } catch {
      setError('Не вдалося призначити мітку');
    }
  }

  async function onArchiveProduct(p: Product) {
    if (
      !confirm(
        `Архівувати «${p.name}»? Зникне з каси, історія продажів збережеться.`
      )
    ) {
      return;
    }
    await api.archiveProduct(p.id);
    if (editId === p.id) setEditId(null);
    await reload();
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Товари</h2>
          <p className="text-sm text-sq-secondary mt-1">Мітки, варіанти та залишки.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setEditId(null);
          }}
          className="sq-btn-primary px-4 py-2.5 text-sm"
        >
          {showCreate ? 'Сховати' : 'Додати товар'}
        </button>
      </div>

      {error && (
        <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <section className="border border-sq-divider rounded-sq bg-sq-surface p-4 space-y-3 shadow-sm">
          <p className="sq-section-label">Мітки</p>
          <button
            type="button"
            onClick={() => setFilterTag('all')}
            className={`w-full text-left px-3 py-2 rounded-[4px] text-sm font-medium ${
              filterTag === 'all' ? 'sq-nav-active' : 'sq-nav-idle'
            }`}
          >
            Усі товари
          </button>
          <button
            type="button"
            onClick={() => setFilterTag('needs_review')}
            className={`w-full text-left px-3 py-2 rounded-[4px] text-sm font-medium ${
              filterTag === 'needs_review' ? 'sq-nav-active' : 'sq-nav-idle'
            }`}
          >
            З приходу — перевірте
            {needsReviewCount > 0 ? ` (${needsReviewCount})` : ''}
          </button>
          {tags.map((root) => (
            <TagTreeNode
              key={root.id}
              tag={root}
              depth={1}
              filterTag={filterTag}
              savingTagId={savingTagId}
              onFilter={setFilterTag}
              onColor={(tag, color) => void patchTag(tag, { color })}
              onCatalogBar={(tag, show_in_catalog_bar) =>
                void patchTag(tag, { show_in_catalog_bar })
              }
              onStation={(tag, station) => void patchTag(tag, { station })}
              // Only a café prints a kitchen ticket; a boutique's tags have no
              // station to pick and no reason to see the control.
              showStation={vertical.id === 'cafe'}
              onCreateChild={createChildTag}
            />
          ))}

          <form onSubmit={onCreateTag} className="pt-3 border-t border-sq-divider space-y-2">
            <p className="text-xs font-semibold text-sq-secondary">Нова коренева група</p>
            <input
              className={fieldClass}
              placeholder="Назва"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              required
            />
            <div className="space-y-1">
              <p className="text-[11px] text-sq-secondary">Колір плитки</p>
              <TagColorSwatches value={newTagColor} onChange={setNewTagColor} size="sm" />
            </div>
            <label className="flex items-start gap-2 text-sm text-sq-text cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={newTagCatalogBar}
                onChange={(e) => setNewTagCatalogBar(e.target.checked)}
              />
              <span>
                Показувати в рядку категорій
                <span className="block text-[11px] text-sq-secondary">Рядок категорій на касі</span>
              </span>
            </label>
            <button type="submit" className="sq-btn-primary w-full py-2.5 text-sm">
              Додати групу
            </button>
          </form>
        </section>

        <div className="space-y-4">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border border-sq-divider rounded-sq p-3 bg-sq-bg">
              <span className="text-sm text-sq-secondary">Обрано: {selected.size}</span>
              <select
                className="rounded-sq border border-sq-divider px-3 py-2 text-sm"
                value={bulkTagId}
                onChange={(e) => setBulkTagId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">Мітка…</option>
                {flatTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tagPathLabel(flatTags, t)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void onBulkAssign()}
                className="sq-btn-primary px-3 py-2 text-sm"
              >
                Додати мітку
              </button>
              <button
                type="button"
                onClick={() => setTagsOpen(true)}
                className="rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 text-sm"
              >
                Друк цінників
              </button>
            </div>
          )}

          {tagsOpen && (
            <PriceTagsDialog
              products={products.filter((p) => selected.has(p.id))}
              storeName={storeName}
              onClose={() => setTagsOpen(false)}
              onBarcodeGenerated={() => void reload()}
            />
          )}

          {showCreate && (
            <form
              onSubmit={onCreate}
              className="border border-sq-divider rounded-sq p-4 grid sm:grid-cols-2 gap-3 bg-sq-surface shadow-sm"
            >
              <p className="sm:col-span-2 text-sm font-semibold text-sq-text">Новий товар</p>
              <ProductPhotoField value={imageUrl} onChange={setImageUrl} />
              <input className={fieldClass} placeholder="Назва" value={name} onChange={(e) => setName(e.target.value)} required />
              {/* Directly under the name on purpose: this choice decides what the
                  rest of the form means (a derived composite has no opening
                  stock, a composite needs a composition). Below the fold it was
                  simply never found. */}
              <label className="block space-y-1">
                <span className="text-xs text-sq-secondary">Що це за товар</span>
                <select
                  className={fieldClass}
                  value={composite}
                  onChange={(e) => setComposite(e.target.value as ProductShape)}
                >
                  {SHAPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2 text-sm text-sq-text cursor-pointer sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={sellable}
                  onChange={(e) => setSellable(e.target.checked)}
                />
                <span>
                  Продається на касі
                  <span className="block text-[11px] text-sq-secondary">
                    Вимкніть для інгредієнта чи заготовки: склад і рецепти його бачать, екран
                    продажу — ні
                  </span>
                </span>
              </label>
              <ModifierGroupChips groups={groups} value={groupIds} onChange={setGroupIds} />
              <AttributeFields
                className="sm:col-span-2 grid gap-2 sm:grid-cols-2"
                schema={vertical.attributes}
                value={attributes}
                onChange={setAttributes}
                unit={{ value: unit, options: vertical.units, onChange: setUnit }}
              />
              <input className={fieldClass} placeholder="Ціна, грн" value={price} onChange={(e) => setPrice(e.target.value)} />
              {composite === 'derived' ? (
                <p className="text-xs text-sq-secondary self-center">
                  Залишок рахується зі складників.
                </p>
              ) : (
                <input className={fieldClass} placeholder="Залишок" value={qty} onChange={(e) => setQty(e.target.value)} />
              )}
              {composite && (
                <div className="sm:col-span-2">
                  <CompositionEditor
                    value={components}
                    options={partOptions}
                    onChange={setComponents}
                  />
                  <p className="text-xs text-sq-secondary mt-1">
                    {compositionHint(composite)}
                  </p>
                </div>
              )}
              <label className="block space-y-1">
                <span className="text-xs text-sq-secondary">Артикул (SKU) — ваш внутрішній код</span>
                <input className={fieldClass} value={sku} onChange={(e) => setSku(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-sq-secondary">Штрихкод — те, що читає сканер</span>
                <div className="flex gap-2">
                  <input className={fieldClass} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                  <GenerateBarcodeButton onGenerated={setBarcode} />
                </div>
              </label>
              <PackFields
                className="sm:col-span-2"
                qty={pack.qty}
                label={pack.label}
                unit={unit}
                onChange={setPack}
              />
              <button type="submit" className="sq-btn-primary sm:col-span-2 py-2.5 text-sm">
                Зберегти
              </button>
            </form>
          )}

          <div className="space-y-3">
            {visible.map((product) =>
              editId === product.id ? (
                <EditProductInline
                  key={product.id}
                  product={product}
                  flatTags={flatTags}
                  groups={groups}
                  partOptions={componentOptions(products, {
                    excludeProductId: product.id,
                    maxDepth,
                  })}
                  onCancel={() => setEditId(null)}
                  onSaved={async () => {
                    await reload();
                  }}
                  onCloseAfterSave={() => setEditId(null)}
                />
              ) : (
                <section
                  key={product.id}
                  className="border border-sq-divider rounded-sq p-4 bg-sq-surface shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden shrink-0 grid place-items-center">
                            {product.image_url ? (
                              <img
                                src={assetUrl(product.image_url) ?? undefined}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] text-sq-muted">фото</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-sq-text truncate">{product.name}</h3>
                              {product.needs_review && (
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]">
                                  Потребує перевірки
                                </span>
                              )}
                              {product.kind === 'composite' && (
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#EEF4FF] text-[#2B4ACB]">
                                  {product.stock_mode === 'derived'
                                    ? 'Складений · при продажу'
                                    : 'Складений · збираємо'}
                                </span>
                              )}
                              {product.sellable === false && (
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-sq-bg text-sq-secondary">
                                  Не на касі
                                </span>
                              )}
                              {(product.modifier_group_ids?.length ?? 0) > 0 && (
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#EEF4FF] text-[#2B4ACB]">
                                  Модифікатори · {product.modifier_group_ids?.length}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3 text-sm font-semibold">
                          <button
                            type="button"
                            className="text-sq-blue"
                            onClick={() => {
                              setShowCreate(false);
                              setEditId(product.id);
                            }}
                          >
                            Редагувати
                          </button>
                          <button
                            type="button"
                            className="text-red-600"
                            onClick={() => void onArchiveProduct(product)}
                          >
                            Архів
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(product.tag_ids ?? []).map((tid) => {
                          const tag = flatTags.find((t) => t.id === tid);
                          return (
                            <span
                              key={tid}
                              className="text-xs px-2 py-0.5 rounded-full bg-sq-bg text-sq-secondary border border-sq-divider"
                            >
                              {tag?.name ?? tid}
                            </span>
                          );
                        })}
                      </div>
                      <VariantsTable
                        variants={product.variants.filter((v) => v.is_active)}
                        derived={product.kind === 'composite' && product.stock_mode === 'derived'}
                      />
                    </div>
                  </div>
                </section>
              )
            )}
            {visible.length === 0 && (
              <p className="text-sm text-sq-secondary">Немає товарів у цьому фільтрі.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A 409 here means the SKU or barcode is already on another variant of this
 * store — the one failure this design permits, and the only one the operator
 * can act on. Folding it into "Не вдалося зберегти" left her no way to know
 * she should simply generate another code.
 */
function saveErrorMessage(err: unknown, fallback: string): string {
  const status =
    typeof err === 'object' && err && 'response' in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
  if (status === 409) {
    return 'Такий артикул або штрихкод уже є в цьому магазині — змініть його або згенеруйте новий';
  }
  return fallback;
}

/**
 * Mints a store-local EAN-13 for an item whose tag will not scan.
 *
 * Nothing is reserved: the counter behind it never repeats, so a code generated
 * and never saved is simply a gap. Uniqueness within the store stays with the
 * index at INSERT, which surfaces as the 409 above.
 */
function GenerateBarcodeButton({ onGenerated }: { onGenerated: (code: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      onGenerated(await api.generateInternalBarcode());
    } catch {
      // Nothing appears in the field; pressing again is the whole recovery.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void generate()}
      disabled={busy}
      title="Внутрішній код магазину — коли бирка не сканується"
      className="shrink-0 rounded-sq border border-sq-divider bg-sq-surface px-3 text-sm whitespace-nowrap disabled:opacity-50"
    >
      Згенерувати
    </button>
  );
}

function VariantsTable({
  variants,
  derived,
}: {
  variants: ProductVariant[];
  /** Whether the quantity column is computed from components rather than stored. */
  derived?: boolean;
}) {
  const scrollRef = useDragScroll<HTMLDivElement>();

  return (
    <div ref={scrollRef} className="mt-3 overflow-x-auto select-none">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-sq-secondary">
            <th className="py-1 pr-2 font-medium">Варіант</th>
            <th className="py-1 pr-2 font-medium">Ціна</th>
            <th className="py-1 pr-2 font-medium">{derived ? 'Можна зібрати' : 'Залишок'}</th>
            <th className="py-1 pr-2 font-medium">Артикул</th>
            <th className="py-1 font-medium">Штрихкод</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} className="border-t border-sq-divider">
              <td className="py-2 pr-2">
                {v.label || '—'}
              </td>
              <td className="py-2 pr-2">{formatUah(v.price_cents)}</td>
              <td className="py-2 pr-2">
                {v.quantity}
                {v.unit ? <span className="text-xs text-sq-muted"> {v.unit}</span> : null}
              </td>
              <td className="py-2 pr-2 font-mono text-xs">{v.sku || '—'}</td>
              <td className="py-2 font-mono text-xs">{v.barcode || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TagTreeCallbacks {
  onFilter: (id: number) => void;
  onColor: (tag: PosTag, color: TagColorKey) => void;
  onCatalogBar: (tag: PosTag, value: boolean) => void;
  onStation: (tag: PosTag, station: TagStation | null) => void;
  /** Show the «Станція» control — a café, where the kitchen ticket routes by it. */
  showStation: boolean;
  onCreateChild: (parentId: number, name: string) => Promise<void>;
}

function TagTreeNode({
  tag,
  depth,
  filterTag,
  savingTagId,
  onFilter,
  onColor,
  onCatalogBar,
  onStation,
  showStation,
  onCreateChild,
}: TagTreeCallbacks & {
  tag: PosTag;
  depth: number;
  filterTag: number | 'all' | 'needs_review';
  savingTagId: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState('');
  const children = tag.children ?? [];

  async function submitChild(e: FormEvent) {
    e.preventDefault();
    const name = childName.trim();
    if (!name) return;
    await onCreateChild(tag.id, name);
    setChildName('');
    setAdding(false);
  }

  return (
    <div className="space-y-1">
      <TagAdminRow
        tag={tag}
        nested={depth > 1}
        active={filterTag === tag.id}
        saving={savingTagId === tag.id}
        canAddChild={depth < MAX_TAG_DEPTH}
        onFilter={() => onFilter(tag.id)}
        onColor={(color) => onColor(tag, color)}
        onCatalogBar={(value) => onCatalogBar(tag, value)}
        onStation={showStation ? (station) => onStation(tag, station) : undefined}
        onAddChild={() => setAdding((v) => !v)}
      />
      {(adding || children.length > 0) && (
        <div className="ml-3 space-y-1 border-l border-sq-divider pl-2">
          {children.map((child) => (
            <TagTreeNode
              key={child.id}
              tag={child}
              depth={depth + 1}
              filterTag={filterTag}
              savingTagId={savingTagId}
              onFilter={onFilter}
              onColor={onColor}
              onCatalogBar={onCatalogBar}
              onStation={onStation}
              showStation={showStation}
              onCreateChild={onCreateChild}
            />
          ))}
          {adding && (
            <form onSubmit={(e) => void submitChild(e)} className="flex gap-1.5 pt-1">
              <input
                autoFocus
                className={fieldClass}
                placeholder={`Підгрупа в «${tag.name}»`}
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
              />
              <button type="submit" className="sq-btn-primary px-3 text-sm shrink-0">
                OK
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function TagAdminRow({
  tag,
  nested,
  active,
  saving,
  canAddChild,
  onFilter,
  onColor,
  onCatalogBar,
  onStation,
  onAddChild,
}: {
  tag: PosTag;
  nested?: boolean;
  active: boolean;
  saving: boolean;
  canAddChild: boolean;
  onFilter: () => void;
  onColor: (color: TagColorKey) => void;
  onCatalogBar: (value: boolean) => void;
  /** Present only where a station means something (a café). */
  onStation?: (station: TagStation | null) => void;
  onAddChild: () => void;
}) {
  return (
    <div
      className={`rounded-[4px] border border-transparent p-1.5 space-y-1.5 ${
        active ? 'bg-sq-blue/10 border-sq-blue/30' : ''
      } ${saving ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onFilter}
          className={`flex-1 text-left px-2 py-1 rounded-[4px] font-medium ${
            nested ? 'text-sm text-[#6E6E6E]' : 'text-sm'
          } ${active ? 'text-sq-blue' : 'text-sq-text'}`}
        >
          {tag.name}
          {tag.show_in_catalog_bar && (
            <span className="ml-1.5 text-[10px] font-normal text-sq-blue">рядок</span>
          )}
        </button>
        {canAddChild && (
          <button
            type="button"
            onClick={onAddChild}
            title="Додати підгрупу"
            className="shrink-0 text-xs font-semibold text-sq-blue px-1.5 py-1 rounded-[4px] hover:bg-sq-blue/10"
          >
            + підгрупа
          </button>
        )}
      </div>
      <TagColorSwatches
        value={tag.color}
        onChange={onColor}
        size="sm"
      />
      <label className="flex items-center gap-1.5 px-1 text-[11px] text-sq-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={tag.show_in_catalog_bar}
          disabled={saving}
          onChange={(e) => onCatalogBar(e.target.checked)}
        />
        У рядку категорій
      </label>
      {onStation && (
        <div
          className="flex items-center gap-1 px-1 text-[11px] text-sq-secondary"
          data-testid={`tag-station-${tag.id}`}
        >
          <span className="mr-0.5">Станція:</span>
          {STATION_CHOICES.map(([value, label]) => {
            const current = tag.station ?? null;
            const on = current === value;
            return (
              <button
                key={label}
                type="button"
                disabled={saving}
                aria-pressed={on}
                onClick={() => {
                  if (!on) onStation(value);
                }}
                className={`rounded-full border px-2 py-0.5 ${
                  on ? 'border-sq-blue bg-sq-blue text-white' : 'border-sq-divider text-sq-text'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** «—» clears the station; the ticket then goes to the kitchen by default. */
const STATION_CHOICES: ReadonlyArray<[TagStation | null, string]> = [
  [null, '—'],
  ['kitchen', 'Кухня'],
  ['bar', 'Бар'],
];

function EditProductInline({
  product,
  flatTags,
  groups,
  partOptions,
  onCancel,
  onSaved,
  onCloseAfterSave,
}: {
  product: Product;
  flatTags: PosTag[];
  groups: ModifierGroup[];
  partOptions: ComponentOption[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onCloseAfterSave: () => void;
}) {
  const vertical = useVertical();
  const savedShape = shapeOf(product);
  // Editable, not derived from the product: without this there was no way at
  // all to turn an existing product into a composite — the editor only ever
  // appeared for one that was already composite, and the whole feature was
  // reachable only from the create form.
  const [shape, setShape] = useState<ProductShape>(savedShape);
  const composite = shape !== '';
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(product.image_url);
  const [sellable, setSellable] = useState(product.sellable !== false);
  const [tagIds, setTagIds] = useState<number[]>(product.tag_ids ?? []);
  const [groupIds, setGroupIds] = useState<number[]>(product.modifier_group_ids ?? []);
  const [variants, setVariants] = useState<ProductVariant[]>(
    product.variants.filter((v) => v.is_active)
  );
  // Kept next to `variants` rather than inside them: the composition is a
  // separate write, and mixing it into the variant row would make it too easy
  // to send a half-edited one.
  const [compositions, setCompositions] = useState<Record<number, ProductComponentInput[]>>(() =>
    Object.fromEntries(
      product.variants
        .filter((v) => v.is_active)
        .map((v) => [
          v.id,
          (v.components ?? []).map((c) => ({
            component_variant_id: c.component_variant_id,
            quantity: c.quantity,
          })),
        ])
    )
  );
  const [newAttributes, setNewAttributes] = useState<AttributeValues>({});
  const [newUnit, setNewUnit] = useState(vertical.defaultUnit);
  const [newPrice, setNewPrice] = useState('690');
  const [newPack, setNewPack] = useState({ qty: '', label: '' });
  const [newComponents, setNewComponents] = useState<ProductComponentInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleTag(id: number) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function writeVariants(components: 'clear' | 'keep'): Promise<void> {
    for (const v of variants) {
      await api.updateVariant(v.id, {
        attributes: v.attributes,
        unit: v.unit,
        price_cents: v.price_cents,
        compare_at_cents: v.compare_at_cents ?? null,
        sku: v.sku ?? '',
        barcode: v.barcode ?? '',
        // Sent as a pair every time: the form owns both halves, and sending
        // one alone is what the server refuses by name.
        pack_qty: v.pack_qty ?? null,
        pack_label: v.pack_label ?? '',
        ...(components === 'clear'
          ? { components: [] }
          : composite
            ? { components: compositions[v.id] ?? [] }
            : {}),
      });
    }
  }

  /**
   * The product's shape and its variants, in whichever order the server will
   * accept — it enforces four rules and two of them are ordering rules:
   *
   * - a simple product may not carry a composition, so becoming composite has
   *   to happen **before** the compositions are written;
   * - a composite may not become simple while a composition still exists, so
   *   those have to be cleared **first**;
   * - a derived composite needs every variant composed, so simple → derived
   *   cannot be one write. It goes through `own` (which has no such rule),
   *   the compositions land, and only then the mode flips. If that last step
   *   is refused — a derived composite may not hold stock — the product stays
   *   a perfectly valid `own` composite and the message says what to do.
   */
  async function saveShapeAndVariants(): Promise<void> {
    const details = { name, description, image_url: imageUrl, sellable };
    if (shape === savedShape) {
      await api.updateProduct(product.id, details);
      await writeVariants('keep');
      return;
    }

    if (shape === '') {
      await writeVariants('clear');
      await api.updateProduct(product.id, { ...details, kind: 'simple' });
      return;
    }

    await api.updateProduct(product.id, { ...details, kind: 'composite', stock_mode: 'own' });
    await writeVariants('keep');
    if (shape === 'derived') {
      await api.updateProduct(product.id, { stock_mode: 'derived' });
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await saveShapeAndVariants();
      await api.setProductTags(product.id, tagIds);
      // Always, like tags: sending the empty list is how a question is taken away.
      await api.setProductModifierGroups(product.id, groupIds);
      await onSaved();
      onCloseAfterSave();
    } catch (err) {
      setError(saveErrorMessage(err, 'Не вдалося зберегти'));
    } finally {
      setSaving(false);
    }
  }

  async function addVariant() {
    try {
      const updated = await api.addVariant(product.id, {
        attributes: newAttributes,
        unit: newUnit,
        price_cents: uahInputToCents(newPrice),
        quantity: 0,
        pack_qty: newPack.qty.trim() === '' ? null : Number(newPack.qty),
        pack_label: newPack.label.trim() === '' ? null : newPack.label,
        ...(composite ? { components: newComponents } : {}),
      });
      const active = updated.variants.filter((v) => v.is_active);
      setVariants(active);
      setCompositions(
        Object.fromEntries(
          active.map((v) => [
            v.id,
            (v.components ?? []).map((c) => ({
              component_variant_id: c.component_variant_id,
              quantity: c.quantity,
            })),
          ])
        )
      );
      setNewAttributes({});
      setNewUnit(vertical.defaultUnit);
      setNewPrice('690');
      setNewPack({ qty: '', label: '' });
      setNewComponents([]);
      await onSaved();
    } catch {
      setError('Не вдалося додати варіант');
    }
  }

  async function archiveVariant(id: number) {
    if (!confirm('Архівувати варіант? Зникне з каси.')) return;
    const updated = await api.archiveVariant(id);
    setVariants(updated.variants.filter((v) => v.is_active));
    await onSaved();
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="border border-sq-blue/40 rounded-sq p-4 grid sm:grid-cols-2 gap-3 bg-sq-surface shadow-sm"
    >
      <div className="sm:col-span-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-sq-text">Редагування</p>
        <button type="button" className="text-sm text-sq-secondary font-medium" onClick={onCancel}>
          Сховати
        </button>
      </div>

      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

      <ProductPhotoField value={imageUrl} onChange={setImageUrl} />

      <input
        className={fieldClass}
        placeholder="Назва"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className={fieldClass}
        placeholder="Опис"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="block space-y-1 sm:col-span-2">
        <span className="text-xs text-sq-secondary">Що це за товар</span>
        <select
          className={fieldClass}
          value={shape}
          onChange={(e) => setShape(e.target.value as ProductShape)}
        >
          {SHAPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {shape !== '' && (
          <span className="text-xs text-sq-secondary">{compositionHint(shape)}</span>
        )}
      </label>

      <label className="flex items-start gap-2 text-sm text-sq-text cursor-pointer sm:col-span-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={sellable}
          onChange={(e) => setSellable(e.target.checked)}
        />
        <span>
          Продається на касі
          <span className="block text-[11px] text-sq-secondary">
            Вимкніть для інгредієнта чи заготовки: склад і рецепти його бачать, екран продажу — ні
          </span>
        </span>
      </label>

      <div className="sm:col-span-2">
        <p className="text-xs font-semibold text-sq-secondary mb-2">Мітки</p>
        <div className="flex flex-wrap gap-2">
          {flatTags.map((t) => (
            <label
              key={t.id}
              className="inline-flex items-center gap-1.5 text-sm border border-sq-divider rounded-full px-2.5 py-1 bg-sq-bg"
            >
              <input
                type="checkbox"
                checked={tagIds.includes(t.id)}
                onChange={() => toggleTag(t.id)}
              />
              {tagPathLabel(flatTags, t)}
            </label>
          ))}
          {flatTags.length === 0 && (
            <span className="text-sm text-sq-muted">Немає міток</span>
          )}
        </div>
      </div>

      <ModifierGroupChips groups={groups} value={groupIds} onChange={setGroupIds} />

      <div className="sm:col-span-2 space-y-3">
        <p className="text-xs font-semibold text-sq-secondary">Варіанти</p>
        {variants.map((v, idx) => (
          <div key={v.id} className="border border-sq-divider rounded-sq p-3 space-y-2 bg-sq-bg/40">
            <AttributeFields
              schema={vertical.attributes}
              value={v.attributes}
              onChange={(attrs) => {
                const next = [...variants];
                next[idx] = { ...v, attributes: attrs };
                setVariants(next);
              }}
              unit={{
                value: v.unit,
                options: vertical.units,
                onChange: (u) => {
                  const next = [...variants];
                  next[idx] = { ...v, unit: u };
                  setVariants(next);
                },
              }}
            />
            <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-center">
              <input
                className={fieldClass}
                value={(v.price_cents / 100).toFixed(2)}
                onChange={(e) => {
                  const next = [...variants];
                  next[idx] = { ...v, price_cents: uahInputToCents(e.target.value) };
                  setVariants(next);
                }}
                placeholder="Ціна, грн"
              />
              <button
                type="button"
                className="text-sm font-semibold text-red-600 min-h-11 px-2"
                onClick={() => void archiveVariant(v.id)}
              >
                Архів
              </button>
            </div>
            <VariantDiscountEditor
              priceCents={v.price_cents}
              compareAtCents={v.compare_at_cents ?? null}
              onChange={(price_cents, compare_at_cents) => {
                const next = [...variants];
                next[idx] = { ...v, price_cents, compare_at_cents };
                setVariants(next);
              }}
            />
            {composite && (
              <CompositionEditor
                value={compositions[v.id] ?? []}
                options={partOptions}
                onChange={(next) => setCompositions((prev) => ({ ...prev, [v.id]: next }))}
              />
            )}
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-xs text-sq-secondary">Артикул (SKU)</span>
                <input
                  className={fieldClass}
                  value={v.sku ?? ''}
                  onChange={(e) => {
                    const next = [...variants];
                    next[idx] = { ...v, sku: e.target.value };
                    setVariants(next);
                  }}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-sq-secondary">Штрихкод</span>
                <div className="flex gap-2">
                  <input
                    className={fieldClass}
                    value={v.barcode ?? ''}
                    onChange={(e) => {
                      const next = [...variants];
                      next[idx] = { ...v, barcode: e.target.value };
                      setVariants(next);
                    }}
                  />
                  <GenerateBarcodeButton
                    onGenerated={(code) => {
                      const next = [...variants];
                      next[idx] = { ...v, barcode: code };
                      setVariants(next);
                    }}
                  />
                </div>
              </label>
            </div>
            <PackFields
              qty={v.pack_qty == null ? '' : String(v.pack_qty)}
              label={v.pack_label ?? ''}
              unit={v.unit}
              onChange={({ qty, label }) => {
                const next = [...variants];
                next[idx] = {
                  ...v,
                  pack_qty: qty.trim() === '' ? null : Number(qty),
                  pack_label: label,
                };
                setVariants(next);
              }}
            />
          </div>
        ))}

        <div className="space-y-2 pt-1 border-t border-sq-divider">
          <AttributeFields
            schema={vertical.attributes}
            value={newAttributes}
            onChange={setNewAttributes}
            unit={{ value: newUnit, options: vertical.units, onChange: setNewUnit }}
          />
          {composite && (
            <CompositionEditor
              value={newComponents}
              options={partOptions}
              onChange={setNewComponents}
            />
          )}
          <PackFields
            qty={newPack.qty}
            label={newPack.label}
            unit={newUnit}
            onChange={setNewPack}
          />
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-center">
            <input
              className={fieldClass}
              placeholder="Ціна, грн"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <button
              type="button"
              className="text-sm font-semibold text-sq-blue min-h-11 px-2"
              onClick={() => void addVariant()}
            >
              + Варіант
            </button>
          </div>
        </div>
      </div>

      <button type="submit" disabled={saving} className="sq-btn-primary sm:col-span-2 py-2.5 text-sm">
        {saving ? 'Збереження…' : 'Зберегти'}
      </button>
    </form>
  );
}

function VariantDiscountEditor({
  priceCents,
  compareAtCents,
  onChange,
}: {
  priceCents: number;
  compareAtCents: number | null;
  onChange: (priceCents: number, compareAtCents: number | null) => void;
}) {
  const [pct, setPct] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const hasDiscount = compareAtCents != null && compareAtCents > priceCents;

  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-[11px] font-semibold text-sq-secondary">Знижка товару</p>
      {hasDiscount ? (
        <p className="text-xs text-sq-secondary">
          Стара: {(compareAtCents / 100).toFixed(2)} ₴ → нова: {(priceCents / 100).toFixed(2)} ₴
          <button
            type="button"
            className="ml-2 text-sq-blue font-medium"
            onClick={() => onChange(compareAtCents, null)}
          >
            Скинути знижку
          </button>
        </p>
      ) : (
        <p className="text-xs text-sq-muted">Без знижки</p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className={`${fieldClass} max-w-[100px]`}
          placeholder="% знижки"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
        <button
          type="button"
          className="text-xs font-semibold text-sq-blue px-2 py-1"
          onClick={() => {
            const p = Number(pct);
            if (!Number.isFinite(p) || p <= 0 || p >= 100) return;
            const base = compareAtCents ?? priceCents;
            const nextPrice = Math.round((base * (100 - p)) / 100);
            onChange(nextPrice, base);
            setPct('');
          }}
        >
          За % 
        </button>
        <input
          className={`${fieldClass} max-w-[120px]`}
          placeholder="Нова ціна, грн"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
        />
        <button
          type="button"
          className="text-xs font-semibold text-sq-blue px-2 py-1"
          onClick={() => {
            const next = uahInputToCents(newPrice);
            if (next <= 0 || next >= priceCents) return;
            const base = compareAtCents ?? priceCents;
            onChange(next, base);
            setNewPrice('');
          }}
        >
          За новою ціною
        </button>
      </div>
    </div>
  );
}
