// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Історія змін меню» (migration 101): the store's journal newest first, who
// and when, each change in words, a card's own history behind `?product=`, and
// «Показати ще» while the server has more.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { MenuChangeRow } from '../data/menuChangesApi';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { MenuChangesPage } = await import('./MenuChangesPage');

const row = (over: Partial<MenuChangeRow>): MenuChangeRow => ({
  id: 1,
  entity: 'product',
  entity_id: 42,
  entity_name: 'Капучино',
  staff_id: 7,
  staff_name: 'Оля',
  staff_role: 'marketer',
  action: 'update',
  changes: [{ field: 'variant.price_cents', variant: 'M', from: 5500, to: 6000 }],
  created_at: '2026-11-12T10:05:00Z',
  ...over,
});

beforeEach(() => posRequest.mockReset());

describe('MenuChangesPage', () => {
  it('lists the store’s changes with the author, the card and the change in words, and pages on', async () => {
    posRequest.mockImplementation((_m: string, path?: string) =>
      Promise.resolve(
        String(path ?? '').includes('offset=1')
          ? { changes: [row({ id: 2, entity: 'modifier_group', entity_id: 3, entity_name: 'Сироп', action: 'create', changes: [] })], total: 2 }
          : { changes: [row({})], total: 2 }
      )
    );
    renderWithProviders(<MenuChangesPage />, { route: '/admin/products/history' });

    expect(await screen.findByText('Ціна (M): 55,00 ₴ → 60,00 ₴')).toBeInTheDocument();
    expect(screen.getByText(/Оля \(маркетолог\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Капучино' })).toHaveAttribute('href', '/admin/products/42');
    expect(posRequest).toHaveBeenCalledWith('get', '/menu-changes?limit=50&offset=0');

    await userEvent.click(screen.getByRole('button', { name: 'Показати ще' }));
    expect(await screen.findByRole('link', { name: 'Модифікатор «Сироп»' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Показати ще' })).not.toBeInTheDocument());
  });

  it('shows one card’s history behind ?product=', async () => {
    posRequest.mockResolvedValue({ changes: [row({})], total: 1 });
    renderWithProviders(<MenuChangesPage />, { route: '/admin/products/history?product=42' });
    expect(await screen.findByRole('heading', { name: 'Історія змін: Капучино' })).toBeInTheDocument();
    expect(posRequest).toHaveBeenCalledWith('get', '/menu-changes?entity=product&entity_id=42&limit=50&offset=0');
    expect(screen.queryByRole('link', { name: 'Капучино' })).not.toBeInTheDocument();
  });

  it('says there is nothing yet, and an error in words', async () => {
    posRequest.mockResolvedValueOnce({ changes: [], total: 0 });
    const { unmount } = renderWithProviders(<MenuChangesPage />, { route: '/admin/products/history' });
    expect(await screen.findByText(/Ще немає записів/)).toBeInTheDocument();
    unmount();

    posRequest.mockRejectedValueOnce(new Error('boom'));
    renderWithProviders(<MenuChangesPage />, { route: '/admin/products/history' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
