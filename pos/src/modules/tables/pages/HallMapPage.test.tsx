// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The hall map end to end inside the module: the room draws, a tile says what
// the table is doing, one tap seats it, and «Потрібна мережа» when there is
// none.

import 'fake-indexeddb/auto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';

const posRequest = vi.fn();
const navigate = vi.fn();

const HALLS = [
  {
    id: 1,
    name: 'Зала',
    sort_order: 0,
    is_active: true,
    tables: [
      {
        id: 11,
        hall_id: 1,
        name: '5',
        seats: 4,
        pos_x: 0,
        pos_y: 0,
        width: 2,
        height: 2,
        shape: 'rect',
        is_active: true,
      },
      {
        id: 12,
        hall_id: 1,
        name: '6',
        seats: 2,
        pos_x: 2,
        pos_y: 0,
        width: 2,
        height: 2,
        shape: 'round',
        is_active: true,
      },
    ],
  },
  {
    id: 2,
    name: 'Тераса',
    sort_order: 1,
    is_active: true,
    tables: [
      {
        id: 21,
        hall_id: 2,
        name: 'T1',
        seats: 2,
        pos_x: 0,
        pos_y: 0,
        width: 2,
        height: 2,
        shape: 'rect',
        is_active: true,
      },
    ],
  },
];

let bills: Array<Record<string, unknown>> = [];

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => navigate };
});

const { HallMapPage } = await import('./HallMapPage');
const { useOfflineStatus, useAuthStore } = await import('@pos/platform');
const mirror = await import('../data/mirror');
const { makeAuthResponse } = await import('../../../test/utils');

beforeEach(async () => {
  navigate.mockReset();
  useOfflineStatus.setState({ online: true });
  useAuthStore.setState({
    auth: makeAuthResponse({ store: { id: 7 } }),
    isAuthenticated: true,
    bootstrapped: true,
  });
  await mirror.clearMirror();
  bills = [
    {
      id: 90,
      bill_no: 3,
      table_id: 11,
      guests: 2,
      opened_at: new Date(Date.now() - 42 * 60_000).toISOString(),
      opened_by_name: 'Марта',
      precheck_printed_at: null,
      fired_total_cents: 24000,
      draft_count: 1,
      prep_status: 'ready',
    },
  ];
  posRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'get' && path === '/halls') return { halls: HALLS };
    if (method === 'get' && path === '/bills') return { bills };
    if (method === 'post' && path === '/bills') return { bill: { id: 91 } };
    throw new Error(`unexpected ${method} ${path}`);
  });
});

