// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Керувати залишком» — the one-variant version of a stock document, and the
// screen where the purchase pack earns its keep (migration 054, phase К5b).
//
// What is pinned here is the rule the whole feature rests on: whatever the box
// counted in, BASE UNITS are what leaves the screen. A shop with no packs must
// see exactly what it saw before — no toggle, no hint, nothing added.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, renderWithProviders } from '../../../test/utils';
import { useAuthStore } from '../../../hooks/useAuth';
import type { OnHandRow, VerticalPublicConfig } from '../../../types';

const createStockDocument = vi.fn();
const addStockDocumentLine = vi.fn();
const postStockDocument = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      createStockDocument: (...a: unknown[]) => createStockDocument(...a),
      addStockDocumentLine: (...a: unknown[]) => addStockDocumentLine(...a),
      postStockDocument: (...a: unknown[]) => postStockDocument(...a),
    },
  };
});

const { ManageStockModal } = await import('./ManageStockModal');

function row(overrides: Partial<OnHandRow> = {}): OnHandRow {
  return {
    variant_id: 7,
    product_id: 3,
    product_name: 'Олія соняшникова',
    label: 'Олія',
    unit: 'мл',
    sku: null,
    barcode: null,
    quantity: 5000,
    cost_cents: 12,
    price_cents: 0,
    pack_qty: 1000,
    pack_label: 'пляшка',
    ...overrides,
  };
}

function open(r: OnHandRow) {
  return renderWithProviders(
    <ManageStockModal row={r} onClose={() => {}} onSaved={async () => {}} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ auth: null, isAuthenticated: false, bootstrapped: true });
  createStockDocument.mockResolvedValue({ id: 99 });
  addStockDocumentLine.mockResolvedValue({});
  postStockDocument.mockResolvedValue({});
});

/** A store whose vertical says what it may write stock off for (К5e). */
function signInWithReasons(writeoffReasons: VerticalPublicConfig['writeoffReasons']): void {
  useAuthStore.setState({
    auth: makeAuthResponse({
      store: {
        vertical: {
          id: 'cafe',
          title: 'Кафе',
          attributes: [],
          units: ['шт', 'г', 'мл'],
          defaultUnit: 'шт',
          maxCompositionDepth: 3,
          writeoffReasons,
        },
      },
    }),
    isAuthenticated: true,
    bootstrapped: true,
  });
}

describe('a variant with no pack', () => {
  it('looks exactly as it did — no toggle at all', async () => {
    open(row({ pack_qty: null, pack_label: '' }));
    await userEvent.click(screen.getByRole('button', { name: 'Прихід' }));
    expect(screen.queryByRole('button', { name: 'пляшка' })).not.toBeInTheDocument();
  });

  // Half a pair is not a half-configured variant, it is an unreadable one.
  it('ignores a pack the server could never have stored', () => {
    open(row({ pack_qty: 1000, pack_label: '' }));
    expect(screen.queryByRole('button', { name: 'мл' })).not.toBeInTheDocument();
  });
});

