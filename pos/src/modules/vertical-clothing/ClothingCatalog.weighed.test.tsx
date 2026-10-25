// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The fallback catalog and weighed goods (TechDocs/grocery/G4_WEIGHED.md): a
// grocery store whose own catalog failed still sells cheese by the kilogram —
// the tile names its price per kilogram, stays sellable at zero stock, and a
// tap opens the weight pad rather than ringing «1».

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCatalogItem } from '../../test/utils';
import type { CatalogItem } from '../../types';

const rows: CatalogItem[] = [];
const lookupBarcode = vi.fn(async (): Promise<CatalogItem[]> => []);

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
      query: '',
      setQuery: () => undefined,
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
const { ClothingCatalog } = await import('./ClothingCatalog');

const cheese = makeCatalogItem({
  variant_id: 70,
  product_id: 7,
  product_name: 'Сир твердий',
  label: 'Гауда',
  attributes: {},
  unit: 'г',
  price_cents: 18990,
  price_per: 1000,
  quantity: 0,
  barcode: '2900000000070',
});
const bread = makeCatalogItem({ variant_id: 71, product_id: 8, product_name: 'Хліб', label: '', quantity: 0, price_cents: 4590 });

beforeEach(() => {
  rows.splice(0, rows.length, cheese, bread);
  useCartStore.getState().clear();
});

describe('the fallback catalog with weighed goods', () => {
  it('prices a weighed tile per kilogram and keeps it sellable at zero stock', () => {
    render(<ClothingCatalog active stockEpoch={0} />);
    const cheeseTile = screen.getByRole('button', { name: /Сир твердий/ });
    expect(within(cheeseTile).getByText('189,90 ₴/кг')).toBeInTheDocument();
    expect(cheeseTile).toBeEnabled();
    expect(within(cheeseTile).queryByText('немає')).toBeNull();
    // A loaf at zero is still sold out, as before.
    expect(screen.getByRole('button', { name: /Хліб/ })).toBeDisabled();
  });

  it('opens the weight pad on a tap and rings the weighing as its own line', async () => {
    const user = userEvent.setup();
    render(<ClothingCatalog active stockEpoch={0} />);
    await user.click(screen.getByRole('button', { name: /Сир твердий/ }));
    expect(screen.getByTestId('weight-pad')).toBeInTheDocument();
    for (const k of ['0', 'comma', '3', '5']) await user.click(screen.getByTestId(`weight-pad-key-${k}`));
    await user.click(screen.getByTestId('weight-pad-confirm'));

    expect(screen.queryByTestId('weight-pad')).toBeNull();
    const [line] = useCartStore.getState().lines;
    expect(line).toMatchObject({ variant_id: 70, quantity: 350, price_per: 1000, weight_source: 'manual' });
    expect(useCartStore.getState().subtotalCents()).toBe(6647);
  });

  it('asks the weight of a scanned weighed variant too', async () => {
    lookupBarcode.mockResolvedValueOnce([cheese]);
    const user = userEvent.setup();
    render(<ClothingCatalog active stockEpoch={0} />);
    // A scanner is a burst of keys ending in Enter, read by the wedge.
    await user.keyboard('2900000000070{Enter}');
    expect(await screen.findByTestId('weight-pad')).toBeInTheDocument();
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});