describe('HallMapPage', () => {
  it('draws the room and says what each table is doing', async () => {
    renderWithProviders(<HallMapPage />);
    const seated = await screen.findByTestId('table-tile-11');
    // Somebody else seated it (the signed-in staff member is not Марта), and
    // its food is on the pass.
    expect(seated).toHaveAttribute('data-tone', 'busy');
    expect(seated).toHaveAttribute('data-kitchen', 'ready');
    expect(seated).toHaveTextContent('5');
    expect(seated).toHaveTextContent('240');
    expect(seated).toHaveTextContent('42 хв');
    // The dot that says «є ненадіслані позиції».
    expect(screen.getByTestId('table-draft-11')).toBeInTheDocument();

    const free = screen.getByTestId('table-tile-12');
    expect(free).toHaveAttribute('data-tone', 'free');
    expect(free).toHaveTextContent('2 місця');
  });

  it('marks my own tables, and a table whose pre-bill was printed as asking for the bill', async () => {
    const me = useAuthStore.getState().auth!.staff.id;
    bills = [{ ...bills[0], opened_by: me, prep_status: null }];
    const { unmount } = renderWithProviders(<HallMapPage />);
    expect(await screen.findByTestId('table-tile-11')).toHaveAttribute('data-tone', 'mine');
    unmount();

    bills = [{ ...bills[0], precheck_printed_at: new Date().toISOString() }];
    renderWithProviders(<HallMapPage />);
    const asking = await screen.findByTestId('table-tile-11');
    await waitFor(() => expect(asking).toHaveAttribute('data-tone', 'bill'));
    expect(screen.getByTestId('table-precheck-11')).toHaveTextContent('Просять рахунок');
    expect(screen.getByTestId('tables-legend')).toHaveTextContent('Мій стіл');
  });

  it('opens the bill on one tap, whether the table was free or not', async () => {
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('table-tile-12'));
    // The server answers with the bill already there for an occupied table,
    // so the screen never has to ask which the waiter meant.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tables/91'));
    expect(posRequest).toHaveBeenCalledWith('post', '/bills', { table_id: 12 });
  });

  it('shows the refusal from the server instead of swallowing it', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/halls') return { halls: HALLS };
      if (method === 'get' && path === '/bills') return { bills };
      throw { response: { data: { error: 'Столи не налаштовано' } } };
    });
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('table-tile-12'));
    expect(await screen.findByTestId('tables-banner')).toHaveTextContent('Столи не налаштовано');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('switches halls without re-reading the room', async () => {
    renderWithProviders(<HallMapPage />);
    await screen.findByTestId('table-tile-11');
    await userEvent.click(screen.getByTestId('hall-tab-2'));
    expect(await screen.findByTestId('table-tile-21')).toBeInTheDocument();
    expect(screen.queryByTestId('table-tile-11')).not.toBeInTheDocument();
  });

  it('says so plainly when there is no network', async () => {
    useOfflineStatus.setState({ online: false });
    renderWithProviders(<HallMapPage />);
    expect(await screen.findByTestId('tables-offline')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
  });

  it('points the owner at the admin when the room is empty', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/halls') return { halls: [] };
      return { bills: [] };
    });
    renderWithProviders(<HallMapPage />);
    expect(await screen.findByTestId('tables-empty')).toHaveTextContent('Зали ще не створені');
  });

  // ── К4j: дзеркало для читання ────────────────────────────────────────────

  it('draws the room from the till’s memory when the Wi-Fi blinks', async () => {
    // Online once, on the till, so the mirror has something in it…
    const { unmount } = renderWithProviders(<HallMapPage />, { shell: 'cashier' });
    await screen.findByTestId('table-tile-11');
    await waitFor(async () => expect(await mirror.loadRoom(7)).not.toBeNull());
    unmount();

    // …then the network goes and the waiter still sees who is sitting where.
    useOfflineStatus.setState({ online: false });
    posRequest.mockRejectedValue(new Error('offline'));
    renderWithProviders(<HallMapPage />, { shell: 'cashier' });
    expect(await screen.findByTestId('tables-stale')).toHaveTextContent('з памʼяті каси');
    const seated = await screen.findByTestId('table-tile-11');
    expect(seated).toHaveTextContent('240');
    expect(screen.queryByTestId('tables-offline')).toBeNull();
  });

  it('still refuses to seat a table without the network', async () => {
    const { unmount } = renderWithProviders(<HallMapPage />, { shell: 'cashier' });
    await screen.findByTestId('table-tile-12');
    await waitFor(async () => expect(await mirror.loadRoom(7)).not.toBeNull());
    unmount();

    useOfflineStatus.setState({ online: false });
    posRequest.mockClear();
    renderWithProviders(<HallMapPage />, { shell: 'cashier' });
    await userEvent.click(await screen.findByTestId('table-tile-12'));
    // The mirror is a cache, not a queue: a seated table is a write.
    expect(await screen.findByTestId('tables-banner')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps no mirror on the waiter’s web tablet', async () => {
    // The web shell has no offline runtime at all (§4.12), so a mirror written
    // there could never be read back — and writing one would only mean a
    // second, staler copy of the room on a device that cannot use it.
    renderWithProviders(<HallMapPage />);
    await screen.findByTestId('table-tile-11');
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/halls', undefined));
    expect(await mirror.loadRoom(7)).toBeNull();
  });
});

// ── Q7: запити гостей із QR-меню ─────────────────────────────────────────────

