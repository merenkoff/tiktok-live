// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The browsing half of the sell screen: tags, folders, search, scanning and
 * the loaded catalog rows.
 *
 * Extracted from `RegisterPage` so a sales-vertical module can render its own
 * catalog without reimplementing tag navigation and the offline-aware fetch —
 * a florist arranges stems differently, but "which rows am I looking at" is the
 * same question everywhere. The cart, payment, receipt and ПРРО half stays in
 * the host frame.
 *
 * Reads through `cashierApi`, so it works unchanged on the offline till.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cashierApi } from '../platform/sales';
import { useVertical } from './useVertical';
import type { CatalogItem, PosTag } from '../types';

function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children?.length) out.push(...flattenTags(t.children));
  }
  return out;
}

function needsBackNav(tagPath: PosTag[]): boolean {
  if (tagPath.length === 0) return false;
  if (tagPath.length === 1 && tagPath[0].show_in_catalog_bar) return false;
  return true;
}

export interface SalesCatalog {
  /** Rows for the current tag/search, grouped by product for tile rendering. */
  grouped: Array<[number, CatalogItem[]]>;
  /** Sub-tags of the current level that are shown as folders, not bar chips. */
  folderTiles: PosTag[];
  /** Root tags pinned to the horizontal bar. */
  catalogBarTags: PosTag[];
  /** `'all'`, a tag id, or null when the bar has no active chip. */
  catalogBarActiveId: number | 'all' | null;
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  showBack: boolean;
  backLabel: string;
  enterTag: (tag: PosTag) => void;
  selectCatalogBarTag: (tag: PosTag | null) => void;
  goBackOne: () => void;
  /** Rows matching a scanned code — one means "add it", several mean "ask". */
  lookupBarcode: (code: string) => Promise<CatalogItem[]>;
  /** Re-read the current view (after a sale changed stock, say). */
  refresh: () => Promise<void>;
}

export function useSalesCatalog(): SalesCatalog {
  const vertical = useVertical();
  // The server reads the store's vertical itself; the offline mirror has to be
  // told, or a cashier's search finds less with the network down than with it.
  const searchKeys = useMemo(
    () => vertical.attributes.filter((a) => a.inSearch).map((a) => a.key),
    [vertical]
  );

  const [tags, setTags] = useState<PosTag[]>([]);
  const [tagPath, setTagPath] = useState<PosTag[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const currentTag = tagPath[tagPath.length - 1] ?? null;
  const flatTags = useMemo(() => flattenTags(tags), [tags]);

  const catalogBarTags = useMemo(
    () => flatTags.filter((t) => t.show_in_catalog_bar).sort((a, b) => a.sort_order - b.sort_order),
    [flatTags]
  );

  const loadCatalog = useCallback(
    async (opts?: { q?: string; barcode?: string; tag_id?: number }) => {
      setLoading(true);
      try {
        const items = await cashierApi.getCatalog({ ...opts, searchKeys });
        setCatalog(items);
        return items;
      } finally {
        setLoading(false);
      }
    },
    [searchKeys]
  );

  /** The fetch for whatever the screen is currently showing. */
  const loadCurrent = useCallback(() => {
    if (query.trim()) return loadCatalog({ q: query });
    if (currentTag) return loadCatalog({ tag_id: currentTag.id });
    return loadCatalog();
  }, [query, currentTag, loadCatalog]);

  useEffect(() => {
    void cashierApi.getTags().then(setTags);
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const folderTiles = useMemo<PosTag[]>(() => {
    if (query.trim()) return [];
    const level = !currentTag ? tags : (currentTag.children ?? []);
    return level.filter((t) => !t.show_in_catalog_bar);
  }, [query, currentTag, tags]);

  const grouped = useMemo(() => {
    const map = new Map<number, CatalogItem[]>();
    for (const item of catalog) {
      const list = map.get(item.product_id) ?? [];
      list.push(item);
      map.set(item.product_id, list);
    }
    return [...map.entries()];
  }, [catalog]);

  const enterTag = useCallback(
    (tag: PosTag) => {
      setQuery('');
      setTagPath((prev) => {
        if (prev.length === 0) return [tags.find((t) => t.id === tag.id) ?? tag];
        return [...prev, { ...tag, children: tag.children ?? [] }];
      });
    },
    [tags]
  );

  const selectCatalogBarTag = useCallback(
    (tag: PosTag | null) => {
      setQuery('');
      if (!tag) return setTagPath([]);
      const full = flatTags.find((t) => t.id === tag.id) ?? tag;
      // A bar selection is always a single-level path, so «‹ назад» never shows.
      if (full.parent_id == null) {
        setTagPath([tags.find((t) => t.id === full.id) ?? full]);
        return;
      }
      setTagPath([{ ...full, children: [] }]);
    },
    [flatTags, tags]
  );

  const goBackOne = useCallback(() => {
    setQuery('');
    setTagPath((prev) => prev.slice(0, -1));
  }, []);

  const lookupBarcode = useCallback(
    (code: string) => loadCatalog({ barcode: code.trim() }),
    [loadCatalog]
  );

  const showBack = needsBackNav(tagPath);

  return {
    grouped,
    folderTiles,
    catalogBarTags,
    catalogBarActiveId:
      !showBack && currentTag?.show_in_catalog_bar ? currentTag.id : !currentTag ? 'all' : null,
    loading,
    query,
    setQuery,
    showBack,
    backLabel:
      tagPath.length <= 1 ? 'Усі товари' : (tagPath[tagPath.length - 2]?.name ?? 'Усі товари'),
    enterTag,
    selectCatalogBarTag,
    goBackOne,
    lookupBarcode,
    refresh: async () => {
      await loadCurrent();
    },
  };
}
