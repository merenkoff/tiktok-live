// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Роздача» end to end inside the module: the row of tables, the question
// before a plate is marked, the plate leaving the list at once, «Повернути»,
// the server's refusal in its own words, and a tap that got no answer
// replayed under the same key rather than carried twice.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@host/test/utils';
import type { ServingFeed, ServingHistoryRow, ServingLine, ServingTable } from '../lib/types';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { PassPage } = await import('./PassPage');
const { useOfflineStatus, useAuthStore } = await import('@pos/platform');
const { makeAuthResponse } = await import('@host/test/utils');

const NOW = new Date().toISOString();
const minutesAgo = (m: number) => new Date(new Date(NOW).getTime() - m * 60000).toISOString();

const line = (over: Partial<ServingLine> = {}): ServingLine => ({
  id: 101,
  product_name: 'Борщ',
  caption: '',
  note: '',
  modifiers: [],
  quantity: 2,
  served_quantity: 0,
  stations: ['kitchen'],
  ...over,
});

let feed: ServingFeed;
let history: ServingHistoryRow[];

function table5(): ServingTable {
  return {
    table_id: 5,
    table_name: '5',
    hall_name: 'Зала',
    bill_id: 90,
    bill_no: 1,
    opened_by_name: 'Оля',
    to_serve: 3,
    rounds: [
      {
        id: 7,
        seq: 1,
        fired_at: minutesAgo(12),
        fired_by_name: 'Оля',
        prep_status: 'ready',
        ready_at: minutesAgo(3),
        items: [line(), line({ id: 102, product_name: 'Узвар', quantity: 1, stations: ['bar'], note: 'без цукру' })],
      },
    ],
  };
}

function table2(): ServingTable {
  return {
    table_id: 2,
    table_name: '2',
    hall_name: 'Тераса',
    bill_id: 80,
    bill_no: 2,
    opened_by_name: 'Петро',
    to_serve: 1,
    rounds: [
      {
        id: 8,
        seq: 1,
        fired_at: minutesAgo(20),
        fired_by_name: 'Петро',
        prep_status: 'new',
        ready_at: null,
        items: [line({ id: 201, product_name: 'Деруни', quantity: 1 })],
      },
    ],
  };
}

const calls = (method: string, path: string) =>
  posRequest.mock.calls.filter((c) => c[0] === method && c[1] === path);

beforeEach(() => {
  feed = { now: NOW, tables: [table2(), table5()] };
  history = [];
  posRequest.mockReset();
  posRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'get' && path === '/serving') return feed;
    if (method === 'get' && path.startsWith('/serving/bills/')) {
      return { now: NOW, bill_id: Number(path.split('/').pop()), status: 'open', rounds: [], history };
    }
    if (method === 'post' && path === '/serving/serve') {
      return { replay: false, events: [{ id: 501, bill_item_id: 101, quantity: 2, served_at: NOW }], lines: [], rounds: [] };
    }
    if (method === 'post' && path === '/serving/undo') return { undone: [501], lines: [], rounds: [] };
    throw new Error(`unexpected ${method} ${path}`);
  });
  useOfflineStatus.setState({ online: true });
  useAuthStore.setState({
    auth: makeAuthResponse({ store: { id: 7, module_remotes: { tables: { url: 'x' }, pass: { url: 'y' } } } }),
    isAuthenticated: true,
    bootstrapped: true,
  });
});

