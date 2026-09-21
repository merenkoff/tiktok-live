// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill screen end to end inside the module: what is owed stays apart from
// what is only typed, a dish that asks a question asks it, «На кухню» locks
// the round, and a refusal arrives in the server's own words.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Bill, BillLine, BillRound } from '../lib/types';

const posRequest = vi.fn();
const getCatalog = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { posRequest: (...a: unknown[]) => posRequest(...a) },
    cashierApi: { getCatalog: (...a: unknown[]) => getCatalog(...a) },
  };
});

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useParams: () => ({ billId: '90' }), useNavigate: () => vi.fn() };
});

const { BillPage } = await import('./BillPage');
const { useOfflineStatus } = await import('@pos/platform');

const line = (over: Partial<BillLine> = {}): BillLine => ({
  id: 1,
  variant_id: 5,
  quantity: 1,
  product_name: 'Латте',
  variant_label: 'M',
  unit: 'шт',
  unit_price_cents: null,
  compare_at_unit_cents: null,
  preview_unit_price_cents: 8000,
  components: null,
  modifiers: [],
  note: '',
  added_by: 1,
  added_by_name: 'Марта',
  sort_order: 0,
  ...over,
});

const round = (over: Partial<BillRound> = {}): BillRound => ({
  id: 7,
  seq: 1,
  fired_at: '2026-09-21T18:00:00.000Z',
  fired_by: 1,
  fired_by_name: 'Марта',
  prep_status: 'new',
  ready_at: null,
  served_at: null,
  cancelled_at: null,
  items: [line({ id: 2, variant_label: 'M · вівсяне', unit_price_cents: 8000 })],
  total_cents: 8000,
  ...over,
});

let bill: Bill;

// The café's own shape: a latte in two sizes with a required «Молоко», and a
// croissant that asks nothing at all.
const MILK = {
  id: 3,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  modifiers: [
    {
      id: 31,
      name: 'звичайне',
      price_delta_cents: 0,
      is_default: true,
      component_variant_id: null,
      component_quantity: null,
    },
    {
      id: 32,
      name: 'вівсяне',
      price_delta_cents: 1500,
      is_default: false,
      component_variant_id: null,
      component_quantity: null,
    },
  ],
};

const MENU = [
  {
    variant_id: 5,
    product_id: 1,
    product_name: 'Латте',
    attributes: { size: 'M' },
    label: 'M',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 6500,
    quantity: 10,
    image_url: null,
    modifier_groups: [MILK],
  },
  {
    variant_id: 6,
    product_id: 1,
    product_name: 'Латте',
    attributes: { size: 'L' },
    label: 'L',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 8500,
    quantity: 10,
    image_url: null,
    modifier_groups: [MILK],
  },
  {
    variant_id: 9,
    product_id: 2,
    product_name: 'Круасан',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 5500,
    quantity: 4,
    image_url: null,
    modifier_groups: [],
  },
];

beforeEach(() => {
  vi.useRealTimers();
  useOfflineStatus.setState({ online: true });
  bill = {
    id: 90,
    bill_no: 12,
    status: 'open',
    table_id: 11,
    table_name: '5',
    hall_id: 1,
    hall_name: 'Зала',
    guests: 4,
    note: null,
    customer_id: null,
    precheck_printed_at: null,
    opened_by: 1,
    opened_by_name: 'Марта',
    opened_at: '2026-09-21T18:00:00.000Z',
    closed_at: null,
    rounds: [round()],
    draft: [line({ id: 3, quantity: 2, product_name: 'Круасан', variant_label: '', preview_unit_price_cents: 5500 })],
    fired_total_cents: 8000,
    draft_preview_cents: 11000,
  };
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'get' && path === '/bills/90') return bill;
    throw new Error(`unexpected ${method} ${path}`);
  });
  getCatalog.mockReset();
  getCatalog.mockResolvedValue(MENU);
});

