// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The café's sell screen and the scanner. Reported 2026-11-20: a scan replaced
// the tiles with the scanned product and wiped the barista's search; a scan
// only rings now, and the screen stays as it was.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCatalogItem } from '@host/test/utils';
import type { CatalogItem } from '@host/types';

const rows: CatalogItem[] = [];
const lookupBarcode = vi.fn(async (_code: string): Promise<CatalogItem[]> => []);
const setQuery = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  function useSalesCatalog() {
    const map = new Map<number, CatalogItem[]>();
    for (const it of rows) map.set(it.product_id, [...(map.get(it.product_id) ?? []), it]);
    return {
      grouped: [...map.entries()],
      folderTiles: [],
      catalogBarTags: [],
      catalogBarActiveId: 'all' as const,
      loading: false,
      query: 'ла',
      setQuery,
      showBack: false,
      backLabel: 'Усі товари',
      enterTag: () => undefined,
      selectCatalogBarTag: () => undefined,
      goBackOne: () => undefined,
      lookupBarcode,
      refresh: async () => undefined,
    };
  }
  return { ...real, useSalesCatalog };
});

const { useCartStore } = await import('@pos/platform');
const { default: CafeCatalog } = await import('./CafeCatalog');

const latte = makeCatalogItem({ variant_id: 5, product_id: 1, product_name: 'Лате', label: '', attributes: {}, barcode: '2900000000057' });
const water = makeCatalogItem({ variant_id: 6, product_id: 2, product_name: 'Вода', label: '', attributes: {}, barcode: '4820000000061' });

beforeEach(() => {
  rows.splice(0, rows.length, latte);
  lookupBarcode.mockReset();
  setQuery.mockClear();
  useCartStore.getState().clear();
  useCartStore.getState().setTileMarks('remote-kitchen', null);
});

describe('the café catalog and the scanner', () => {
  it('rings a scanned bottle and leaves the tiles and the search where they were', async () => {
    lookupBarcode.mockResolvedValueOnce([water]);
    const user = userEvent.setup();
    render(<CafeCatalog active stockEpoch={0} />);
    expect(screen.getByRole('button', { name: /Лате/ })).toBeInTheDocument();

    await user.keyboard('4820000000061{Enter}');
    await vi.waitFor(() => expect(useCartStore.getState().lines).toHaveLength(1));
    expect(useCartStore.getState().lines[0]).toMatchObject({ variant_id: 6 });
    expect(lookupBarcode).toHaveBeenCalledWith('4820000000061');

    // The barista's half-typed search is not wiped, and the grid is not the bottle.
    expect(setQuery).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Лате/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Вода/ })).toBeNull();
  });

  it('draws another module’s word on a tile, and greys a dish that cannot be sold now', async () => {
    const pizza = makeCatalogItem({ variant_id: 7, product_id: 3, product_name: 'Маргарита', label: '', attributes: {} });
    rows.splice(0, rows.length, latte, pizza);
    useCartStore.getState().setTileMarks('remote-kitchen', { 7: { text: '≈30 хв', blocked: false } });
    const user = userEvent.setup();
    render(<CafeCatalog active stockEpoch={0} />);
    const tile = screen.getByRole('button', { name: /Маргарита/ });
    expect(tile).toHaveTextContent('≈30 хв');
    expect(tile).toBeEnabled();
    expect(screen.getByRole('button', { name: /Лате/ })).not.toHaveTextContent('хв');

    useCartStore.getState().setTileMarks('remote-kitchen', { 7: { text: 'пауза', blocked: true } });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Маргарита/ })).toBeDisabled());
    expect(screen.getByRole('button', { name: /Маргарита/ })).toHaveTextContent('пауза');
    await user.click(screen.getByRole('button', { name: /Маргарита/ }));
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});
