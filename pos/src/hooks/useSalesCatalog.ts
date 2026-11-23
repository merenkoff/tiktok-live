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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cashierApi } from '../platform/sales';
import { useVertical } from './useVertical';
import { countCards, pickTillHome, TILL_HOME_TITLE, type TillHomeKind } from '../lib/tillHome';
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

/** Cards per page of «Усі товари», a folder or a search, when the catalog pages. */
export const CATALOG_PAGE = 120;

/**
 * What the last home screen turned out to be, kept across mounts: the till
 * opens on «Головна» again after «Чеки» without the chips appearing a moment
 * after the grid. `'none'` = nothing ticked, nothing sold — everything shows.
 */
let lastHomeKind: TillHomeKind | 'none' | null = null;

/** Tests start each case from a till that has not shown a home screen yet. */
export function forgetTillHomeForTests(): void {
  lastHomeKind = null;
}

export interface SalesCatalogOptions {
  /**
   * The home screen (migration 112): the root shows the folders and the cards
   * the owner ticked — or the best sellers — and «Усі товари» becomes its own
   * chip; every list is read a page of cards at a time with `loadMore`.
   * Without it the hook behaves exactly as before, which is what a module
   * built before 2026-11-23 gets.
   */
  home?: boolean;
}

export interface SalesCatalog {
  /** Rows for the current tag/search, grouped by product for tile rendering. */
  grouped: Array<[number, CatalogItem[]]>;
  /** Sub-tags of the current level that are shown as folders, not bar chips. */
  folderTiles: PosTag[];
  /** Root tags pinned to the horizontal bar. */
  catalogBarTags: PosTag[];
  /**
   * `'home'` on the home screen, `'all'` on «Усі товари» (or the root of a
   * catalog without a home screen), a tag id, or null when the bar has no
   * active chip.
   */
  catalogBarActiveId: number | 'all' | 'home' | null;
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  showBack: boolean;
  backLabel: string;
  enterTag: (tag: PosTag) => void;
  selectCatalogBarTag: (tag: PosTag | null) => void;
  goBackOne: () => void;
  /**
   * Rows matching a scanned code — one means "add it", several mean "ask".
   * A pure lookup: it never touches the grid, the folder or the search. A
   * scan adds to the receipt, it does not browse — the cashier may be in a
   * folder for another job and must find it as they left it (2026-11-20).
   */
  lookupBarcode: (code: string) => Promise<CatalogItem[]>;
  /** Re-read the current view (after a sale changed stock, say). */
  refresh: () => Promise<void>;
  /** On the home screen: which one and its heading. Null anywhere else. */
  home: { kind: TillHomeKind; title: string } | null;
  /**
   * «Усі товари» — present only when the home screen is not already every
   * product (something is ticked or has sold), so the bar draws the chip.
   */
  showAll: (() => void) | null;
  /** The list holds a further page of cards (`loadMore`). */
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function useSalesCatalog(options: SalesCatalogOptions = {}): SalesCatalog {
  const homeOn = options.home === true;
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
  /** At the root: the home screen or «Усі товари». */
  const [rootView, setRootView] = useState<'home' | 'all'>('home');
  const [homeKind, setHomeKind] = useState<TillHomeKind | 'none' | null>(homeOn ? lastHomeKind : null);
  const [hasMore, setHasMore] = useState(false);
  /** Cards loaded so far — a re-read after a sale keeps every page shown. */
  const cardsLoaded = useRef(0);

  const currentTag = tagPath[tagPath.length - 1] ?? null;
  const flatTags = useMemo(() => flattenTags(tags), [tags]);
  /** The home screen is something other than every product. */
  const homeDiffers = homeOn && (homeKind === 'marked' || homeKind === 'popular');
  const atRoot = !query.trim() && !currentTag;
  const onHome = homeOn && atRoot && rootView === 'home';

  const catalogBarTags = useMemo(
    () => flatTags.filter((t) => t.show_in_catalog_bar).sort((a, b) => a.sort_order - b.sort_order),
    [flatTags]
  );

  // Only the newest request may fill the grid. Keys typed into the search box
  // fire a fetch each (a scanner's burst into a focused box included, before
  // the wedge gives the box its text back), and the answers are not ordered:
  // a late one for a half-typed code used to land after the restore and leave
  // the grid filtered by it.
  const requestSeq = useRef(0);
  /** No read starts after the screen is gone (the home screen's fallback is a second one). */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const loadCatalog = useCallback(
    async (opts?: { q?: string; tag_id?: number; limit?: number; offset?: number }, append = false) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const items = await cashierApi.getCatalog({ ...opts, searchKeys });
        if (seq === requestSeq.current) {
          setCatalog((prev) => (append ? [...prev, ...items] : items));
          const cards = countCards(items);
          cardsLoaded.current = (append ? cardsLoaded.current : 0) + cards;
          setHasMore(opts?.limit != null && cards >= opts.limit);
        }
        return items;
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [searchKeys]
  );

  /**
   * The home screen: the ticked cards, else the sellers, else — nothing
   * ticked, nothing sold — every product, as a till without one shows.
   */
  const loadHome = useCallback(async (keep = false) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const picked = pickTillHome(await cashierApi.getCatalog({ home: true, searchKeys }));
      if (seq !== requestSeq.current || !mounted.current) return;
      lastHomeKind = picked?.kind ?? 'none';
      setHomeKind(lastHomeKind);
      if (picked) {
        setCatalog(picked.items);
        cardsLoaded.current = countCards(picked.items);
        setHasMore(false);
        return;
      }
      const limit = keep ? Math.max(CATALOG_PAGE, cardsLoaded.current) : CATALOG_PAGE;
      const all = await cashierApi.getCatalog({ limit, searchKeys });
      if (seq !== requestSeq.current) return;
      setCatalog(all);
      cardsLoaded.current = countCards(all);
      setHasMore(countCards(all) >= limit);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [searchKeys]);

  /**
   * The fetch for whatever the screen is currently showing. `keep` re-reads as
   * many cards as are on screen, so a sale does not fold «Показати ще» back.
   */
  const loadCurrent = useCallback(
    (keep = false) => {
      if (onHome) return loadHome(keep);
      // A catalog without a home screen reads as it always did (the server's
      // old cap online, everything offline).
      const page = homeOn ? { limit: keep ? Math.max(CATALOG_PAGE, cardsLoaded.current) : CATALOG_PAGE } : {};
      if (query.trim()) return loadCatalog({ q: query, ...page });
      if (currentTag) return loadCatalog({ tag_id: currentTag.id, ...page });
      return loadCatalog(page);
    },
    [onHome, loadHome, homeOn, query, currentTag, loadCatalog]
  );

  const loadMore = useCallback(async () => {
    // The home screen proper is whole; one that is every product pages.
    if (!homeOn || (onHome && homeKind !== 'none')) return;
    const page = { limit: CATALOG_PAGE, offset: cardsLoaded.current };
    if (query.trim()) await loadCatalog({ q: query, ...page }, true);
    else if (currentTag) await loadCatalog({ tag_id: currentTag.id, ...page }, true);
    else await loadCatalog(page, true);
  }, [homeOn, onHome, homeKind, query, currentTag, loadCatalog]);

  useEffect(() => {
    void cashierApi.getTags().then(setTags);
  }, []);

  // A failed read leaves the grid as it was: the till keeps selling from what
  // it shows, and the next tap or sale reads again.
  useEffect(() => {
    void loadCurrent().catch(() => undefined);
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
      if (!tag) {
        // The root chip: the home screen where there is one.
        setRootView('home');
        return setTagPath([]);
      }
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

  const showAll = useCallback(() => {
    setQuery('');
    setTagPath([]);
    setRootView('all');
  }, []);

  const goBackOne = useCallback(() => {
    setQuery('');
    setTagPath((prev) => prev.slice(0, -1));
  }, []);

  // Not `loadCatalog`: that fills the grid, and a scan must leave the grid
  // (and the folder tiles over it, and the search) exactly as the cashier
  // had them. Until 2026-11-20 the grid became the scanned product alone and
  // came back only when a folder was entered again.
  const lookupBarcode = useCallback(
    (code: string) => cashierApi.getCatalog({ barcode: code.trim(), searchKeys }),
    [searchKeys]
  );

  const showBack = needsBackNav(tagPath);
  const rootLabel = homeDiffers && rootView === 'home' ? 'Головна' : 'Усі товари';
  const rootActive: 'home' | 'all' = homeDiffers && rootView === 'home' ? 'home' : 'all';

  return {
    grouped,
    folderTiles,
    catalogBarTags,
    catalogBarActiveId:
      !showBack && currentTag?.show_in_catalog_bar ? currentTag.id : !currentTag ? rootActive : null,
    loading,
    query,
    setQuery,
    showBack,
    backLabel: tagPath.length <= 1 ? rootLabel : (tagPath[tagPath.length - 2]?.name ?? rootLabel),
    enterTag,
    selectCatalogBarTag,
    goBackOne,
    lookupBarcode,
    refresh: async () => {
      await loadCurrent(true);
    },
    home:
      onHome && (homeKind === 'marked' || homeKind === 'popular')
        ? { kind: homeKind, title: TILL_HOME_TITLE[homeKind] }
        : null,
    showAll: homeDiffers ? showAll : null,
    hasMore: hasMore && (!onHome || homeKind === 'none'),
    loadMore,
  };
}
