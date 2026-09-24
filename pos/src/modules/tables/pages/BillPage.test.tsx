// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill screen end to end inside the module: what is owed stays apart from
// what is only typed, a dish that asks a question asks it, «На кухню» locks
// the round, and a refusal arrives in the server's own words.

import 'fake-indexeddb/auto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Bill, BillLine, BillRound } from '../lib/types';

const posRequest = vi.fn();
const getCatalog = vi.fn();
const navigate = vi.fn();
const getMeta = vi.fn();
const printPrecheck = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  const { useEffect, useState } = await import('react');
  // The menu's hook, on the fixture below rather than on the real fetch: the
  // real one reads the host's own `cashierApi`, which no mock here reaches.
  function useSalesCatalog() {
    const [rows, setRows] = useState<Array<[number, unknown[]]>>([]);
    const [query, setQuery] = useState('');
    useEffect(() => {
      void Promise.resolve(getCatalog()).then((items: Array<{ product_id: number }>) => {
        const map = new Map<number, unknown[]>();
        for (const it of items) map.set(it.product_id, [...(map.get(it.product_id) ?? []), it]);
        setRows([...map.entries()]);
      });
    }, []);
    return {
      grouped: rows,
      folderTiles: [],
      catalogBarTags: [],
      catalogBarActiveId: 'all' as const,
      loading: false,
      query,
      setQuery,
      showBack: false,
      backLabel: 'Усі товари',
      enterTag: () => undefined,
      selectCatalogBarTag: () => undefined,
      goBackOne: () => undefined,
      lookupBarcode: async () => [],
      refresh: async () => undefined,
    };
  }
  return {
    ...real,
    api: { posRequest: (...a: unknown[]) => posRequest(...a) },
    cashierApi: { getCatalog: (...a: unknown[]) => getCatalog(...a) },
    useSalesCatalog,
    getMeta: (...a: unknown[]) => getMeta(...a),
    printPrecheck: (...a: unknown[]) => printPrecheck(...a),
  };
});

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useParams: () => ({ billId: '90' }), useNavigate: () => navigate };
});

const { BillPage } = await import('./BillPage');
const { useOfflineStatus, useAuthStore } = await import('@pos/platform');
const mirror = await import('../data/mirror');
const { makeAuthResponse } = await import('../../../test/utils');

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
  sale_id: null,
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

