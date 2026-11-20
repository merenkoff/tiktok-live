// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The browsing half of the sell screen. Reported 2026-11-20: a scan replaced
// the grid with the scanned product until the cashier entered a folder again —
// `lookupBarcode` filled the grid like a search. It is a pure lookup now, and a
// late answer to an older search can no longer overwrite a newer one.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, makeCatalogItem, makeTag } from '../test/utils';
import { cashierApi } from '../offline/cashierApi';
import { useAuthStore } from './useAuth';
import { useSalesCatalog } from './useSalesCatalog';
import type { CatalogItem } from '../types';

const jeans = makeCatalogItem({ variant_id: 7, product_id: 3, product_name: 'Джинси', barcode: '4820002000213' });
const shirt = makeCatalogItem({ variant_id: 8, product_id: 4, product_name: 'Сорочка', barcode: '4820002000220' });
const socks = makeCatalogItem({ variant_id: 9, product_id: 5, product_name: 'Шкарпетки', barcode: '4820002000237' });

type Pending = { opts: Parameters<typeof cashierApi.getCatalog>[0]; resolve: (items: CatalogItem[]) => void };

beforeEach(() => {
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
  vi.spyOn(cashierApi, 'getTags').mockResolvedValue([makeTag({ id: 1, name: 'Одяг', show_in_catalog_bar: false })]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSalesCatalog', () => {
  it('looks a barcode up without touching the grid, the folder or the search', async () => {
    const getCatalog = vi.spyOn(cashierApi, 'getCatalog').mockImplementation(async (opts) => {
      if (opts?.barcode) return [socks].filter((i) => i.barcode === opts.barcode);
      if (opts?.tag_id === 1) return [jeans, shirt];
      return [jeans, shirt, socks];
    });
    const { result } = renderHook(() => useSalesCatalog());
    await waitFor(() => expect(result.current.folderTiles).toHaveLength(1));
    act(() => result.current.enterTag(result.current.folderTiles[0]));
    await waitFor(() => expect(result.current.grouped.map(([id]) => id)).toEqual([3, 4]));
    const before = result.current.grouped;
    getCatalog.mockClear();

    let found: CatalogItem[] = [];
    await act(async () => {
      found = await result.current.lookupBarcode(' 4820002000237 ');
    });

    expect(found).toEqual([socks]);
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledWith({ barcode: '4820002000237', searchKeys: expect.any(Array) });
    // The folder is still open and shows exactly what it showed.
    expect(result.current.grouped).toBe(before);
    expect(result.current.showBack).toBe(true);
    expect(result.current.query).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('lets only the newest search fill the grid when answers arrive out of order', async () => {
    const pending: Pending[] = [];
    vi.spyOn(cashierApi, 'getCatalog').mockImplementation(
      (opts) => new Promise<CatalogItem[]>((resolve) => pending.push({ opts, resolve }))
    );
    const { result } = renderHook(() => useSalesCatalog());
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0].resolve([jeans, shirt, socks]));
    await waitFor(() => expect(result.current.grouped).toHaveLength(3));

    // «д», then «дж» — the first answer is slow and lands last.
    act(() => result.current.setQuery('д'));
    act(() => result.current.setQuery('дж'));
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[1].opts?.q).toBe('д');
    expect(pending[2].opts?.q).toBe('дж');

    act(() => pending[2].resolve([jeans]));
    await waitFor(() => expect(result.current.grouped.map(([id]) => id)).toEqual([3]));
    expect(result.current.loading).toBe(false);

    act(() => pending[1].resolve([jeans, shirt, socks]));
    await act(async () => {});
    expect(result.current.grouped.map(([id]) => id)).toEqual([3]);
  });
});
