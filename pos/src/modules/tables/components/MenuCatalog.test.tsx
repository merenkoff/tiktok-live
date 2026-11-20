// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill screen's menu and the scanner. Reported 2026-11-20: a scan replaced
// the tiles with the scanned dish — and, through `onRows`, the page's own
// grouping — and wiped the waiter's search; a scan only rings now.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, makeCatalogItem } from '@host/test/utils';
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
      query: 'бор',
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

const { useAuthStore } = await import('@pos/platform');
const { MenuCatalog } = await import('./MenuCatalog');

const borscht = makeCatalogItem({ variant_id: 5, product_id: 1, product_name: 'Борщ', label: '', attributes: {}, barcode: '2900000000057' });
const water = makeCatalogItem({ variant_id: 6, product_id: 2, product_name: 'Вода', label: '', attributes: {}, barcode: '4820000000061' });

beforeEach(() => {
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
  rows.splice(0, rows.length, borscht);
  lookupBarcode.mockReset();
  setQuery.mockClear();
});

describe('the bill’s menu and the scanner', () => {
  it('rings a scanned bottle and leaves the tiles, the search and the page’s rows where they were', async () => {
    lookupBarcode.mockResolvedValueOnce([water]);
    const onAdd = vi.fn();
    const onRows = vi.fn();
    const user = userEvent.setup();
    render(
      <MenuCatalog counts={new Map()} online active canScan epoch={0} onAdd={onAdd} onRows={onRows} />
    );
    expect(screen.getByTestId('menu-tile-1')).toBeInTheDocument();
    const rowsBefore = onRows.mock.calls.length;

    await user.keyboard('4820000000061{Enter}');
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toMatchObject({ item: { variant_id: 6 }, modifiers: [], note: '' });
    expect(lookupBarcode).toHaveBeenCalledWith('4820000000061');

    expect(setQuery).not.toHaveBeenCalled();
    expect(screen.getByTestId('menu-tile-1')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-tile-2')).toBeNull();
    // The rows the page maps its draft onto did not change either.
    expect(onRows).toHaveBeenCalledTimes(rowsBefore);
  });
});