describe('HallMapPage — guest requests (Q7)', () => {
  const askFor = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 5,
    table_id: 12,
    table_name: '6',
    hall_name: 'Зала',
    created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    expires_at: new Date(Date.now() + 28 * 60_000).toISOString(),
    has_open_bill: false,
    lines: [
      { id: 51, name: 'Борщ', caption: '', quantity: 2, note: '', problem: null },
      { id: 52, name: 'Стейк', caption: '', quantity: 1, note: '', problem: null },
    ],
    ...over,
  });

  let requests: Array<Record<string, unknown>> = [];
  let handle: (method: string, path: string, body?: unknown) => unknown = () => undefined;

  beforeEach(() => {
    requests = [askFor()];
    handle = () => undefined;
    posRequest.mockImplementation(async (method: string, path: string, body?: unknown) => {
      if (method === 'get' && path === '/halls') return { halls: HALLS };
      if (method === 'get' && path === '/bills') return { bills };
      if (method === 'get' && path === '/guest-orders') return { orders: requests };
      if (method === 'post' && path === '/bills') return { bill: { id: 91 } };
      const custom = handle(method, path, body);
      if (custom !== undefined) return custom;
      throw new Error(`unexpected ${method} ${path}`);
    });
  });

  const posted = (path: string): unknown[] | undefined =>
    posRequest.mock.calls.find((c) => c[0] === 'post' && c[1] === path);

  it('badges the table that is asking — even a free one — and lists the request above the room', async () => {
    renderWithProviders(<HallMapPage />);
    const tile = await screen.findByTestId('table-tile-12');
    // A free table has no bill to open, so the request is the only sign of life on it.
    await waitFor(() => expect(tile).toHaveAttribute('data-guest', '1'));
    expect(tile).toHaveAttribute('data-tone', 'free');
    expect(screen.getByTestId('table-guest-12')).toHaveTextContent('Запит гостя');
    // A table nobody asked from carries no badge.
    expect(screen.getByTestId('table-tile-11')).not.toHaveAttribute('data-guest');

    const list = screen.getByTestId('tables-requests');
    expect(list).toHaveTextContent('1 запит');
    expect(within(list).getByTestId('guest-order-5')).toHaveTextContent('Стіл 6 · Зала');
    expect(screen.getByTestId('tables-legend')).toHaveTextContent('Запит гостя');
  });

  it('counts two requests at one table, and shows the other hall that someone is asking there', async () => {
    requests = [askFor({ id: 5 }), askFor({ id: 6 }), askFor({ id: 7, table_id: 21, table_name: 'T1', hall_name: 'Тераса' })];
    renderWithProviders(<HallMapPage />);
    const badge = await screen.findByTestId('table-guest-12');
    expect(badge).toHaveTextContent('Запитів гостей: 2');
    expect(badge).toHaveTextContent(/^\s*2/);
    // The waiter is looking at «Зала»; «Тераса» must not be a place a request can hide.
    expect(screen.getByTestId('hall-tab-guest-2')).toHaveTextContent('1');
    expect(screen.getByTestId('hall-tab-guest-1')).toHaveTextContent('2');
  });

  it('shows no list and no legend entry while nobody is asking', async () => {
    requests = [];
    renderWithProviders(<HallMapPage />);
    await screen.findByTestId('table-tile-12');
    expect(screen.queryByTestId('tables-requests')).toBeNull();
    expect(screen.queryByTestId('table-guest-12')).toBeNull();
    expect(screen.getByTestId('tables-legend')).not.toHaveTextContent('Запит гостя');
  });

  it('accepts a request from the map, says so, and reads the room again', async () => {
    handle = (method, path) => {
      if (method === 'post' && path === '/guest-orders/5/accept') {
        requests = [];
        return { bill: { id: 91 }, fired: true, warning: null, already: false };
      }
      return undefined;
    };
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('guest-order-accept-5'));
    expect(await screen.findByTestId('tables-note')).toHaveTextContent('Стіл 6: прийнято — замовлення на кухні');
    expect(posted('/guest-orders/5/accept')?.[2]).toEqual({});
    // Gone from the list — the poll after the write found it accepted.
    await waitFor(() => expect(screen.queryByTestId('guest-order-5')).toBeNull());
    expect(screen.queryByTestId('tables-requests')).toBeNull();
    // Answering from the map does not drag the waiter off it.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('takes the waiter to the bill when accepting left something for them to finish', async () => {
    handle = (method, path) => {
      if (method === 'post' && path === '/guest-orders/5/accept') {
        return {
          bill: { id: 91 },
          fired: false,
          warning: 'У чернетці були ваші позиції — перевірте рахунок і відправте на кухню самі',
          already: false,
        };
      }
      return undefined;
    };
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('guest-order-accept-5'));
    // The rest of the job is on the bill, and the server's warning goes along.
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/tables/91', {
        state: { notice: 'У чернетці були ваші позиції — перевірте рахунок і відправте на кухню самі' },
      })
    );
  });

  it('says which dish the server refused, and accepts the rest on the next tap', async () => {
    let attempts = 0;
    handle = (method, path) => {
      if (method === 'post' && path === '/guest-orders/5/accept') {
        attempts += 1;
        if (attempts === 1) {
          throw { response: { status: 409, data: { error: 'Стейк: сьогодні в стоп-листі', item_id: 52 } } };
        }
        return { bill: { id: 91 }, fired: true, warning: null, already: false };
      }
      return undefined;
    };
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('guest-order-accept-5'));
    // The server's own words, and nothing was accepted by halves.
    expect(await screen.findByTestId('tables-banner')).toHaveTextContent('Стейк: сьогодні в стоп-листі');
    expect(await screen.findByTestId('guest-line-52')).toHaveAttribute('data-blocked', 'yes');
    expect(screen.getByTestId('guest-order-accept-5')).toHaveTextContent('Прийняти без цієї');
    expect(navigate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('guest-order-accept-5'));
    await waitFor(() => expect(attempts).toBe(2));
    const accepts = posRequest.mock.calls.filter((c) => c[1] === '/guest-orders/5/accept');
    expect(accepts[0]?.[2]).toEqual({});
    expect(accepts[1]?.[2]).toEqual({ exclude_item_ids: [52] });
  });

  it('turns a request down with the reason the waiter picked', async () => {
    handle = (method, path) => {
      if (method === 'post' && path === '/guest-orders/5/reject') {
        requests = [];
        return { status: 'rejected' };
      }
      return undefined;
    };
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('guest-order-reject-5'));
    await userEvent.click(screen.getByTestId('guest-order-reason-5-0'));
    expect(await screen.findByTestId('tables-note')).toHaveTextContent('Стіл 6: запит відхилено');
    expect(posted('/guest-orders/5/reject')?.[2]).toEqual({ reason: 'Цієї страви вже немає' });
    await waitFor(() => expect(screen.queryByTestId('guest-order-5')).toBeNull());
  });

  it('shows the server’s refusal when a request cannot be turned down any more', async () => {
    handle = (method, path) => {
      if (method === 'post' && path === '/guest-orders/5/reject') {
        throw { response: { status: 409, data: { error: 'Запит уже прийнято' } } };
      }
      return undefined;
    };
    renderWithProviders(<HallMapPage />);
    await userEvent.click(await screen.findByTestId('guest-order-reject-5'));
    await userEvent.click(screen.getByTestId('guest-order-reason-none-5'));
    expect(await screen.findByTestId('tables-banner')).toHaveTextContent('Запит уже прийнято');
    expect(posted('/guest-orders/5/reject')?.[2]).toEqual({});
  });

  it('still draws the room when the requests cannot be read', async () => {
    // A store with guest ordering off, or a backend older than Q6: the map is
    // fine without the list, and must not say otherwise.
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/halls') return { halls: HALLS };
      if (method === 'get' && path === '/bills') return { bills };
      throw { response: { status: 404, data: { error: 'Not found' } } };
    });
    renderWithProviders(<HallMapPage />);
    expect(await screen.findByTestId('table-tile-12')).toHaveAttribute('data-tone', 'free');
    expect(screen.queryByTestId('tables-requests')).toBeNull();
    expect(screen.queryByTestId('tables-banner')).toBeNull();
  });
});

