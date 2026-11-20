// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The scanner on the sell screen of a clothing shop, where it rings up most
// of the day. Reported 2026-10-19: after «Очистити чек» → «Очистити» the
// scanner did nothing until someone clicked into the search box — the hidden
// input it typed into had lost the focus and nothing gave it back.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, makeAuthResponse, makeCatalogItem, makeTag } from '../../test/utils';
import { cashierApi } from '../../offline/cashierApi';
import { api } from '../../services/api';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';

vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));

const jeans = makeCatalogItem({
  variant_id: 7,
  product_id: 3,
  product_name: 'Джинси slim',
  label: 'Синій / 28',
  barcode: '4820002000213',
});
const shirt = makeCatalogItem({ variant_id: 8, product_id: 4, product_name: 'Сорочка', barcode: '4820002000220' });

beforeEach(() => {
  const auth = makeAuthResponse();
  useAuthStore.setState({ auth, isAuthenticated: true });
  vi.spyOn(cashierApi, 'getTags').mockResolvedValue([]);
  vi.spyOn(cashierApi, 'getCatalog').mockImplementation(async (opts) => {
    if (opts?.barcode) return [jeans, shirt].filter((i) => i.barcode === opts.barcode);
    return [jeans, shirt];
  });
  vi.spyOn(api, 'listParkedCarts').mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  useCartStore.getState().clear();
  vi.restoreAllMocks();
});

function receiptLines(): string[] {
  return useCartStore.getState().lines.map((l) => l.product_name);
}

/** The catalog's tiles named so — a receipt row is a button with the same name, so the sidebar is left out. */
function tiles(name: RegExp): HTMLElement[] {
  return screen.queryAllByRole('button', { name }).filter((b) => !b.closest('[data-testid="sale-sidebar"]'));
}

/**
 * A scanner's burst into a focused text field: keydowns 4 ms apart, each
 * digit typed into the field unless the wedge stopped it, then Enter. Timed
 * by hand (jsdom stamps events with `Date.now()`), because a RegisterPage
 * render between two `user.keyboard` keys takes longer than the 60 ms a
 * scanner is allowed between keys — and a burst slower than that is typing.
 */
function scanInto(field: HTMLInputElement, code: string): void {
  let clock = Date.now() + 1000;
  for (const key of [...code, 'Enter']) {
    clock += 4;
    const event = new KeyboardEvent('keydown', {
      key,
      code: key === 'Enter' ? 'Enter' : `Digit${key}`,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'timeStamp', { value: clock });
    const proceed = field.dispatchEvent(event);
    if (proceed && key !== 'Enter') {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, field.value + key);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

describe('the scanner on the sell screen', () => {
  it('still rings up after «Очистити чек» → «Очистити»', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByText('Джинси slim');

    await user.keyboard('4820002000213{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Джинси slim']));

    await user.click(screen.getByRole('button', { name: 'Меню чека' }));
    await user.click(screen.getByRole('button', { name: 'Очистити кошик' }));
    const sheet = await screen.findByRole('alertdialog', { name: 'Очистити чек?' });
    await user.click(within(sheet).getByRole('button', { name: 'Очистити' }));
    expect(receiptLines()).toEqual([]);

    await user.keyboard('4820002000220{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Сорочка']));
  });

  it('does not ring up behind «Очистити чек?» while it is asked', async () => {
    const user = userEvent.setup();
    useCartStore.getState().addItem(jeans);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByText('Сорочка');

    await user.click(screen.getByRole('button', { name: 'Меню чека' }));
    await user.click(screen.getByRole('button', { name: 'Очистити кошик' }));
    await screen.findByRole('alertdialog', { name: 'Очистити чек?' });

    await user.keyboard('4820002000220{Enter}');
    // Nothing looked up: the question is still on screen and the receipt as it was.
    expect(cashierApi.getCatalog).not.toHaveBeenCalledWith(expect.objectContaining({ barcode: '4820002000220' }));
    expect(screen.getByRole('alertdialog', { name: 'Очистити чек?' })).toBeInTheDocument();
    expect(receiptLines()).toEqual(['Джинси slim']);
  });

  // Reported 2026-11-20: a scan left the grid showing the scanned product alone
  // until the cashier entered a folder again — and a cashier may be in a folder
  // for another job when the scanner rings something in passing.
  it('leaves the open folder and its tiles where they were after a scan', async () => {
    const user = userEvent.setup();
    const sweaters = makeCatalogItem({ variant_id: 9, product_id: 5, product_name: 'Світер', barcode: '4820002000237' });
    const folder = makeTag({ id: 10, name: 'Теплий одяг', show_in_catalog_bar: false });
    vi.mocked(cashierApi.getTags).mockResolvedValue([folder]);
    vi.mocked(cashierApi.getCatalog).mockImplementation(async (opts) => {
      if (opts?.barcode) return [jeans, shirt, sweaters].filter((i) => i.barcode === opts.barcode);
      if (opts?.tag_id === 10) return [sweaters];
      return [jeans, shirt, sweaters];
    });
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await user.click(await screen.findByRole('button', { name: /Теплий одяг/ }));
    await waitFor(() => expect(tiles(/Джинси slim/)).toHaveLength(0));
    expect(tiles(/Світер/)).toHaveLength(1);
    vi.mocked(cashierApi.getCatalog).mockClear();

    await user.keyboard('4820002000213{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Джинси slim']));

    // Still inside «Теплий одяг»: its tile is on screen, nothing else came in,
    // and the folder was not re-read (nothing changed to re-read it for).
    expect(tiles(/Світер/)).toHaveLength(1);
    expect(tiles(/Джинси slim/)).toHaveLength(0);
    // Inside the folder: its tile is not on the grid, «‹ Усі товари» leads back out.
    expect(tiles(/Теплий одяг/)).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /Усі товари/ })).toHaveLength(2);
    expect(cashierApi.getCatalog).toHaveBeenCalledTimes(1);
    expect(cashierApi.getCatalog).toHaveBeenCalledWith(expect.objectContaining({ barcode: '4820002000213' }));
  });

  it('keeps the search the cashier had typed, and its results, after a scan', async () => {
    const user = userEvent.setup();
    vi.mocked(cashierApi.getCatalog).mockImplementation(async (opts) => {
      if (opts?.barcode) return [jeans, shirt].filter((i) => i.barcode === opts.barcode);
      if (opts?.q) return [jeans, shirt].filter((i) => i.product_name.toLowerCase().includes(opts.q!.toLowerCase()));
      return [jeans, shirt];
    });
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByText('Джинси slim');
    const search = screen.getByPlaceholderText('Пошук або скан штрихкоду');
    await user.click(search);
    await user.type(search, 'дж', { delay: 150 });
    await waitFor(() => expect(tiles(/Сорочка/)).toHaveLength(0));

    scanInto(search, '4820002000220');
    await waitFor(() => expect(receiptLines()).toEqual(['Сорочка']));

    // The box says what the cashier typed and the grid is still that search.
    await waitFor(() => expect(search).toHaveValue('дж'));
    await waitFor(() => expect(tiles(/Сорочка/)).toHaveLength(0));
    expect(tiles(/Джинси slim/)).toHaveLength(1);
  });

  it('rings up the scanned item, not the tile that was tapped last', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await user.click(await screen.findByRole('button', { name: /Сорочка/ }));
    expect(receiptLines()).toEqual(['Сорочка']);

    // The tile keeps the focus after the tap; the scanner's Enter used to press it.
    await user.keyboard('4820002000213{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Сорочка', 'Джинси slim']));
  });
});
