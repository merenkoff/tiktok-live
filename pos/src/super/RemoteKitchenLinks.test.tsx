// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Віддалена кухня» on a store's card (РК4): the button that links a cafe to a
// kitchen, and a revoke that asks once.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SuperKitchenLink, SuperStoreRow } from './superApi';

const remoteKitchenLinks = vi.fn<(storeId: number) => Promise<SuperKitchenLink[]>>();
const listStores = vi.fn<() => Promise<SuperStoreRow[]>>();
const createRemoteKitchenLink = vi.fn<(body: Record<string, unknown>) => Promise<void>>();
const setRemoteKitchenLinkStatus = vi.fn<(id: number, status: string) => Promise<void>>();

vi.mock('./superApi', async () => {
  const real = await vi.importActual<typeof import('./superApi')>('./superApi');
  return {
    ...real,
    superApi: {
      remoteKitchenLinks: (id: number) => remoteKitchenLinks(id),
      listStores: () => listStores(),
      createRemoteKitchenLink: (body: Record<string, unknown>) => createRemoteKitchenLink(body),
      setRemoteKitchenLinkStatus: (id: number, status: string) => setRemoteKitchenLinkStatus(id, status),
    },
  };
});

const { RemoteKitchenLinks } = await import('./RemoteKitchenLinks');

const store = (over: Partial<SuperStoreRow>): SuperStoreRow => ({
  id: 1,
  name: 'Пульчинелла Парк',
  slug: 'pulcinella-park',
  currency: 'UAH',
  created_at: '2026-11-25T00:00:00Z',
  vertical: 'cafe',
  enabled_modules: [],
  module_remotes: {},
  live_tiktok_username: null,
  fiscal: { enabled: false, provider: null },
  staff_count: 1,
  last_sale_at: null,
  ...over,
});

const link: SuperKitchenLink = {
  id: 7,
  cafe_store_id: 1,
  kitchen_store_id: 2,
  cafe_name: 'Пульчинелла Парк',
  kitchen_name: 'Пульчинелла Кухня',
  status: 'active',
  kitchen_title: 'Кухня Пульчинелли',
  kitchen_phone: null,
  transit_minutes: 10,
};

afterEach(() => vi.clearAllMocks());

describe('RemoteKitchenLinks', () => {
  it('links this cafe to a kitchen picked from the café stores, named after it by default', async () => {
    const user = userEvent.setup();
    remoteKitchenLinks.mockResolvedValueOnce([]).mockResolvedValueOnce([link]);
    listStores.mockResolvedValue([
      store({}),
      store({ id: 2, name: 'Пульчинелла Кухня', slug: 'pulcinella-kitchen' }),
      store({ id: 3, name: 'Бутик', slug: 'boutique', vertical: 'clothing' }),
    ]);
    createRemoteKitchenLink.mockResolvedValue();
    render(<RemoteKitchenLinks store={store({})} />);

    expect(await screen.findByText('Зв’язок немає.')).toBeInTheDocument();
    const picker = screen.getByRole('combobox', { name: 'Кухня' });
    await waitFor(() => expect(screen.getByRole('option', { name: /Пульчинелла Кухня/ })).toBeInTheDocument());
    // Only a café cooks; the store itself is not offered.
    expect(screen.queryByRole('option', { name: /Бутик/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /pulcinella-park/ })).toBeNull();

    await user.selectOptions(picker, '2');
    await user.click(screen.getByRole('button', { name: 'Зв’язати' }));

    expect(createRemoteKitchenLink).toHaveBeenCalledWith({
      cafe_store_id: 1,
      kitchen_store_id: 2,
      kitchen_title: 'Кухня Пульчинелла Кухня',
      kitchen_phone: null,
      transit_minutes: 10,
    });
    expect(await screen.findByText(/Кухня: Пульчинелла Кухня/)).toBeInTheDocument();
  });

  it('revokes only after a second tap', async () => {
    const user = userEvent.setup();
    remoteKitchenLinks.mockResolvedValue([link]);
    listStores.mockResolvedValue([]);
    setRemoteKitchenLinkStatus.mockResolvedValue();
    render(<RemoteKitchenLinks store={store({})} />);

    await user.click(await screen.findByRole('button', { name: 'Відкликати' }));
    expect(setRemoteKitchenLinkStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Так, відкликати' }));
    expect(setRemoteKitchenLinkStatus).toHaveBeenCalledWith(7, 'revoked');
  });

  it('shows nothing on a store that does not cook', () => {
    remoteKitchenLinks.mockResolvedValue([]);
    listStores.mockResolvedValue([]);
    const { container } = render(<RemoteKitchenLinks store={store({ vertical: 'clothing' })} />);
    expect(container).toBeEmptyDOMElement();
    expect(remoteKitchenLinks).not.toHaveBeenCalled();
  });
});
