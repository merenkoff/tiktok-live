// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The florist's sell screen and the scanner. Reported 2026-11-20: a scan
// replaced the tiles with the scanned product and wiped the search; a scan
// only rings now, and the screen stays as it was.

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
      query: 'тро',
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

const { useAuthStore, useCartStore } = await import('@pos/platform');
const { default: FlowersCatalog } = await import('./FlowersCatalog');

const rose = makeCatalogItem({
  variant_id: 5,
  product_id: 1,
  product_name: 'Троянда',
  label: 'Червона · 60 см',
  attributes: { color: 'Червона', length: '60' },
  barcode: '2900000000057',
});
const ribbon = makeCatalogItem({
  variant_id: 6,
  product_id: 2,
  product_name: 'Стрічка',
  label: 'Атласна',
  attributes: { color: 'Атласна' },
  barcode: '4820000000061',
});

beforeEach(() => {
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
  rows.splice(0, rows.length, rose);
  lookupBarcode.mockReset();
  setQuery.mockClear();
  useCartStore.getState().clear();
});

describe('the florist’s catalog and the scanner', () => {
  it('rings a scanned stem and leaves the tiles and the search where they were', async () => {
    lookupBarcode.mockResolvedValueOnce([ribbon]);
    const user = userEvent.setup();
    render(<FlowersCatalog active stockEpoch={0} />);
    expect(await screen.findByRole('button', { name: /Троянда/ })).toBeInTheDocument();

    await user.keyboard('4820000000061{Enter}');
    await vi.waitFor(() => expect(useCartStore.getState().lines).toHaveLength(1));
    expect(useCartStore.getState().lines[0]).toMatchObject({ variant_id: 6 });
    expect(lookupBarcode).toHaveBeenCalledWith('4820000000061');

    expect(setQuery).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Троянда/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Стрічка/ })).toBeNull();
  });
});
