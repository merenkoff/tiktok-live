// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/ReviewsPage.test.tsx — the owner's «Відгуки»: the head's
// arithmetic, the rows in the guests' words, the filters as query strings,
// «Опрацьовано» as a POST, «Показати ще» by offset, and what an older or a
// refusing server gets.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';

const posRequest = vi.fn<[string, string, unknown?], Promise<unknown>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { posRequest: (m: string, p: string, b?: unknown) => posRequest(m, p, b) },
  };
});

const { ReviewsPage } = await import('./ReviewsPage');

const SUMMARY = {
  from: '2026-10-02',
  to: '2026-10-31',
  count: 3,
  average: 3.7,
  distribution: { '1': 0, '2': 1, '3': 0, '4': 0, '5': 2 },
  tags: [{ code: 'food', label: 'Страви', count: 2 }],
  unhandled_low: 1,
  latest: [],
  dishes: [
    { name: 'Деруни', up: 0, down: 2 },
    { name: 'Борщ', up: 3, down: 0 },
  ],
};
const ROWS = [
  {
    id: 12,
    score: 2,
    tags: ['wait'],
    tag_labels: ['Довго чекали'],
    comment: 'Чекали суп\n40 хвилин',
    phone: '+380 50 123 45 67',
    source: 'bill',
    created_at: '2026-10-31T17:42:00.000Z',
    table: { id: 5, name: '5', hall: 'Зал' },
    bill_no: 17,
    handled_at: null,
    handled_by: null,
    items: [
      { name: 'Борщ', verdict: 'up' },
      { name: 'Деруни · з грибами', verdict: 'down' },
    ],
  },
  {
    id: 11,
    score: 5,
    tags: [],
    tag_labels: [],
    comment: null,
    phone: null,
    source: 'menu',
    created_at: '2026-10-30T12:00:00.000Z',
    table: null,
    bill_no: null,
    handled_at: '2026-10-30T13:00:00.000Z',
    handled_by: 'Олена',
  },
];

function answer(path: string): unknown {
  if (path.startsWith('/feedback/summary')) return SUMMARY;
  if (path.startsWith('/feedback?') || path === '/feedback') return { rows: ROWS, total: 2, from: SUMMARY.from, to: SUMMARY.to };
  throw new Error(`unexpected ${path}`);
}

const calls = (method: string) => posRequest.mock.calls.filter(([m]) => m === method).map(([, p, b]) => [p, b]);

beforeEach(() => {
  posRequest.mockReset();
  posRequest.mockImplementation((method, path) => Promise.resolve(answer(path)));
});

