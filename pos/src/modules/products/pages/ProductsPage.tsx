// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_TAG_COLOR,
  api,
  assetUrl,
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
} from '@pos/platform';
import { CompositionEditor } from '../components/CompositionEditor';
import { DishFactsFields } from '../components/DishFactsFields';
import { GenerateBarcodeButton } from '../components/GenerateBarcodeButton';
import { ModifierGroupChips } from '../components/ModifierGroupChips';
import { PackFields } from '../components/PackFields';
import { SellableField } from '../components/ProductSide';
import { TagDot } from '../components/TagDot';
import { VariantMatrix, type MatrixResult } from '../components/VariantMatrix';
import { VariantsTable } from '../components/VariantsTable';
import { colourVocabulary, supportsMatrix } from '../components/variantMatrix';
import { captionClass, checkboxClass, chipClass, panelFieldClass } from '../components/formStyles';
import { productMatchesQuery } from '../components/productSearch';
import { productFormScope } from '../components/productFormScope';
import { componentOptions } from '../components/componentOptions';
import { flattenTags, tagPathLabel } from '../components/tagLabels';
import { compositionHint, SHAPE_OPTIONS, type ProductShape } from '../lib/productShape';
import { saveErrorMessage } from '../lib/saveErrors';
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
} from '@pos/platform/ui';
import { TagColorSwatches } from '../components/TagColorSwatches';

const MAX_TAG_DEPTH = 3;

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<number | 'all' | 'needs_review'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tagsOpen, setTagsOpen] = useState(false);
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
  const [showCreate, setShowCreate] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColorKey>(DEFAULT_TAG_COLOR);
  const [newTagCatalogBar, setNewTagCatalogBar] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<number | ''>('');
  const [savingTagId, setSavingTagId] = useState<number | null>(null);

  const vertical = useVertical();
  const [name, setName] = useState('');
  // What the guest reads on the QR menu: the owner's words, not the recipe.
  const [newDescription, setNewDescription] = useState('');
  const [newComposition, setNewComposition] = useState('');
  const [newAllergens, setNewAllergens] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<AttributeValues>({});
  const [unit, setUnit] = useState(vertical.defaultUnit);
  // No invented price: a garment that went in at «690» because the box was left
  // alone is a wrong price nobody sees until the till.
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  // The size × colour matrix (clothing): what it would create, and why it cannot yet.
  const [matrix, setMatrix] = useState<MatrixResult | null>(null);
  // The search box above the list — words, every one of which has to match.
  const [query, setQuery] = useState('');
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
  // What this kind of store is asked about: a boutique is not asked what a
  // composite is, nor for a dish's composition and allergens. An older cached
  // auth carries neither field, and then everything shows, as it always did.
  const { canComposite, askDishFacts } = productFormScope(vertical);
  const partOptions = useMemo(
    () => componentOptions(products, { maxDepth }),
    [products, maxDepth]
  );
  // A garment is one card with a dozen variants, so a vertical with both colour
  // and size fills them as a matrix; every other vertical (and a composite, which
  // the matrix cannot compose) keeps the one-variant form.
  const matrixVertical = supportsMatrix(vertical.attributes);
  const useMatrix = matrixVertical && composite === '';
  const colours = useMemo(() => colourVocabulary(products), [products]);

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

  // `?edit=<id>` is the address «Техкарти» and older bookmarks used before the
  // card had a page of its own; it still works — by sending the owner there.
  // `replace`, so Back from the card returns to where the link was, not to
  // this redirect. A junk id is dropped from the URL and the list stays.
  useEffect(() => {
    const raw = searchParams.get('edit');
    if (!raw) return;
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) {
      navigate(`/admin/products/${id}`, { replace: true });
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, navigate, setSearchParams]);

  const visible = products.filter((p) => {
    if (!p.is_active) return false;
    if (!productMatchesQuery(p, query)) return false;
    if (filterTag === 'needs_review') return Boolean(p.needs_review);
    if (filterTag === 'all') return true;
    return p.tag_ids?.includes(filterTag);
  });

  const needsReviewCount = products.filter((p) => p.is_active && p.needs_review).length;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (useMatrix && matrix?.problem) {
      setError(matrix.problem);
      return;
    }
    if (!useMatrix && uahInputToCents(price) <= 0) {
      setError('Вкажіть ціну');
      return;
    }
    try {
      const created = await api.createProduct({
        name,
        description: newDescription,
        composition: newComposition,
        allergens: newAllergens,
        image_url: imageUrl,
        ...(composite ? { kind: 'composite' as const, stock_mode: composite } : {}),
        sellable,
        variants:
          useMatrix && matrix
            ? matrix.variants
            : [
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
      setNewDescription('');
      setNewComposition('');
      setNewAllergens([]);
      setBarcode('');
      setSku('');
      setPrice('');
      setMatrix(null);
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
            onClick={() => setShowCreate((v) => !v)}
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
          <input
            type="search"
            className="sq-input"
            aria-label="Пошук товарів"
            placeholder="Пошук: назва, колір, розмір, артикул, штрихкод"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
              {canComposite && (
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
              )}
              <SellableField checked={sellable} onChange={setSellable} />
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className={captionClass}>Опис</span>
                <input
                  className="sq-input"
                  placeholder="Опис"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </label>
              {askDishFacts && (
                <DishFactsFields
                  composition={newComposition}
                  onComposition={setNewComposition}
                  allergens={newAllergens}
                  onAllergens={setNewAllergens}
                />
              )}
              <ModifierGroupChips groups={groups} value={groupIds} onChange={setGroupIds} />
              {useMatrix ? (
                <VariantMatrix
                  unit={vertical.defaultUnit}
                  vocabulary={colours}
                  autoBarcode={vertical.autoBarcode === true}
                  onChange={setMatrix}
                />
              ) : (
                <>
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
                      required
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
                </>
              )}
              <button
                type="submit"
                className="pos-btn-primary sm:col-span-2 sm:justify-self-end min-h-11 px-6 rounded-sq text-[15px]"
              >
                Зберегти
              </button>
            </form>
          )}

          {query.trim() !== '' && visible.length === 0 && (
            <p className="text-[15px] text-sq-muted px-1">Нічого не знайдено за «{query.trim()}»</p>
          )}

          <div className="space-y-3">
            {visible.map((product) => {
              // The card is a page of its own; the list hands it the search
              // and the tag, so «← Товари» lands back on the same view.
              const cardTo = `/admin/products/${product.id}`;
              const cardState = { list: location.search };
              return (
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
                          <h3 className="text-base font-semibold text-sq-text truncate">
                            <Link to={cardTo} state={cardState} className="hover:text-sq-blue">
                              {product.name}
                            </Link>
                          </h3>
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
                          <Link
                            to={cardTo}
                            state={cardState}
                            className="inline-flex items-center min-h-9 px-2.5 rounded-lg text-sq-blue hover:bg-sq-sidebar"
                          >
                            Редагувати
                          </Link>
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
              );
            })}
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