describe('PassPage', () => {
  it('lines the tables up in the order to walk: the food on the pass first', async () => {
    renderWithProviders(<PassPage />);
    const chips = await screen.findByTestId('pass-chips');
    const labels = within(chips)
      .getAllByRole('button')
      .map((b) => b.textContent);
    // Table 5's round is on the pass, table 2's is still cooking.
    expect(labels).toEqual(['Усі4', 'Стіл 53', 'Стіл 21']);
    expect(screen.getByTestId('pass-chip-90')).toHaveAttribute('data-state', 'ready');
    expect(screen.getByTestId('pass-round-state-7')).toHaveTextContent('готово · 3 хв');
    expect(screen.getByTestId('pass-round-state-8')).toHaveTextContent('готується · 20 хв');
    // Where to pick it up, and what the kitchen was asked.
    expect(screen.getByTestId('pass-dish-102')).toHaveTextContent('Бар');
    expect(screen.getByTestId('pass-dish-102')).toHaveTextContent('без цукру');
  });

  it('asks «Несете на стіл 5?» and, on «Несу», takes the plates off at once', async () => {
    let release: (v: unknown) => void = () => undefined;
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/serving') return feed;
      if (method === 'post' && path === '/serving/serve') {
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      if (method === 'post' && path === '/serving/undo') return { undone: [501], lines: [], rounds: [] };
      throw new Error(`unexpected ${method} ${path}`);
    });
    renderWithProviders(<PassPage />);
    await userEvent.click(await screen.findByTestId('pass-dish-101'));
    const sheet = screen.getByTestId('carry-sheet');
    expect(sheet).toHaveTextContent('Несете на стіл 5?');
    // Opens on «Усі 2»: two borschts for one table go out together.
    expect(screen.getByTestId('carry-qty-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('carry-qty-2')).toHaveTextContent('Усі 2');

    await userEvent.click(screen.getByTestId('carry-yes'));
    // Gone before the server answered.
    await waitFor(() => expect(screen.queryByTestId('pass-dish-101')).toBeNull());
    const sent = calls('post', '/serving/serve')[0][2] as { client_uuid: string; items: unknown };
    expect(sent.items).toEqual([{ bill_item_id: 101, quantity: 2 }]);
    expect(sent.client_uuid).toMatch(/^[0-9a-f-]{36}$/);

    // The server agrees, and the next read says so too.
    feed = {
      now: NOW,
      tables: [table2(), { ...table5(), to_serve: 1, rounds: [{ ...table5().rounds[0], items: [line({ served_quantity: 2 }), table5().rounds[0].items[1]] }] }],
    };
    release({ replay: false, events: [{ id: 501, bill_item_id: 101, quantity: 2, served_at: NOW }], lines: [], rounds: [] });
    expect(await screen.findByTestId('pass-toast')).toHaveTextContent('Борщ ×2 винесено');

    await userEvent.click(screen.getByTestId('pass-toast-undo'));
    await waitFor(() => expect(calls('post', '/serving/undo')).toHaveLength(1));
    expect(calls('post', '/serving/undo')[0][2]).toEqual({ event_ids: [501] });
    await waitFor(() => expect(screen.queryByTestId('pass-toast')).toBeNull());
  });

  it('carries one of two when the waiter says one', async () => {
    renderWithProviders(<PassPage />);
    await userEvent.click(await screen.findByTestId('pass-dish-101'));
    await userEvent.click(screen.getByTestId('carry-qty-1'));
    expect(screen.getByTestId('carry-yes')).toHaveTextContent('Несу');
    await userEvent.click(screen.getByTestId('carry-yes'));
    await waitFor(() => expect(calls('post', '/serving/serve')).toHaveLength(1));
    expect((calls('post', '/serving/serve')[0][2] as { items: unknown }).items).toEqual([{ bill_item_id: 101, quantity: 1 }]);
  });

  it('says «Ні» without writing anything', async () => {
    renderWithProviders(<PassPage />);
    await userEvent.click(await screen.findByTestId('pass-dish-101'));
    await userEvent.click(screen.getByTestId('carry-no'));
    expect(screen.queryByTestId('carry-sheet')).toBeNull();
    expect(calls('post', '/serving/serve')).toHaveLength(0);
    expect(screen.getByTestId('pass-dish-101')).toBeInTheDocument();
  });

  it('shows the server’s sentence when somebody carried it first, and puts the plate back', async () => {
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/serving') return feed;
      if (method === 'post' && path === '/serving/serve') {
        throw { response: { status: 409, data: { error: '«Борщ» уже винесено — Петро о 19:42', code: 'over_served' } } };
      }
      throw new Error(`unexpected ${method} ${path}`);
    });
    renderWithProviders(<PassPage />);
    await userEvent.click(await screen.findByTestId('pass-dish-101'));
    await userEvent.click(screen.getByTestId('carry-yes'));
    expect(await screen.findByTestId('pass-banner')).toHaveTextContent('«Борщ» уже винесено — Петро о 19:42');
    expect(screen.getByTestId('pass-dish-101')).toBeInTheDocument();
    expect(screen.queryByTestId('pass-toast')).toBeNull();
  });

  it('replays a tap that got no answer under the same key, so the plates are not carried twice', async () => {
    let attempt = 0;
    posRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'get' && path === '/serving') return feed;
      if (method === 'post' && path === '/serving/serve') {
        attempt += 1;
        if (attempt === 1) throw new Error('Network Error');
        return { replay: true, events: [{ id: 501, bill_item_id: 101, quantity: 2, served_at: NOW }], lines: [], rounds: [] };
      }
      throw new Error(`unexpected ${method} ${path}`);
    });
    renderWithProviders(<PassPage />);
    await userEvent.click(await screen.findByTestId('pass-dish-101'));
    await userEvent.click(screen.getByTestId('carry-yes'));
    expect(await screen.findByTestId('pass-banner')).toHaveTextContent('Немає відповіді');

    await userEvent.click(await screen.findByTestId('pass-dish-101'));
    await userEvent.click(screen.getByTestId('carry-yes'));
    await waitFor(() => expect(calls('post', '/serving/serve')).toHaveLength(2));
    const [first, second] = calls('post', '/serving/serve').map((c) => (c[2] as { client_uuid: string }).client_uuid);
    expect(second).toBe(first);
  });

  it('shows a chosen table first, then the others, then what of it has gone out', async () => {
    history = [
      {
        id: 400,
        client_uuid: 'u',
        bill_item_id: 103,
        round_id: 6,
        round_seq: 1,
        product_name: 'Салат',
        caption: '',
        quantity: 1,
        source: 'waiter',
        served_by: 1,
        served_by_name: 'Оля',
        served_at: minutesAgo(2),
        undone_at: null,
        undoable: true,
        undo_until: NOW,
      },
      {
        id: 399,
        client_uuid: null,
        bill_item_id: 104,
        round_id: 6,
        round_seq: 1,
        product_name: 'Хліб',
        caption: '',
        quantity: 1,
        source: 'kitchen',
        served_by: 3,
        served_by_name: 'Кухня · Петро',
        served_at: minutesAgo(5),
        undone_at: null,
        undoable: false,
        undo_until: null,
      },
    ];
    renderWithProviders(<PassPage />);
    await userEvent.click(await screen.findByTestId('pass-chip-90'));
    const done = await screen.findByTestId('pass-history');
    expect(done).toHaveTextContent('Салат');
    expect(done).toHaveTextContent('Кухня · Петро');
    expect(screen.queryByTestId('pass-history-undo-399')).toBeNull();
    // Table 5 first, «Інші столи» after it.
    const page = screen.getByTestId('pass-page').textContent ?? '';
    expect(page.indexOf('Стіл 5Зала')).toBeLessThan(page.indexOf('Інші столи'));
    expect(page.indexOf('Інші столи')).toBeLessThan(page.indexOf('Стіл 2Тераса'));

    await userEvent.click(screen.getByTestId('pass-history-undo-400'));
    await waitFor(() => expect(calls('post', '/serving/undo')).toHaveLength(1));
    expect(calls('post', '/serving/undo')[0][2]).toEqual({ event_ids: [400] });
  });

  it('says plainly when there is nothing left to carry', async () => {
    feed = { now: NOW, tables: [] };
    renderWithProviders(<PassPage />);
    expect(await screen.findByTestId('pass-empty')).toHaveTextContent('Відкритих рахунків немає');
  });

  it('refuses to pretend in a store without «Столи»', async () => {
    useAuthStore.setState({
      auth: makeAuthResponse({ store: { id: 7, module_remotes: { pass: { url: 'y' } } } }),
      isAuthenticated: true,
      bootstrapped: true,
    });
    renderWithProviders(<PassPage />);
    expect(await screen.findByTestId('pass-needs-tables')).toHaveTextContent('Потрібен модуль «Столи»');
    expect(posRequest).not.toHaveBeenCalledWith('get', '/serving', undefined);
  });

  it('says it needs the network rather than showing nothing', async () => {
    useOfflineStatus.setState({ online: false });
    renderWithProviders(<PassPage />);
    expect(await screen.findByTestId('pass-offline')).toHaveTextContent('Потрібна мережа');
    expect(posRequest).not.toHaveBeenCalled();
  });
});