describe('BillPage', () => {
  it('keeps what is owed apart from what is only typed', async () => {
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    expect(await screen.findByTestId('bill-owed')).toHaveTextContent('80');
    // The draft is a second line, named so nobody reads it as money owed.
    expect(screen.getByTestId('bill-draft-total')).toHaveTextContent('110');
    expect(screen.getByTestId('bill-page')).toHaveTextContent('Стіл 5');
    expect(screen.getByTestId('bill-page')).toHaveTextContent('рахунок 12');
  });

  it('says «≈» as soon as one draft line cannot be priced', async () => {
    bill.draft.push(line({ id: 4, preview_unit_price_cents: null }));
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    expect(await screen.findByTestId('bill-draft-total')).toHaveTextContent('≈');
  });

  it('fires the draft once, with a client_uuid so a second tap is the same round', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/bills/90') return bill;
      if (method === 'post' && path === '/bills/90/fire') return { ...bill, draft: [] };
      throw new Error(`unexpected ${method} ${path}`);
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-fire'));
    await waitFor(() => expect(screen.queryByTestId('bill-draft-total')).toBeNull());
    const fired = posRequest.mock.calls.find((c) => c[1] === '/bills/90/fire');
    expect(fired?.[2]).toEqual({ client_uuid: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('has nothing to send when the draft is empty', async () => {
    bill.draft = [];
    bill.draft_preview_cents = 0;
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    expect(await screen.findByTestId('bill-fire')).toBeDisabled();
  });

  it('offers to take a round back until it is handed over', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/bills/90') return bill;
      if (method === 'post' && path === '/bills/90/rounds/7/cancel') {
        return { ...bill, rounds: [round({ cancelled_at: 'x' })], fired_total_cents: 0 };
      }
      throw new Error(`unexpected ${method} ${path}`);
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-cancel-round-7'));
    await waitFor(() =>
      expect(screen.getByTestId('bill-round-7')).toHaveAttribute('data-cancelled', 'yes')
    );
    expect(screen.getByTestId('bill-owed')).toHaveTextContent('0');
  });

  it('does not offer to cancel a round the guest already has', async () => {
    bill.rounds = [round({ prep_status: 'served', served_at: 'x' })];
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await screen.findByTestId('bill-round-7');
    expect(screen.queryByTestId('bill-cancel-round-7')).toBeNull();
  });

  it('shows the server’s refusal rather than a shrug', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/bills/90') return bill;
      throw { response: { data: { error: 'Позиція вже на кухні' } } };
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-more-3'));
    expect(await screen.findByTestId('bill-banner')).toHaveTextContent('Позиція вже на кухні');
  });

  it('retypes a draft line', async () => {
    const seen: Array<[string, string, unknown]> = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      seen.push([method, path, body]);
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-more-3'));
    await waitFor(() =>
      expect(seen).toContainEqual(['patch', '/bills/90/items/3', { quantity: 3 }])
    );
  });

  it('removes a draft line instead of counting it down to zero', async () => {
    bill.draft = [line({ id: 3, quantity: 1 })];
    const seen: Array<[string, string, unknown]> = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      seen.push([method, path, body]);
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-less-3'));
    // Zero is «зняти», not a quantity — the server has no zero either.
    await waitFor(() => expect(seen).toContainEqual(['delete', '/bills/90/items/3', undefined]));
  });

  it('adds a dish that asks nothing in one tap', async () => {
    const posted: unknown[] = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/items') posted.push(body);
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-add'));
    await userEvent.click(await screen.findByTestId('dish-2'));
    await waitFor(() =>
      expect(posted).toEqual([{ variant_id: 9, quantity: 1, modifiers: [], note: '' }])
    );
  });

  it('asks the question the dish has, and sends the answer the waiter picked', async () => {
    const posted: unknown[] = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/items') posted.push(body);
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-add'));
    // Two sizes and a required group: the tap cannot be the whole order.
    await userEvent.click(await screen.findByTestId('dish-1'));
    const sheet = await screen.findByTestId('modifier-sheet');
    await userEvent.click(within(sheet).getByTestId('modifier-variant-6'));
    await userEvent.click(within(sheet).getByTestId('modifier-chip-32'));
    await userEvent.click(within(sheet).getByTestId('modifier-add'));
    await waitFor(() =>
      expect(posted).toEqual([{ variant_id: 6, quantity: 1, modifiers: [32], note: '' }])
    );
  });

  it('says so plainly when there is no network', async () => {
    useOfflineStatus.setState({ online: false });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    expect(await screen.findByTestId('bill-offline')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
  });
});
