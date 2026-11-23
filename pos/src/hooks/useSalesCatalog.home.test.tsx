// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's home screen (migration 112, TechDocs/POS_CLOTHING.md «Головна
// каси й швидкість фото»): the root shows the cards the owner ticked, else the
// best sellers, else every product — and «Усі товари» pages its cards. A
// catalog that does not ask for the home screen reads exactly as before.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, makeCatalogItem, makeTag } from '../test/utils';
import { cashierApi } from '../offline/cashierApi';
import { useAuthStore } from './useAuth';
import { CATALOG_PAGE, forgetTillHomeForTests, useSalesCatalog } from './useSalesCatalog';
import type { CatalogItem } from '../types';

const card = (id: number, over: Partial<CatalogItem> = {}) =>
  makeCatalogItem({ variant_id: id * 10, product_id: id, product_name: `Товар ${id}`, ...over });

const bodi = card(1, { popular_rank: 2 });
const kofta = card(2, { till_home: true });
const shapka = card(3, { popular_rank: 1 });
const sukna = card(4);

beforeEach(() => {
  forgetTillHomeForTests();
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
  vi.spyOn(cashierApi, 'getTags').mockResolvedValue([makeTag({ id: 1, name: 'Дівчатам', show_in_catalog_bar: false })]);
});

afterEach(() => vi.restoreAllMocks());

/** A catalogue of `n` cards answered by page, the home rows answered whole. */
function serve(all: CatalogItem[]) {
  return vi.spyOn(cashierApi, 'getCatalog').mockImplementation(async (opts) => {
    if (opts?.home) return all.filter((r) => r.till_home || r.popular_rank != null);
    if (opts?.limit != null) return all.slice(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit);
    return all;
  });
}

describe('useSalesCatalog — the home screen', () => {
  it('shows the ticked cards under «На головній», with «Усі товари» beside it', async () => {
    serve([bodi, kofta, shapka, sukna]);
    const { result } = renderHook(() => useSalesCatalog({ home: true }));
    await waitFor(() => expect(result.current.home?.kind).toBe('marked'));
    expect(result.current.home?.title).toBe('На головній');
    expect(result.current.grouped.map(([id]) => id)).toEqual([2]);
    expect(result.current.catalogBarActiveId).toBe('home');
    expect(result.current.folderTiles).toHaveLength(1);
    expect(result.current.showAll).not.toBeNull();

    act(() => result.current.showAll?.());
    await waitFor(() => expect(result.current.grouped).toHaveLength(4));
    expect(result.current.home).toBeNull();
    expect(result.current.catalogBarActiveId).toBe('all');

    // The root chip brings the home screen back.
    act(() => result.current.selectCatalogBarTag(null));
    await waitFor(() => expect(result.current.home?.kind).toBe('marked'));
  });

  it('shows the best sellers by rank while nothing is ticked', async () => {
    serve([bodi, shapka, sukna]);
    const { result } = renderHook(() => useSalesCatalog({ home: true }));
    await waitFor(() => expect(result.current.home?.kind).toBe('popular'));
    expect(result.current.home?.title).toBe('Часто продають');
    expect(result.current.grouped.map(([id]) => id)).toEqual([3, 1]);
  });

  it('shows every product, one root chip, when nothing is ticked and nothing has sold', async () => {
    serve([card(1), card(2)]);
    const { result } = renderHook(() => useSalesCatalog({ home: true }));
    await waitFor(() => expect(result.current.grouped).toHaveLength(2));
    expect(result.current.home).toBeNull();
    expect(result.current.showAll).toBeNull();
    expect(result.current.catalogBarActiveId).toBe('all');
    expect(result.current.backLabel).toBe('Усі товари');
  });

  it('pages «Усі товари» by cards and keeps every page through a re-read', async () => {
    const all = Array.from({ length: CATALOG_PAGE + 5 }, (_, i) => card(i + 1));
    all[0] = { ...all[0], till_home: true };
    const getCatalog = serve(all);
    const { result } = renderHook(() => useSalesCatalog({ home: true }));
    await waitFor(() => expect(result.current.home?.kind).toBe('marked'));
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.showAll?.());
    await waitFor(() => expect(result.current.grouped).toHaveLength(CATALOG_PAGE));
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    expect(result.current.grouped).toHaveLength(CATALOG_PAGE + 5);
    expect(result.current.hasMore).toBe(false);
    expect(getCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ limit: CATALOG_PAGE, offset: CATALOG_PAGE }));

    // A sale re-reads the view: both pages, in one read.
    await act(async () => result.current.refresh());
    expect(result.current.grouped).toHaveLength(CATALOG_PAGE + 5);
    expect(getCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ limit: CATALOG_PAGE + 5 }));
  });

  it('searches every product from the home screen', async () => {
    const getCatalog = serve([bodi, kofta, shapka, sukna]);
    const { result } = renderHook(() => useSalesCatalog({ home: true }));
    await waitFor(() => expect(result.current.home?.kind).toBe('marked'));
    act(() => result.current.setQuery('Товар'));
    await waitFor(() => expect(result.current.grouped).toHaveLength(4));
    expect(result.current.home).toBeNull();
    expect(getCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Товар', limit: CATALOG_PAGE }));
  });

  it('reads as before for a catalog that does not ask for it', async () => {
    const getCatalog = serve([bodi, kofta, shapka, sukna]);
    const { result } = renderHook(() => useSalesCatalog());
    await waitFor(() => expect(result.current.grouped).toHaveLength(4));
    expect(result.current.home).toBeNull();
    expect(result.current.showAll).toBeNull();
    expect(result.current.hasMore).toBe(false);
    for (const [opts] of getCatalog.mock.calls) {
      expect(opts?.home).toBeUndefined();
      expect(opts?.limit).toBeUndefined();
    }
  });
});