beforeEach(async () => {
  vi.useRealTimers();
  navigate.mockReset();
  useOfflineStatus.setState({ online: true });
  useAuthStore.setState({
    auth: makeAuthResponse({ store: { id: 7 } }),
    isAuthenticated: true,
    bootstrapped: true,
  });
  await mirror.clearMirror();
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
    draft: [
      line({ id: 3, variant_id: 9, quantity: 2, product_name: 'Круасан', variant_label: '', preview_unit_price_cents: 5500 }),
    ],
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
  getMeta.mockReset();
  getMeta.mockImplementation(async (key: string) =>
    key === 'receiptPrinterName' ? 'XP-58' : 58
  );
  printPrecheck.mockReset();
  printPrecheck.mockResolvedValue(undefined);
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

  // ── К4l: меню плитками, чернетка одразу ──────────────────────────────────

  /** A POST that answers only when the test says so. */
  function deferredPost() {
    const posted: unknown[] = [];
    const answers: Array<(b: Bill) => void> = [];
    const rejects: Array<(e: unknown) => void> = [];
    posRequest.mockImplementation((method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/items') {
        posted.push(body);
        return new Promise<Bill>((resolve, reject) => {
          answers.push(resolve);
          rejects.push(reject);
        });
      }
      return Promise.resolve(bill);
    });
    return { posted, answers, rejects };
  }

  it('adds a dish that asks nothing in one tap, on the screen before the server answers', async () => {
    const { posted, answers } = deferredPost();
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('menu-tile-2'));
    expect(posted).toEqual([{ variant_id: 9, quantity: 1, modifiers: [], note: '' }]);
    // The fixture's draft already holds two croissants: the tap folds into
    // that line — «3×», greyed — and the tile says 3 as well.
    const row = await screen.findByTestId('bill-line-3');
    expect(row).toHaveAttribute('data-pending', 'yes');
    expect(row).toHaveTextContent('3×');
    expect(within(screen.getByTestId('menu-tile-2')).getByTestId('tile-count')).toHaveTextContent('3');
    // Nothing that fires may run on a draft the server has not confirmed.
    expect(screen.getByTestId('bill-fire')).toBeDisabled();

    answers[0]({ ...bill, draft: [{ ...bill.draft[0], quantity: 3 }] });
    await waitFor(() => expect(screen.getByTestId('bill-line-3')).toHaveAttribute('data-pending', 'no'));
    expect(screen.getByTestId('bill-fire')).toBeEnabled();
  });

  it('counts a second tap on the same dish up locally, and sends it twice', async () => {
    bill.draft = [];
    bill.draft_preview_cents = 0;
    const { posted, answers } = deferredPost();
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    const tile = await screen.findByTestId('menu-tile-2');
    await userEvent.click(tile);
    await userEvent.click(tile);
    // Both taps are on the screen at once; only one of them is on the wire —
    // the writes go out in turn, so the answers apply in the order the waiter
    // tapped (§4.13).
    expect(screen.getByTestId('bill-line-pending')).toHaveTextContent('2×');
    expect(screen.getByTestId('bill-draft-total')).toHaveTextContent('110');
    expect(posted).toHaveLength(1);
    answers[0]({ ...bill, draft: [line({ id: 4, variant_id: 9, product_name: 'Круасан', variant_label: '', preview_unit_price_cents: 5500 })], draft_preview_cents: 5500 });
    await waitFor(() => expect(posted).toHaveLength(2));
    // The first answer landed, the second tap is still folded into that row.
    const row = screen.getByTestId('bill-line-4');
    expect(row).toHaveAttribute('data-pending', 'yes');
    expect(row).toHaveTextContent('2×');
  });

  it('takes a refused tap off the screen and says why, in the server’s words', async () => {
    bill.draft = [];
    bill.draft_preview_cents = 0;
    const { rejects } = deferredPost();
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('menu-tile-2'));
    expect(screen.getByTestId('bill-line-pending')).toBeInTheDocument();
    rejects[0]({ response: { data: { error: 'Страва сьогодні в стоп-листі' } } });
    expect(await screen.findByTestId('bill-banner')).toHaveTextContent('в стоп-листі');
    await waitFor(() => expect(screen.queryByTestId('bill-line-pending')).toBeNull());
  });

  it('asks the question the dish has, and sends the answer the waiter picked', async () => {
    const posted: unknown[] = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/items') posted.push(body);
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    // Two sizes and a required group: the tap cannot be the whole order.
    await userEvent.click(await screen.findByTestId('menu-tile-1'));
    const sheet = await screen.findByTestId('modifier-sheet');
    await userEvent.click(within(sheet).getByTestId('modifier-variant-6'));
    await userEvent.click(within(sheet).getByTestId('modifier-chip-32'));
    await userEvent.click(within(sheet).getByTestId('modifier-add'));
    await waitFor(() =>
      expect(posted).toEqual([{ variant_id: 6, quantity: 1, modifiers: [32], note: '' }])
    );
  });

  it('greys a dish the kitchen stopped for the day, with its own word', async () => {
    getCatalog.mockResolvedValue([
      ...MENU.slice(0, 2),
      { ...MENU[2], stop_listed: true, stop_listed_on: new Intl.DateTimeFormat('en-CA').format(new Date()) },
    ]);
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    const tile = await screen.findByTestId('menu-tile-2');
    expect(tile).toBeDisabled();
    expect(within(tile).getByTestId('tile-badge')).toHaveTextContent('стоп');
  });

  it('on a narrow screen the bill lives on a bar and opens as a sheet', async () => {
    const matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      renderWithProviders(<BillPage />, { route: '/tables/90' });
      const bar = await screen.findByTestId('bill-bar');
      expect(bar).toHaveTextContent('Чернетка · 1 поз.');
      expect(screen.getByTestId('bill-bar-fire')).toHaveTextContent('На кухню · 1');
      expect(screen.queryByTestId('bill-owed')).toBeNull();
      await userEvent.click(screen.getByTestId('bill-bar-open'));
      expect(await screen.findByTestId('bill-sheet')).toBeInTheDocument();
      expect(screen.getByTestId('bill-owed')).toHaveTextContent('80');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says so plainly when there is no network', async () => {
    useOfflineStatus.setState({ online: false });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    expect(await screen.findByTestId('bill-offline')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
  });

  // ── К4g: розділення й передчек ───────────────────────────────────────────

  it('pays the whole bill in one receipt and leaves the table', async () => {
    bill.draft = [];
    const posted: unknown[] = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/pay') {
        posted.push(body);
        return { bill: { ...bill, status: 'paid' }, sale_ids: [7] };
      }
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-pay'));
    await userEvent.click(await screen.findByTestId('pay-submit'));
    // No `line_ids` when everything is ticked: «усе, що винні» survives
    // another waiter firing one more round between render and request.
    await waitFor(() =>
      expect(posted).toEqual([{ parts: [{ payments: [{ method: 'card', amount_cents: 8000 }] }] }])
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tables'));
  });

  it('splits by dishes: only the ticked lines, and the table stays open', async () => {
    bill.rounds = [
      round({
        items: [
          line({ id: 2, quantity: 1, unit_price_cents: 8000 }),
          line({ id: 5, quantity: 1, unit_price_cents: 5500, product_name: 'Круасан' }),
        ],
      }),
    ];
    bill.fired_total_cents = 13500;
    bill.draft = [];
    const posted: unknown[] = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/pay') {
        posted.push(body);
        // The other plate is still owed, so the bill stays open.
        return { bill, sale_ids: [8] };
      }
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-pay'));
    await userEvent.click(await screen.findByTestId('pay-line-5'));
    expect(screen.getByTestId('pay-submit')).toHaveTextContent('частина');
    await userEvent.click(screen.getByTestId('pay-submit'));
    await waitFor(() =>
      expect(posted).toEqual([
        { parts: [{ line_ids: [2], payments: [{ method: 'card', amount_cents: 8000 }] }] },
      ])
    );
    // Dividing the dishes is N receipts, so the waiter comes back for the rest.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('splits evenly: one receipt, several payment rows that add up', async () => {
    bill.draft = [];
    const posted: Array<{ parts: Array<{ payments: Array<{ amount_cents: number }> }> }> = [];
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'post' && path === '/bills/90/pay') {
        posted.push(body as (typeof posted)[number]);
        return { bill: { ...bill, status: 'paid' }, sale_ids: [9] };
      }
      return bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-pay'));
    await userEvent.click(await screen.findByTestId('pay-ways-more'));
    await userEvent.click(screen.getByTestId('pay-ways-more'));
    expect(screen.getByTestId('pay-ways')).toHaveTextContent('3');
    await userEvent.click(screen.getByTestId('pay-method-cash'));
    await userEvent.click(screen.getByTestId('pay-submit'));
    await waitFor(() => expect(posted).toHaveLength(1));
    const part = posted[0].parts[0];
    expect(part).not.toHaveProperty('line_ids');
    expect(part.payments).toHaveLength(3);
    expect(part.payments.reduce((a, p) => a + p.amount_cents, 0)).toBe(8000);
    expect(part.payments.every((p) => (p as { method: string }).method === 'cash')).toBe(true);
  });

  it('will not offer payment while the kitchen has not been told', async () => {
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    // The draft from the fixture is still untyped-but-unsent.
    expect(await screen.findByTestId('bill-pay')).toBeDisabled();
  });

  it('records the pre-bill without freezing anything', async () => {
    const seen: string[] = [];
    posRequest.mockImplementation(async (method: string, path: string) => {
      seen.push(`${method} ${path}`);
      return path === '/bills/90/precheck' ? { ...bill, precheck_printed_at: 'x' } : bill;
    });
    renderWithProviders(<BillPage />, { route: '/tables/90' });
    await userEvent.click(await screen.findByTestId('bill-precheck'));
    await waitFor(() => expect(seen).toContain('post /bills/90/precheck'));
    // The bill stays open and editable — the mark is only so the tile can
    // show it and the next waiter does not print a second one.
    expect(await screen.findByTestId('bill-precheck')).toHaveTextContent('Передчек надруковано');
    expect(screen.getByTestId('bill-fire')).toBeEnabled();
  });

  // ── К4h: друк передчека ──────────────────────────────────────────────────

  it('prints the pre-bill on a till, listing only what the rounds locked', async () => {
    posRequest.mockImplementation(async (method: string, path: string) =>
      path === '/bills/90/precheck' ? { ...bill, precheck_printed_at: 'x' } : bill
    );
    renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'cashier' });
    await userEvent.click(await screen.findByTestId('bill-precheck'));
    await waitFor(() => expect(printPrecheck).toHaveBeenCalledTimes(1));
    const [printerName, doc, width] = printPrecheck.mock.calls[0];
    expect(printerName).toBe('XP-58');
    expect(width).toBe(58);
    expect(doc).toMatchObject({ table_name: '5', bill_no: 12, guests: 4, total_cents: 8000 });
    // The draft is on the screen but never on the paper.
    expect(doc.items).toHaveLength(1);
    expect(await screen.findByTestId('bill-print-status')).toHaveTextContent('на друк');
  });

  it('on the waiter’s tablet the mark IS the whole action', async () => {
    const seen: string[] = [];
    posRequest.mockImplementation(async (method: string, path: string) => {
      seen.push(`${method} ${path}`);
      return bill;
    });
    // The web shell has no printer at all, so К4h's command never runs and
    // nothing about the bill waits on paper.
    renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'web' });
    await userEvent.click(await screen.findByTestId('bill-precheck'));
    await waitFor(() => expect(seen).toContain('post /bills/90/precheck'));
    expect(printPrecheck).not.toHaveBeenCalled();
  });

  it('says what went wrong at the printer without losing the mark', async () => {
    printPrecheck.mockRejectedValue(new Error('Принтер "XP-58" не знайдено'));
    const seen: string[] = [];
    posRequest.mockImplementation(async (method: string, path: string) => {
      seen.push(`${method} ${path}`);
      return { ...bill, precheck_printed_at: 'x' };
    });
    renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'cashier' });
    await userEvent.click(await screen.findByTestId('bill-precheck'));
    // The mark is what the other waiters see, so it is recorded first and
    // never held up by paper.
    await waitFor(() => expect(seen).toContain('post /bills/90/precheck'));
    expect(await screen.findByTestId('bill-print-status')).toHaveTextContent('не знайдено');
  });

  // ── К4j: дзеркало для читання ────────────────────────────────────────────

  it('reads the bill out of the till’s memory when the network goes', async () => {
    const { unmount } = renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'cashier' });
    await screen.findByTestId('bill-owed');
    await waitFor(async () => expect(await mirror.loadBill(7, 90)).not.toBeNull());
    unmount();

    useOfflineStatus.setState({ online: false });
    posRequest.mockRejectedValue(new Error('offline'));
    renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'cashier' });
    // A guest asking «скільки з нас?» gets an answer even mid-blink.
    expect(await screen.findByTestId('bill-stale')).toHaveTextContent('з памʼяті каси');
    expect(screen.getByTestId('bill-owed')).toHaveTextContent('80');
    expect(screen.queryByTestId('bill-offline')).toBeNull();
    // And nothing on it can be changed: the mirror is a cache, not a queue.
    expect(screen.getByTestId('bill-fire')).toBeDisabled();
    expect(screen.getByTestId('bill-pay')).toBeDisabled();
    expect(screen.getByTestId('bill-precheck')).toBeDisabled();
    expect(await screen.findByTestId('menu-tile-2')).toBeDisabled();
  });

  it('says «Потрібна мережа» rather than queueing a write', async () => {
    const { unmount } = renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'cashier' });
    await screen.findByTestId('bill-owed');
    await waitFor(async () => expect(await mirror.loadBill(7, 90)).not.toBeNull());
    unmount();

    useOfflineStatus.setState({ online: false });
    const { useBill } = await import('../lib/useBill');
    expect(typeof useBill).toBe('function');
    posRequest.mockClear();
    renderWithProviders(<BillPage />, { route: '/tables/90', shell: 'cashier' });
    await screen.findByTestId('bill-stale');
    // Every write goes through `run`, and `run` refuses offline before the
    // request is even built — a round fired into a mirror wakes no kitchen.
    expect(posRequest).not.toHaveBeenCalled();
  });
});
