// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product list (C1e, PR3): a tag panel, a search box, and one ROW per
// product. The card — new or old — is a page of its own
// (`ProductPage.tsx`), so this screen only finds, filters, selects and
// archives; the search words and the tag live in the address, so the card's
// «← Товари» and the browser's Back land on the same view the owner left.

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { DEFAULT_TAG_COLOR, api, type TagColorKey, useAuthStore, useVertical } from '@pos/platform';
import type { PosTag, TagStation, Product } from '@pos/platform';
import { Inbox, LayoutGrid, Package, PageHeader, Plus, Printer } from '@pos/platform/ui';
import { ConfirmSheet } from '../../../components/cashier/ConfirmSheet';
import { PriceTagsDialog } from '../components/PriceTagsDialog';
import { ProductRow } from '../components/ProductRow';
import { TagColorSwatches } from '../components/TagColorSwatches';
import { FilterRow, MAX_TAG_DEPTH, TagTreeNode } from '../components/TagTree';
import { captionClass, checkboxClass, panelFieldClass } from '../components/formStyles';
import { productMatchesQuery } from '../components/productSearch';
import { flattenTags, tagPathLabel } from '../components/tagLabels';
import { readListParams, writeListParams, type TagFilter } from '../lib/listParams';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<PosTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [tagsOpen, setTagsOpen] = useState(false);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const storeName = useAuthStore((s) => s.auth?.store.name ?? '');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColorKey>(DEFAULT_TAG_COLOR);
  const [newTagCatalogBar, setNewTagCatalogBar] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<number | ''>('');
  const [savingTagId, setSavingTagId] = useState<number | null>(null);

  const vertical = useVertical();
  // The view is the address: the search words (every one of which has to
  // match) and the tag. Written with `replace`, so typing does not pile up
  // history, and read back whenever the owner returns here.
  const { q: query, tag: filterTag } = useMemo(() => readListParams(searchParams), [searchParams]);
  const setQuery = (q: string) => setSearchParams((prev) => writeListParams(prev, { q }), { replace: true });
  const setFilterTag = (tag: TagFilter) =>
    setSearchParams((prev) => writeListParams(prev, { tag }), { replace: true });
  // What the card gets so «← Товари» lands on this same view.
  const cardState = { list: location.search };

  const flatTags = useMemo(() => flattenTags(tags), [tags]);

  async function reload() {
    const [plist, tlist] = await Promise.all([api.getProducts(), api.getTags()]);
    setProducts(plist);
    setTags(tlist);
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

  // Asked through the till's own sheet, never `window.confirm`: the desktop
  // webview does not draw that one and answers «no» without a word.
  async function archiveProduct(p: Product) {
    setArchiving(null);
    setError(null);
    try {
      await api.archiveProduct(p.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
      await reload();
    } catch {
      setError(`Не вдалося архівувати «${p.name}»`);
    }
  }

  function toggleIn(set: (fn: (prev: Set<number>) => Set<number>) => void, id: number) {
    set((prev) => {
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
          <Link
            to="/admin/products/new"
            state={cardState}
            className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5"
          >
            <Plus size={20} />
            Додати товар
          </Link>
        }
      />

      {error && (
        <div className="mb-5 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" role="alert">
          {error}
        </div>
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
                onCatalogBar={(tag, show_in_catalog_bar) => void patchTag(tag, { show_in_catalog_bar })}
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
                  aria-label="Мітка для обраних"
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

          {query.trim() !== '' && visible.length === 0 && (
            <p className="text-[15px] text-sq-muted px-1">Нічого не знайдено за «{query.trim()}»</p>
          )}

          {visible.length > 0 ? (
            <div role="list" aria-label="Товари" className="rounded-card bg-sq-surface shadow-card px-4">
              {visible.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  flatTags={flatTags}
                  selected={selected.has(product.id)}
                  onToggleSelect={() => toggleIn(setSelected, product.id)}
                  expanded={expanded.has(product.id)}
                  onToggleExpand={() => toggleIn(setExpanded, product.id)}
                  onArchive={() => setArchiving(product)}
                  cardState={cardState}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <Package size={48} />
              <p className="text-[15px] text-sq-secondary">Немає товарів у цьому фільтрі.</p>
            </div>
          )}
        </div>
      </div>

      {archiving &&
        createPortal(
          <ConfirmSheet
            title={`Архівувати «${archiving.name}»?`}
            message="Зникне з каси, історія продажів збережеться."
            confirmLabel="Архівувати"
            tone="danger"
            onConfirm={() => void archiveProduct(archiving)}
            onCancel={() => setArchiving(null)}
          />,
          document.body
        )}
    </div>
  );
}
