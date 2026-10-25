// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The grocery's sell screen (TechDocs/grocery/G4_WEIGHED.md §6): packed goods
// ring as pieces, weighed ones through the weight pad, and a scan rings what
// it found without taking the tiles the cashier taps off the screen.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCatalogItem } from '../../test/utils';
import type { CatalogItem } from '../../types';

const rows: CatalogItem[] = [];
const lookupBarcode = vi.fn(async (): Promise<CatalogItem[]> => []);
const getCatalog = vi.fn(async (_opts?: { barcode?: string }): Promise<CatalogItem[]> => []);

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
  return { ...real, useSalesCatalog, cashierApi: { ...real.cashierApi, getCatalog } };
});

const { useCartStore } = await import('@pos/platform');
const { default: GroceryCatalog } = await import('./GroceryCatalog');

const gouda = makeCatalogItem({
  variant_id: 70,
  product_id: 7,
  product_name: 'Сир твердий',
  label: 'Гауда',
  attributes: { variety: 'Гауда' },
  unit: 'г',
  price_cents: 18990,
  compare_at_cents: 22990,
  price_per: 1000,
  quantity: 0,
  barcode: '2900000000070',
});
const dutch = makeCatalogItem({
  ...gouda,
  variant_id: 71,
  label: 'Голландський',
  attributes: { variety: 'Голландський' },
  price_cents: 21990,
  compare_at_cents: null,
  barcode: '2900000000087',
});
const milk = makeCatalogItem({
  variant_id: 80,
  product_id: 8,
  product_name: 'Молоко «Ферма»',
  label: '2,5 % · 900 г',
  attributes: { variety: '2,5 %', packaging: '900 г' },
  price_cents: 4690,
  quantity: 24,
  barcode: '4820003000012',
});
const loaf = makeCatalogItem({
  variant_id: 90,
  product_id: 9,
  product_name: 'Батон нарізний',
  label: '500 г',
  attributes: { packaging: '500 г' },
  price_cents: 2890,
  quantity: 0,
  barcode: '4820003000074',
});

async function typeWeight(user: ReturnType<typeof userEvent.setup>, keys: string[]) {
  for (const k of keys) await user.click(screen.getByTestId(`weight-pad-key-${k}`));
  await user.click(screen.getByTestId('weight-pad-confirm'));
}

beforeEach(() => {
  rows.splice(0, rows.length, gouda, dutch, milk, loaf);
  lookupBarcode.mockClear();
  getCatalog.mockReset();
  getCatalog.mockResolvedValue([]);
  useCartStore.getState().clear();
  useCartStore.setState({ banner: null });
});

describe('the grocery catalog', () => {
  it('prices a weighed card per kilogram with its markdown, and keeps it sellable at zero stock', () => {
    render(<GroceryCatalog active stockEpoch={0} />);
    const cheese = screen.getByTestId('grocery-tile-7');
    expect(within(cheese).getByText('189,90 ₴/кг')).toBeInTheDocument();
    expect(within(cheese).getByTestId('tile-old-price')).toHaveTextContent('229,90');
    expect(cheese).toBeEnabled();
    expect(within(cheese).queryByText('немає')).toBeNull();
    // A packed good at zero is sold out, as in any shop.
    expect(screen.getByTestId('grocery-tile-9')).toBeDisabled();
    expect(screen.getByTestId('grocery-tile-8')).toBeEnabled();
  });

  it('rings a packed good as a piece, and a second tap makes it two', async () => {
    const user = userEvent.setup();
    render(<GroceryCatalog active stockEpoch={0} />);
    await user.click(screen.getByTestId('grocery-tile-8'));
    await user.click(screen.getByTestId('grocery-tile-8'));
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ variant_id: 80, quantity: 2 });
    expect(screen.queryByTestId('weight-pad')).toBeNull();
  });

  it('asks the variety first, then the weight, and rings the weighing as its own line', async () => {
    const user = userEvent.setup();
    render(<GroceryCatalog active stockEpoch={0} />);
    await user.click(screen.getByTestId('grocery-tile-7'));
    await user.click(screen.getByRole('button', { name: /Голландський/ }));

    const pad = screen.getByTestId('weight-pad');
    expect(within(pad).getByText(/Голландський/)).toBeInTheDocument();
    await typeWeight(user, ['0', 'comma', '3', '5']);

    expect(screen.queryByTestId('weight-pad')).toBeNull();
    const [line] = useCartStore.getState().lines;
    expect(line).toMatchObject({ variant_id: 71, quantity: 350, price_per: 1000, weight_source: 'manual' });
    // 0,350 кг × 219,90 = 76,965 → 76,97: half a kopeck up, the server's rule.
    expect(useCartStore.getState().subtotalCents()).toBe(7697);
  });

  it('rings a scanned pack without asking, and leaves the tiles where they were', async () => {
    getCatalog.mockResolvedValueOnce([milk]);
    const user = userEvent.setup();
    render(<GroceryCatalog active stockEpoch={0} />);
    // A scanner is a burst of keys ending in Enter, read by the wedge.
    await user.keyboard('4820003000012{Enter}');

    await vi.waitFor(() => expect(useCartStore.getState().lines).toHaveLength(1));
    expect(getCatalog).toHaveBeenCalledWith({ barcode: '4820003000012' });
    // The hook's lookup would have replaced the grid with the scanned product.
    expect(lookupBarcode).not.toHaveBeenCalled();
    expect(screen.getByTestId('grocery-tile-7')).toBeInTheDocument();
    expect(screen.getByTestId('grocery-tile-9')).toBeInTheDocument();
  });

  it('opens the weight pad for a scanned price tag of a weighed good', async () => {
    getCatalog.mockResolvedValueOnce([gouda]);
    const user = userEvent.setup();
    render(<GroceryCatalog active stockEpoch={0} />);
    await user.keyboard('2900000000070{Enter}');

    expect(await screen.findByTestId('weight-pad')).toBeInTheDocument();
    expect(useCartStore.getState().lines).toHaveLength(0);
    await typeWeight(user, ['1', 'comma', '2']);
    expect(useCartStore.getState().lines[0]).toMatchObject({ variant_id: 70, quantity: 1200 });
  });

  it('offers a choice when one code names several goods', async () => {
    getCatalog.mockResolvedValueOnce([gouda, dutch]);
    const user = userEvent.setup();
    render(<GroceryCatalog active stockEpoch={0} />);
    await user.keyboard('2900000000070{Enter}');
    expect(await screen.findByRole('button', { name: /Голландський/ })).toBeInTheDocument();
  });

  it('says so when a code is unknown, and when the lookup itself fails', async () => {
    const user = userEvent.setup();
    render(<GroceryCatalog active stockEpoch={0} />);
    await user.keyboard('4820000000000{Enter}');
    await vi.waitFor(() => expect(useCartStore.getState().banner).toBe('Штрихкод не знайдено'));

    getCatalog.mockRejectedValueOnce(new Error('network down'));
    await user.keyboard('4820003000012{Enter}');
    await vi.waitFor(() =>
      expect(useCartStore.getState().banner).toBe('Не вдалося знайти штрихкод — спробуйте ще раз')
    );
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('takes no scans while it is covered', async () => {
    getCatalog.mockResolvedValue([milk]);
    const user = userEvent.setup();
    render(<GroceryCatalog active={false} stockEpoch={0} />);
    await user.keyboard('4820003000012{Enter}');
    expect(getCatalog).not.toHaveBeenCalled();
  });
});
