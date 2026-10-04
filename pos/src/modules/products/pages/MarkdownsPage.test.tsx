// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Уцінки» (clothing D2): the live campaigns first with their «Завершити», the
// ended ones under them with what the end step put back and what it left.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { MarkdownView } from '../data/markdownsApi';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { MarkdownsPage } = await import('./MarkdownsPage');

const LIVE: MarkdownView = {
  id: 5,
  name: 'Осінь',
  percent: 30,
  rounding: 1000,
  ends_on: '2026-10-15',
  created_at: '2026-10-04T10:00:00Z',
  ended_at: null,
  ended_reason: null,
  items: 12,
  products: 4,
  restored: null,
  skipped: null,
};

const ENDED: MarkdownView = {
  id: 3,
  name: '',
  percent: 20,
  rounding: 100,
  ends_on: null,
  created_at: '2026-09-01T10:00:00Z',
  ended_at: '2026-09-20T10:00:00Z',
  ended_reason: 'manual',
  items: 6,
  products: 2,
  restored: 5,
  skipped: 1,
};

beforeEach(() => {
  posRequest.mockReset();
  posRequest.mockImplementation((method: string, path: string) => {
    if (method === 'get' && path === '/markdowns') return Promise.resolve([LIVE, ENDED]);
    if (method === 'post' && path === '/markdowns/5/end') return Promise.resolve({ restored: 11, skipped: 1, already: false });
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
});

describe('MarkdownsPage', () => {
  it('lists what is on and what was, in the owner\'s words', async () => {
    renderWithProviders(<MarkdownsPage />);
    const rows = await screen.findAllByTestId('markdown-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Осінь');
    expect(rows[0]).toHaveTextContent('−30 % · до 10 ₴ · варіантів: 12 у 4 товарах · діє до 15.10.2026');
    expect(within(rows[0]!).getByRole('button', { name: 'Завершити' })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Уцінка −20 %');
    expect(rows[1]).toHaveTextContent('завершено вручну');
    expect(rows[1]).toHaveTextContent('Повернуто цін: 5 · залишено як змінені вручну: 1');
    expect(within(rows[1]!).queryByRole('button', { name: 'Завершити' })).toBeNull();
  });

  it('ends a markdown behind a question and reports what went back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarkdownsPage />);
    await user.click(await screen.findByRole('button', { name: 'Завершити' }));

    const sheet = screen.getByTestId('confirm-sheet');
    expect(sheet).toHaveTextContent('Завершити «Осінь»?');
    await user.click(within(sheet).getByTestId('confirm-sheet-ok'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('«Осінь»: повернуто цін — 11, залишено як змінені вручну — 1')
    );
    expect(posRequest.mock.calls.filter((c) => c[1] === '/markdowns/5/end')).toHaveLength(1);
    // Re-read after the write.
    expect(posRequest.mock.calls.filter((c) => c[0] === 'get')).toHaveLength(2);
  });

  it('says so when there has never been one', async () => {
    posRequest.mockImplementation(() => Promise.resolve([]));
    renderWithProviders(<MarkdownsPage />);
    expect(await screen.findByText(/Ще жодної уцінки/)).toBeInTheDocument();
  });
});