describe('a variant that arrives in bottles', () => {
  it('says how much is on the shelf in ITS unit, not «шт»', () => {
    open(row());
    expect(screen.getByText(/Зараз:/)).toHaveTextContent('Зараз: 5000 мл');
  });

  it('opens receiving in packs and counting in base units', async () => {
    open(row());
    // «Має бути» is where the modal starts: base units, because a correction
    // is about what is on the shelf.
    expect(screen.getByRole('button', { name: 'мл' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Прихід' }));
    expect(screen.getByRole('button', { name: 'пляшка' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('sends base units for what was typed in packs', async () => {
    open(row());
    await userEvent.click(screen.getByRole('button', { name: 'Прихід' }));

    const qty = screen.getByRole('spinbutton', { name: 'Скільки надійшло' });
    await userEvent.clear(qty);
    await userEvent.type(qty, '5');
    expect(screen.getByText('5 × пляшка = 5000 мл')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(addStockDocumentLine).toHaveBeenCalled());
    expect(addStockDocumentLine.mock.calls[0][1]).toMatchObject({
      variant_id: 7,
      quantity: 5000,
    });
  });

  // The trap the toggle creates: a clerk typing «5 пляшок» types the BOTTLE's
  // price next to it, and `unit_cost_cents` has only ever meant cents per base
  // unit. 120 ₴ a bottle is 12 kopecks a millilitre.
  it('reads the purchase price as the price of a pack', async () => {
    open(row());
    await userEvent.click(screen.getByRole('button', { name: 'Прихід' }));

    const cost = screen.getByRole('textbox', { name: /Ціна закупки за пляшка/ });
    await userEvent.clear(cost);
    await userEvent.type(cost, '120');

    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(addStockDocumentLine).toHaveBeenCalled());
    expect(addStockDocumentLine.mock.calls[0][1]).toMatchObject({ unit_cost_cents: 12 });
  });

  it('rescales the price when the box changes sides, so the caption never lies', async () => {
    open(row());
    await userEvent.click(screen.getByRole('button', { name: 'Прихід' }));
    // 12 kopecks per ml on the row → 120,00 ₴ for a 1000 ml bottle.
    expect(screen.getByRole('textbox', { name: /за пляшка/ })).toHaveValue('120.00');

    await userEvent.click(screen.getByRole('button', { name: 'мл' }));
    expect(screen.getByRole('textbox', { name: /за мл/ })).toHaveValue('0.12');
  });

  it('refuses a number of packs that is not a whole number of base units', async () => {
    open(row({ pack_qty: 3, pack_label: 'ящик', unit: 'шт' }));
    await userEvent.click(screen.getByRole('button', { name: 'Прихід' }));

    // Set outright rather than typed: a `type="number"` box in jsdom refuses
    // the intermediate «1.» a keystroke-by-keystroke type would go through.
    const qty = screen.getByRole('spinbutton', { name: 'Скільки надійшло' });
    fireEvent.change(qty, { target: { value: '1.5' } });

    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    expect(await screen.findByText(/склад рахується цілими/)).toBeInTheDocument();
    expect(addStockDocumentLine).not.toHaveBeenCalled();
  });
});

// К5e. The write-off vocabulary belongs to the store's VERTICAL: a kitchen
// throws food away for reasons a boutique has no word for, and each is its own
// line in the expense report — which is exactly why they are not «Інше» with a
// comment. The correction list is untouched: it is about counting.
describe('why stock is written off', () => {
  async function openWriteoff() {
    open(row());
    await userEvent.click(screen.getByRole('button', { name: 'Списання' }));
  }

  it('offers the generic four when the session carries no list', async () => {
    // A session cached by a build older than К5e, or a cold-offline one
    // rebuilt from such a row. Drawing no buttons would leave the screen
    // unable to write anything off at all.
    await openWriteoff();
    for (const label of ['Брак', 'Втрата', 'Подарунок', 'Інше']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Зіпсувалося' })).not.toBeInTheDocument();
  });

  it('offers exactly what the vertical sent, and opens on its first', async () => {
    signInWithReasons([
      { code: 'spoiled', label: 'Зіпсувалося' },
      { code: 'tasting', label: 'Проба' },
      { code: 'other', label: 'Інше' },
    ]);
    await openWriteoff();

    expect(screen.getByRole('button', { name: 'Зіпсувалося' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проба' })).toBeInTheDocument();
    // Not on this shop's list any more — the server would refuse it.
    expect(screen.queryByRole('button', { name: 'Подарунок' })).not.toBeInTheDocument();

    const qty = screen.getByRole('spinbutton', { name: 'Скільки списати' });
    fireEvent.change(qty, { target: { value: '200' } });
    await userEvent.click(screen.getByRole('button', { name: 'Провести' }));
    await waitFor(() => expect(createStockDocument).toHaveBeenCalled());
    // The first reason is what the screen opened on — a kitchen's commonest.
    expect(createStockDocument.mock.calls[0][0]).toMatchObject({
      type: 'writeoff',
      reason_code: 'spoiled',
    });
  });

  it('leaves the CORRECTION reasons alone — they are about counting', async () => {
    signInWithReasons([{ code: 'spoiled', label: 'Зіпсувалося' }]);
    open(row());
    // «Має бути» is where the modal starts.
    for (const label of ['Знайшли', 'Не вистачає', 'Помилка введення', 'Інше']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Зіпсувалося' })).not.toBeInTheDocument();
  });
});
