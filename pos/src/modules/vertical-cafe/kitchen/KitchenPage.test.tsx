// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Кухня» end to end inside the module: two columns, two taps, the day's
// stop-list, and «Потрібна мережа» when there is none.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { CatalogItem } from '../../../types';

const CAFE = {
  id: 'cafe',
  title: 'Кафе',
  attributes: [],
  units: ['шт', 'г', 'мл'],
  defaultUnit: 'шт',
  maxCompositionDepth: 3,
};
const CLOTHING = { id: 'clothing', title: 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };

let verticalId: 'cafe' | 'clothing' = 'cafe';
let status: 'new' | 'ready' | 'served' = 'new';
let stopped = false;
const posRequest = vi.fn();
const refreshCatalog = vi.fn();

const MENU: CatalogItem[] = [
  {
    variant_id: 1,
    product_id: 1,
    product_name: 'Латте',
    attributes: {},
    label: 'M',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 6500,
    quantity: 10,
    image_url: null,
    stop_listed: false,
    stop_listed_on: null,
  },
  {
    variant_id: 2,
    product_id: 2,
    product_name: 'Сирник',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 6500,
    quantity: 0,
    image_url: null,
    stop_listed: false,
    stop_listed_on: null,
  },
];

function orderOf(prep: 'new' | 'ready') {
  return {
    id: 7,
    order_no: 42,
    receipt_number: 'R-00042',
    prep_status: prep,
    created_at: new Date(Date.now() - 90_000).toISOString(),
    ready_at: prep === 'ready' ? new Date().toISOString() : null,
    staff_name: 'Марта',
    note: 'з собою',
    items: [
      {
        id: 70,
        product_name: 'Латте',
        variant_label: 'M · вівсяне',
        quantity: 2,
        modifiers: [{ group_name: 'Молоко', name: 'вівсяне' }],
        note: 'гарячіше',
        stations: ['bar'],
      },
      { id: 71, product_name: 'Круасан', variant_label: '', quantity: 1, modifiers: [], note: '', stations: ['kitchen'] },
    ],
  };
}

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => (verticalId === 'cafe' ? CAFE : CLOTHING),
    api: { posRequest: (...a: unknown[]) => posRequest(...a) },
    cashierApi: { refreshCatalog: () => refreshCatalog() },
  };
});

const { default: KitchenPage } = await import('./KitchenPage');
const { useOfflineStatus } = await import('@pos/platform');

beforeEach(() => {
  verticalId = 'cafe';
  status = 'new';
  stopped = false;
  useOfflineStatus.setState({ online: true });
  posRequest.mockImplementation(async (method: string, path: string, body?: { prep_status?: string; stop_listed?: boolean }) => {
    if (method === 'get' && path === '/kitchen/orders') {
      return { orders: status === 'served' ? [] : [orderOf(status)], now: new Date().toISOString() };
    }
    if (method === 'patch' && path === '/sales/7/prep') {
      if (body?.prep_status === 'served' && status === 'new') {
        throw { response: { data: { error: 'Спершу натисніть „Готово“' } } };
      }
      status = body!.prep_status as 'ready' | 'served';
      return { id: 7, prep_status: status, ready_at: 'x', served_at: null };
    }
    if (method === 'get' && path === '/catalog') {
      return MENU.map((m) => (m.product_id === 2 ? { ...m, stop_listed: stopped } : m));
    }
    if (method === 'post' && path === '/kitchen/stop-list/2') {
      stopped = Boolean(body?.stop_listed);
      return { product_id: 2, stop_listed: stopped, stop_listed_on: stopped ? '2026-09-20' : null };
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('KitchenPage', () => {
  it('asks for the network before anything else, and reads nothing without it', () => {
    useOfflineStatus.setState({ online: false });
    renderWithProviders(<KitchenPage />);
    expect(screen.getByTestId('kitchen-offline')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('is not for a boutique', () => {
    verticalId = 'clothing';
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText(/не на вертикалі кафе/)).toBeInTheDocument();
  });

  it('draws the order under «В роботі» with its number, lines, answers, note and station', async () => {
    renderWithProviders(<KitchenPage />);
    const card = await screen.findByTestId('kitchen-order-sale-7');
    expect(within(screen.getByTestId('kitchen-in-work')).getByTestId('kitchen-order-sale-7')).toBe(card);
    expect(within(card).getByTestId('kitchen-order-no')).toHaveTextContent('42');
    expect(card).toHaveTextContent('2×Латте');
    // The caption already carries the answer («M · вівсяне»): once, not twice.
    expect(card).toHaveTextContent('Латте M · вівсяне');
    expect((card.textContent ?? '').match(/вівсяне/g)).toHaveLength(1);
    expect(card).toHaveTextContent('гарячіше');
    expect(card).toHaveTextContent('Замовлення: з собою');
    expect(card).toHaveTextContent('бар');
    expect(card).toHaveTextContent('кухня');
    expect(within(card).getByTestId('kitchen-wait')).toHaveTextContent(/^1:3\d$/);
    expect(within(screen.getByTestId('kitchen-pickup')).getByText('Нічого не чекає видачі')).toBeInTheDocument();
  });

  it('takes two taps: «Готово» moves the card to «Видача», «Видано» takes it off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KitchenPage />);
    await screen.findByTestId('kitchen-order-sale-7');

    await user.click(screen.getByTestId('kitchen-ready-sale-7'));
    expect(posRequest).toHaveBeenCalledWith('patch', '/sales/7/prep', { prep_status: 'ready' });
    await waitFor(() =>
      expect(within(screen.getByTestId('kitchen-pickup')).getByTestId('kitchen-order-sale-7')).toBeInTheDocument()
    );
    expect(within(screen.getByTestId('kitchen-in-work')).getByText('Замовлень немає')).toBeInTheDocument();

    await user.click(screen.getByTestId('kitchen-served-sale-7'));
    expect(posRequest).toHaveBeenCalledWith('patch', '/sales/7/prep', { prep_status: 'served' });
    await waitFor(() => expect(screen.queryByTestId('kitchen-order-sale-7')).toBeNull());
  });

  it("shows the server's words when a tap is refused", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KitchenPage />);
    await screen.findByTestId('kitchen-order-sale-7');
    // The other screen's card is stale: the board thinks it is ready, the server does not.
    status = 'new';
    posRequest.mockImplementationOnce(async () => {
      throw { response: { data: { error: 'Спершу натисніть „Готово“' } } };
    });
    await user.click(screen.getByTestId('kitchen-ready-sale-7'));
    expect(await screen.findByTestId('kitchen-banner')).toHaveTextContent('Спершу натисніть „Готово“');
  });

  it('pulls a dish for the day from the «Стоп-лист» tab and asks the host to re-read its catalog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<KitchenPage />);
    await user.click(screen.getByTestId('kitchen-tab-stop'));
    const row = await screen.findByTestId('stop-list-2');
    expect(row).toHaveTextContent('Сирник');
    expect(row).toHaveTextContent('немає — закінчилось');
    const toggle = within(row).getByTestId('stop-list-toggle-2');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    expect(posRequest).toHaveBeenCalledWith('post', '/kitchen/stop-list/2', { stop_listed: true });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(toggle).toHaveTextContent('Стоп');
    expect(refreshCatalog).toHaveBeenCalledTimes(1);

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByTestId('stop-list-1')).toHaveTextContent('Латте');
  });
});