describe('ReviewsPage', () => {
  it('reads the head and the rows for the last 30 days, in the guests’ words', async () => {
    renderWithProviders(<ReviewsPage />);
    const head = await screen.findByTestId('reviews-summary');
    expect(head).toHaveTextContent('3,7');
    expect(head).toHaveTextContent('3 відгуки');
    expect(head).toHaveTextContent('Страви 2');
    expect(screen.getByTestId('reviews-unhandled')).toHaveTextContent('Низьких оцінок без відповіді: 1');

    const rows = screen.getAllByTestId('review-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Так собі');
    expect(rows[0]).toHaveTextContent('стіл 5 · Зал');
    expect(rows[0]).toHaveTextContent('рахунок 17');
    expect(rows[0]).toHaveTextContent('з рахунку');
    expect(rows[0]).toHaveTextContent('Довго чекали');
    expect(rows[0]).toHaveTextContent('Чекали суп');
    expect(within(rows[0]!).getByRole('link', { name: '+380 50 123 45 67' })).toHaveAttribute('href', 'tel:+380501234567');
    // The dishes the guest rated (F5), in the bill's words, each with its thumb.
    const dishes = within(rows[0]!).getByRole('list', { name: 'Оцінені страви' });
    expect(dishes).toHaveTextContent('👍 Борщ');
    expect(dishes).toHaveTextContent('👎 Деруни · з грибами');
    expect(within(rows[1]!).queryByRole('list', { name: 'Оцінені страви' })).not.toBeInTheDocument();
    const dishCard = screen.getByTestId('reviews-dishes');
    expect(dishCard).toHaveTextContent('Деруни');
    expect(dishCard).toHaveTextContent('👎 2');
    expect(dishCard).toHaveTextContent('Борщ');
    expect(rows[1]).toHaveTextContent('Чудово');
    expect(rows[1]).toHaveTextContent('з QR закладу');
    expect(rows[1]).toHaveTextContent('Опрацьовано · Олена');

    const [listPath] = calls('get').find(([p]) => String(p).startsWith('/feedback?'))!;
    const query = new URLSearchParams(String(listPath).split('?')[1]);
    expect(query.get('limit')).toBe('30');
    expect(query.has('score')).toBe(false);
    expect(query.has('handled')).toBe(false);
    const from = query.get('from')!;
    const to = query.get('to')!;
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(29);
  });

  it('sends the score and the waiting-only filter as query parameters, and the period as a window', async () => {
    renderWithProviders(<ReviewsPage />);
    await screen.findByTestId('reviews-summary');
    await userEvent.click(screen.getByRole('button', { name: '2 · Так собі' }));
    await waitFor(() => expect(calls('get').some(([p]) => String(p).includes('score=2'))).toBe(true));
    await userEvent.click(screen.getByLabelText('Лише неопрацьовані'));
    await waitFor(() => expect(calls('get').some(([p]) => String(p).includes('handled=false'))).toBe(true));
    await userEvent.click(screen.getByText('7 днів'));
    await waitFor(() => {
      const last = calls('get').filter(([p]) => String(p).startsWith('/feedback?')).pop()!;
      const query = new URLSearchParams(String(last[0]).split('?')[1]);
      expect((Date.parse(query.get('to')!) - Date.parse(query.get('from')!)) / 86_400_000).toBe(6);
    });
  });

  it('marks a row handled with one POST and shows the answer, lowering the waiting count', async () => {
    renderWithProviders(<ReviewsPage />);
    await screen.findByTestId('reviews-summary');
    posRequest.mockImplementation((method, path) =>
      method === 'post'
        ? Promise.resolve({ ...ROWS[0], handled_at: '2026-10-31T18:00:00.000Z', handled_by: 'Сергій' })
        : Promise.resolve(answer(path))
    );
    const row = screen.getAllByTestId('review-row')[0]!;
    await userEvent.click(within(row).getByRole('button', { name: 'Опрацьовано' }));
    await waitFor(() => expect(calls('post')).toEqual([['/feedback/12/handled', { handled: true }]]));
    expect(await within(row).findByText(/Опрацьовано · Сергій/)).toBeInTheDocument();
    expect(screen.queryByTestId('reviews-unhandled')).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Повернути в нові' })).toBeInTheDocument();
  });

  it('asks for the next page by offset and keeps the rows it has', async () => {
    posRequest.mockImplementation((method, path) => {
      if (String(path).startsWith('/feedback/summary')) return Promise.resolve(SUMMARY);
      const query = new URLSearchParams(String(path).split('?')[1]);
      if (query.get('offset') === '2') return Promise.resolve({ rows: [{ ...ROWS[1], id: 10 }], total: 3, from: '', to: '' });
      return Promise.resolve({ rows: ROWS, total: 3, from: '', to: '' });
    });
    renderWithProviders(<ReviewsPage />);
    await screen.findByTestId('reviews-summary');
    await userEvent.click(screen.getByRole('button', { name: 'Показати ще (1)' }));
    await waitFor(() => expect(screen.getAllByTestId('review-row')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /Показати ще/ })).not.toBeInTheDocument();
  });

  it('says how to switch feedback on when there is none, and nothing of the kind when a filter emptied the list', async () => {
    posRequest.mockImplementation((method, path) =>
      Promise.resolve(
        String(path).startsWith('/feedback/summary')
          ? { ...SUMMARY, count: 0, average: null, tags: [], unhandled_low: 0, dishes: [] }
          : { rows: [], total: 0, from: '', to: '' }
      )
    );
    renderWithProviders(<ReviewsPage />);
    const empty = await screen.findByTestId('reviews-empty');
    expect(empty).toHaveTextContent('Приймати відгуки гостей');
    expect(within(empty).getByRole('link')).toHaveAttribute('href', '/admin/settings');
    await userEvent.click(screen.getByRole('button', { name: '1 · Погано' }));
    expect(await screen.findByText('За цим фільтром відгуків немає.')).toBeInTheDocument();
  });

  it('tells an owner on an older server that the update is coming, and a waiter that it is the owner’s', async () => {
    posRequest.mockRejectedValue({ response: { status: 404 } });
    const older = renderWithProviders(<ReviewsPage />);
    expect(await screen.findByText(/Сервер ще не знає відгуків/)).toBeInTheDocument();
    older.unmount();
    posRequest.mockRejectedValue({ response: { status: 403 } });
    renderWithProviders(<ReviewsPage />);
    expect(await screen.findByText('Відгуки читає лише власник магазину.')).toBeInTheDocument();
  });
});
