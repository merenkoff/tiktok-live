// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_TAG_COLOR,
  api,
  assetUrl,
  formatUah,
  resolveTagColorHex,
  type TagColorKey,
  uahInputToCents,
  useAuthStore,
  useVertical,
} from '@pos/platform';
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
import { listTechCards, type TechCardRow } from '../data/techCardsApi';
import { foodCostPercent, missingReason } from '../data/techCards';
import type { ComponentOption } from '../components/componentOptions';
import {
  AttributeFields,
  Inbox,
  LayoutGrid,
  Package,
  PackageLine,
  PageHeader,
  Plus,
  Printer,
  ProductPhotoField,
  useDragScroll,
} from '@pos/platform/ui';
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

/** A caption above a field — Things' 13/600, never inside the label's own text (the field would inherit it). */
const captionClass = 'text-[13px] font-semibold text-sq-secondary';
/** Native checkbox in the accent blue. */
const checkboxClass = 'w-4 h-4 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';
/** On the grey tag panel a grey well would vanish, so the fields there are white. */
const panelFieldClass = 'sq-input !bg-sq-surface';
/** Things' quiet chip: 22 px, a small radius, a hue only where it means something. */
const chipClass = 'h-[22px] px-2 rounded-md text-xs font-medium inline-flex items-center whitespace-nowrap';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<number | 'all' | 'needs_review'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tagsOpen, setTagsOpen] = useState(false);
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditIdState] = useState<number | null>(null);
  // «Техкарти» links here with `?edit=<id>` — a screen that says which dish
  // eats the profit has to be able to take the owner to it. The param and the
  // local state are kept in step, so closing the card also clears the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const setEditId = useCallback(
    (id: number | null) => {
      setEditIdState(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id == null) next.delete('edit');
          else next.set('edit', String(id));
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  /** What each composite variant costs to assemble — shown beside its recipe. */
  const [techCards, setTechCards] = useState<Map<number, TechCardRow>>(new Map());
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
    const [plist, tlist, glist, cards] = await Promise.all([
      api.getProducts(),
      api.getTags(),
      api.listModifierGroups(),
      // Empty for a shop with no composites, so this costs a clothing store
      // one round trip that answers `[]` — and never fails the page: the
      // catalog is the point here, the cost figure is a bonus beside it.
      listTechCards().catch(() => [] as TechCardRow[]),
    ]);
    setProducts(plist);
    setTags(tlist);
    setGroups(glist);
    setTechCards(new Map(cards.map((c) => [c.variant_id, c])));
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити'));
  }, []);

  // `?edit=<id>` from «Техкарти». Applied once the catalog is in: opening a
  // card for a product this owner cannot see would leave the page blank with
  // the param still on it.
  useEffect(() => {
    const raw = searchParams.get('edit');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || !products.some((p) => p.id === id)) return;
    setEditIdState(id);
  }, [searchParams, products]);

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
    <div className="animate-fade-up text-sq-text">
      <PageHeader
        glyph={Package}
        title="Товари"
        subtitle="Мітки, варіанти та залишки."
        actions={
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setEditId(null);
            }}
            className={
              showCreate ? 'sq-btn-quiet' : 'pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5'
            }
          >
            {showCreate ? (
              'Сховати'
            ) : (
              <>
                <Plus size={20} />
                Додати товар
              </>
            )}
          </button>
        }
      />

      {error && (
        <div className="mb-5 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Drawn like the admin sidebar: a grey panel, 38 px rows, the
            selection grey rather than blue. A tag's own settings open under
            it when it is the one selected, so the column reads as a list of
            tags and not as a wall of swatches. */}
        <aside
          aria-label="Мітки"
          className="rounded-card bg-sq-sidebar p-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
        >
          <p className="px-2.5 pt-2 pb-1 text-xs font-semibold text-sq-muted">Мітки</p>
          <div className="space-y-0.5">
            <FilterRow
              active={filterTag === 'all'}
              onClick={() => setFilterTag('all')}
              icon={<LayoutGrid size={20} className="text-sq-secondary" />}
              label="Усі товари"
            />
            <FilterRow
              active={filterTag === 'needs_review'}
              onClick={() => setFilterTag('needs_review')}
              icon={<Inbox size={20} className="text-sq-secondary" />}
              label="З приходу — перевірте"
              count={needsReviewCount}
            />
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
          </div>

          <form onSubmit={onCreateTag} className="mt-3 mx-1 pt-4 pb-1 border-t border-sq-divider space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className={captionClass}>Нова коренева група</span>
              <input
                className={panelFieldClass}
                placeholder="Назва"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                required
              />
            </label>
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-sq-secondary">Колір плитки</p>
              <TagColorSwatches value={newTagColor} onChange={setNewTagColor} size="sm" />
            </div>
            <label className="flex items-start gap-2.5 text-[15px] text-sq-text cursor-pointer">
              <input
                type="checkbox"
                className={`${checkboxClass} mt-1`}
                checked={newTagCatalogBar}
                onChange={(e) => setNewTagCatalogBar(e.target.checked)}
              />
              <span>
                Показувати в рядку категорій
                <span className="block text-[13px] text-sq-muted">Рядок категорій на касі</span>
              </span>
            </label>
            <button type="submit" className="pos-btn-primary w-full min-h-11 rounded-sq text-[15px]">
              Додати групу
            </button>
          </form>
        </aside>

        <div className="space-y-4 min-w-0">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sq-sidebar px-3 py-2.5">
              <span className="text-[15px] text-sq-secondary tabular-nums mr-1">Обрано: {selected.size}</span>
              <div className="w-56 max-w-full">
                <select
                  className={panelFieldClass}
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
              </div>
              <button
                type="button"
                onClick={() => void onBulkAssign()}
                className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
              >
                Додати мітку
              </button>
              <button type="button" onClick={() => setTagsOpen(true)} className="sq-btn-quiet">
                <Printer size={20} />
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
              className="rounded-card bg-sq-surface shadow-card p-5 grid sm:grid-cols-2 gap-x-4 gap-y-4"
            >
              <h3 className="sm:col-span-2 text-[19px] font-bold text-sq-heading">Новий товар</h3>
              <ProductPhotoField value={imageUrl} onChange={setImageUrl} />
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Назва</span>
                <input className="sq-input" placeholder="Назва" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              {/* Directly under the name on purpose: this choice decides what the
                  rest of the form means (a derived composite has no opening
                  stock, a composite needs a composition). Below the fold it was
                  simply never found. */}
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Що це за товар</span>
                <select
                  className="sq-input"
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
              <SellableField checked={sellable} onChange={setSellable} />
              <ModifierGroupChips groups={groups} value={groupIds} onChange={setGroupIds} />
              <AttributeFields
                className="sm:col-span-2 grid gap-3 sm:grid-cols-2"
                schema={vertical.attributes}
                value={attributes}
                onChange={setAttributes}
                unit={{ value: unit, options: vertical.units, onChange: setUnit }}
              />
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Ціна, грн</span>
                <input
                  className="sq-input tabular-nums"
                  placeholder="Ціна, грн"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              {composite === 'derived' ? (
                <p className="text-[13px] text-sq-muted self-end pb-3">
                  Залишок рахується зі складників.
                </p>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className={captionClass}>Залишок</span>
                  <input
                    className="sq-input tabular-nums"
                    placeholder="Залишок"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </label>
              )}
              {composite && (
                <div className="sm:col-span-2">
                  <CompositionEditor
                    value={components}
                    options={partOptions}
                    onChange={setComponents}
                  />
                  <p className="text-[13px] text-sq-muted mt-1.5">
                    {compositionHint(composite)}
                  </p>
                </div>
              )}
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Артикул (SKU) — ваш внутрішній код</span>
                <input className="sq-input" value={sku} onChange={(e) => setSku(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Штрихкод — те, що читає сканер</span>
                <div className="flex gap-2">
                  <input className="sq-input tabular-nums min-w-0" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
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
              <button
                type="submit"
                className="pos-btn-primary sm:col-span-2 sm:justify-self-end min-h-11 px-6 rounded-sq text-[15px]"
              >
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
                  techCards={techCards}
                  onCancel={() => setEditId(null)}
                  onSaved={async () => {
                    await reload();
                  }}
                  onCloseAfterSave={() => setEditId(null)}
                />
              ) : (
                <section key={product.id} className="rounded-card bg-sq-surface shadow-card p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Обрати «${product.name}»`}
                      className={`${checkboxClass} mt-3`}
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                    />
                    <div className="w-10 h-10 rounded-lg bg-sq-empty overflow-hidden shrink-0 grid place-items-center">
                      {product.image_url ? (
                        <img
                          src={assetUrl(product.image_url) ?? undefined}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <PackageLine size={20} className="text-sq-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0 min-h-10 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="text-base font-semibold text-sq-text truncate">{product.name}</h3>
                          {product.needs_review && (
                            <span className={`${chipClass} bg-amber-50 text-amber-800`}>
                              Потребує перевірки
                            </span>
                          )}
                          {product.kind === 'composite' && (
                            <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>
                              {product.stock_mode === 'derived'
                                ? 'Складений · при продажу'
                                : 'Складений · збираємо'}
                            </span>
                          )}
                          {product.sellable === false && (
                            <span className={`${chipClass} ring-1 ring-inset ring-sq-divider text-sq-secondary`}>
                              Не на касі
                            </span>
                          )}
                          {(product.modifier_group_ids?.length ?? 0) > 0 && (
                            <span className={`${chipClass} bg-sq-blue/10 text-sq-blue-press`}>
                              Модифікатори · {product.modifier_group_ids?.length}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[15px] font-semibold">
                          <button
                            type="button"
                            className="min-h-9 px-2.5 rounded-lg text-sq-blue hover:bg-sq-sidebar"
                            onClick={() => {
                              setShowCreate(false);
                              setEditId(product.id);
                            }}
                          >
                            Редагувати
                          </button>
                          <button
                            type="button"
                            className="min-h-9 px-2.5 rounded-lg text-red-600 hover:bg-red-50"
                            onClick={() => void onArchiveProduct(product)}
                          >
                            Архів
                          </button>
                        </div>
                      </div>
                      {(product.tag_ids?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(product.tag_ids ?? []).map((tid) => {
                            const tag = flatTags.find((t) => t.id === tid);
                            return (
                              <span
                                key={tid}
                                className={`${chipClass} gap-1.5 ring-1 ring-inset ring-sq-divider text-sq-secondary`}
                              >
                                <TagDot color={tag?.color} />
                                {tag?.name ?? tid}
                              </span>
                            );
                          })}
                        </div>
                      )}
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
              <div className="py-12 flex flex-col items-center gap-3 text-center">
                <Package size={48} />
                <p className="text-[15px] text-sq-secondary">Немає товарів у цьому фільтрі.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A tag's tile colour, as a dot — the same hue the till's folder tile wears. */
function TagDot({ color, size = 'sm' }: { color: string | null | undefined; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`${size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full shrink-0`}
      style={{ backgroundColor: resolveTagColorHex(color) }}
    />
  );
}

/** One row of the tag panel that is not a tag: «Усі товари», «З приходу». */
function FilterRow({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 min-h-[38px] px-2.5 rounded-lg text-left text-[15px] text-sq-text transition-colors ${
        active ? 'bg-sq-selected font-semibold' : 'font-medium hover:bg-sq-selected/50'
      }`}
    >
      <span className="w-5 h-5 grid place-items-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count ? <span className="text-[13px] font-normal text-sq-muted tabular-nums">{count}</span> : null}
    </button>
  );
}

/** «Продається на касі» — the same switch in the create and the edit form. */
function SellableField({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[15px] text-sq-text cursor-pointer sm:col-span-2">
      <input
        type="checkbox"
        className={`${checkboxClass} mt-1`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Продається на касі
        <span className="block text-[13px] text-sq-muted">
          Вимкніть для інгредієнта чи заготовки: склад і рецепти його бачать, екран продажу — ні
        </span>
      </span>
    </label>
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
      className="sq-btn-quiet shrink-0 whitespace-nowrap"
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
    <div ref={scrollRef} className="mt-2 overflow-x-auto select-none">
      <table className="sq-table">
        <thead>
          <tr>
            <th>Варіант</th>
            <th className="!text-right">Ціна</th>
            <th className="!text-right">{derived ? 'Можна зібрати' : 'Залишок'}</th>
            <th>Артикул</th>
            <th className="!pr-0">Штрихкод</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id}>
              <td>{v.label || '—'}</td>
              <td className="text-right tabular-nums whitespace-nowrap">{formatUah(v.price_cents)}</td>
              <td className="text-right tabular-nums whitespace-nowrap">
                {v.quantity}
                {v.unit ? <span className="text-[13px] text-sq-muted"> {v.unit}</span> : null}
              </td>
              <td className="text-[13px] text-sq-secondary tabular-nums">{v.sku || '—'}</td>
              <td className="!pr-0 text-[13px] text-sq-secondary tabular-nums">{v.barcode || '—'}</td>
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
    <div className="space-y-0.5">
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
        <div className="pl-4 space-y-0.5">
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
            <form onSubmit={(e) => void submitChild(e)} className="flex gap-1.5 py-1 pr-1">
              <input
                autoFocus
                className={panelFieldClass}
                placeholder={`Підгрупа в «${tag.name}»`}
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                required
              />
              <button type="submit" className="pos-btn-primary min-h-11 px-3.5 rounded-sq text-[15px] shrink-0">
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
    <div className={saving ? 'opacity-60' : ''}>
      <div
        className={`flex items-center rounded-lg transition-colors ${
          active ? 'bg-sq-selected' : 'hover:bg-sq-selected/50'
        }`}
      >
        <button
          type="button"
          onClick={onFilter}
          className={`flex-1 min-w-0 flex items-center gap-2.5 min-h-[38px] pl-2.5 pr-1 text-left text-[15px] ${
            active ? 'font-semibold' : 'font-medium'
          } ${nested && !active ? 'text-sq-secondary' : 'text-sq-text'}`}
        >
          <span className="w-5 h-5 grid place-items-center shrink-0">
            <TagDot color={tag.color} size="md" />
          </span>
          <span className="truncate">{tag.name}</span>
          {tag.show_in_catalog_bar && (
            <span className="text-xs font-normal text-sq-muted shrink-0">рядок</span>
          )}
        </button>
        {canAddChild && (
          <button
            type="button"
            onClick={onAddChild}
            title="Додати підгрупу"
            aria-label="Додати підгрупу"
            className="shrink-0 w-8 h-8 mr-1 grid place-items-center rounded-md text-sq-muted hover:text-sq-blue hover:bg-sq-surface/70"
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      {active && (
        <div className="pl-[42px] pr-2 pt-2 pb-3 space-y-2.5">
          <TagColorSwatches
            value={tag.color}
            onChange={onColor}
            size="sm"
          />
          <label className="flex items-center gap-2 text-[13px] text-sq-secondary cursor-pointer">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={tag.show_in_catalog_bar}
              disabled={saving}
              onChange={(e) => onCatalogBar(e.target.checked)}
            />
            У рядку категорій
          </label>
          {onStation && (
            <div
              className="flex flex-wrap items-center gap-2 text-[13px] text-sq-secondary"
              data-testid={`tag-station-${tag.id}`}
            >
              <span>Станція:</span>
              <div className="inline-flex gap-0.5 p-[2px] rounded-lg bg-sq-empty">
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
                      className={`h-7 px-2.5 rounded-md text-[13px] transition-colors ${
                        on
                          ? 'bg-sq-surface shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                          : 'font-medium text-sq-secondary hover:text-sq-text'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

/**
 * What this variant costs to assemble, beside the recipe it is summed from.
 *
 * The same rule as «Техкарти» and for the same reason: a recipe with one
 * unpriced ingredient has no honest food cost, so it says «—» and why. It is
 * the SAVED recipe's figure — edit the composition and it refreshes after the
 * save, which is when the server recomputes it.
 */
function TechCardLine({ card }: { card?: TechCardRow }) {
  if (!card) return null;
  const reason = missingReason(card);
  return (
    <p className="text-[13px] text-sq-secondary">
      Собівартість: <strong className="font-semibold text-sq-text tabular-nums">{formatUah(card.cost_cents)}</strong>
      {' · food cost: '}
      {reason ? (
        <span>— ({reason})</span>
      ) : (
        <strong className="font-semibold text-sq-text tabular-nums">{foodCostPercent(card.food_cost_bps!)}</strong>
      )}
      {' · за останніми цінами закупівлі'}
    </p>
  );
}

function EditProductInline({
  product,
  flatTags,
  groups,
  partOptions,
  techCards,
  onCancel,
  onSaved,
  onCloseAfterSave,
}: {
  product: Product;
  flatTags: PosTag[];
  groups: ModifierGroup[];
  partOptions: ComponentOption[];
  /** What each composite variant costs to assemble, by variant id. */
  techCards: Map<number, TechCardRow>;
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
      className="rounded-card bg-sq-surface shadow-card ring-2 ring-sq-blue/25 p-5 grid sm:grid-cols-2 gap-x-4 gap-y-4"
    >
      <div className="sm:col-span-2 flex items-center justify-between gap-2">
        <h3 className="text-[19px] font-bold text-sq-heading">Редагування</h3>
        <button
          type="button"
          className="min-h-9 px-3 rounded-lg text-[15px] font-semibold text-sq-secondary hover:bg-sq-sidebar"
          onClick={onCancel}
        >
          Сховати
        </button>
      </div>

      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

      <ProductPhotoField value={imageUrl} onChange={setImageUrl} />

      <label className="flex flex-col gap-1.5">
        <span className={captionClass}>Назва</span>
        <input
          className="sq-input"
          placeholder="Назва"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={captionClass}>Опис</span>
        <input
          className="sq-input"
          placeholder="Опис"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className={captionClass}>Що це за товар</span>
        <select
          className="sq-input"
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
          <span className="text-[13px] text-sq-muted">{compositionHint(shape)}</span>
        )}
      </label>

      <SellableField checked={sellable} onChange={setSellable} />

      <div className="sm:col-span-2">
        <p className={`${captionClass} mb-2`}>Мітки</p>
        <div className="flex flex-wrap gap-2">
          {flatTags.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <label
                key={t.id}
                className={`inline-flex items-center gap-2 min-h-9 px-3 rounded-[10px] text-[15px] cursor-pointer transition-colors ${
                  on
                    ? 'bg-sq-blue/[0.08] ring-1 ring-inset ring-sq-blue/40 text-sq-text font-medium'
                    : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text hover:bg-sq-sidebar'
                }`}
              >
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={on}
                  onChange={() => toggleTag(t.id)}
                />
                <TagDot color={t.color} />
                {tagPathLabel(flatTags, t)}
              </label>
            );
          })}
          {flatTags.length === 0 && (
            <span className="text-[15px] text-sq-muted">Немає міток</span>
          )}
        </div>
      </div>

      <ModifierGroupChips groups={groups} value={groupIds} onChange={setGroupIds} />

      <div className="sm:col-span-2 space-y-3">
        <p className={captionClass}>Варіанти</p>
        {variants.map((v, idx) => (
          <div key={v.id} className="rounded-xl ring-1 ring-inset ring-sq-divider p-4 space-y-3">
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
            <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Ціна, грн</span>
                <input
                  className="sq-input tabular-nums"
                  value={(v.price_cents / 100).toFixed(2)}
                  onChange={(e) => {
                    const next = [...variants];
                    next[idx] = { ...v, price_cents: uahInputToCents(e.target.value) };
                    setVariants(next);
                  }}
                  placeholder="Ціна, грн"
                />
              </label>
              <button
                type="button"
                className="text-[15px] font-semibold text-red-600 min-h-11 px-2"
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
              <>
                <CompositionEditor
                  value={compositions[v.id] ?? []}
                  options={partOptions}
                  onChange={(next) => setCompositions((prev) => ({ ...prev, [v.id]: next }))}
                />
                <TechCardLine card={techCards.get(v.id)} />
              </>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Артикул (SKU)</span>
                <input
                  className="sq-input"
                  value={v.sku ?? ''}
                  onChange={(e) => {
                    const next = [...variants];
                    next[idx] = { ...v, sku: e.target.value };
                    setVariants(next);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={captionClass}>Штрихкод</span>
                <div className="flex gap-2">
                  <input
                    className="sq-input tabular-nums min-w-0"
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

        <div className="space-y-3 pt-4 border-t border-sq-divider">
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
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <label className="flex flex-col gap-1.5">
              <span className={captionClass}>Ціна, грн</span>
              <input
                className="sq-input tabular-nums"
                placeholder="Ціна, грн"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue min-h-11 px-2"
              onClick={() => void addVariant()}
            >
              <Plus size={20} />
              Варіант
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="pos-btn-primary sm:col-span-2 sm:justify-self-end min-h-11 px-6 rounded-sq text-[15px]"
      >
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
    <div className="space-y-2">
      <p className={captionClass}>Знижка товару</p>
      {hasDiscount ? (
        <p className="text-[13px] text-sq-secondary tabular-nums">
          Стара: {(compareAtCents / 100).toFixed(2)} ₴ → нова: {(priceCents / 100).toFixed(2)} ₴
          <button
            type="button"
            className="ml-2 text-sq-blue font-semibold"
            onClick={() => onChange(compareAtCents, null)}
          >
            Скинути знижку
          </button>
        </p>
      ) : (
        <p className="text-[13px] text-sq-muted">Без знижки</p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="w-28">
          <input
            className="sq-input tabular-nums"
            placeholder="% знижки"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
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
        <div className="w-36">
          <input
            className="sq-input tabular-nums"
            placeholder="Нова ціна, грн"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="min-h-11 px-2 text-[15px] font-semibold text-sq-blue"
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
