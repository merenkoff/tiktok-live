// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's «Віддалена кухня» (РК4): the side the setup names is the side
// drawn; the cafe saves its timers and imports the kitchen's dishes at its own
// prices; the kitchen pauses and resumes.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Api from './settingsApi';

const api = {
  readSetup: vi.fn<typeof Api.readSetup>(),
  saveLink: vi.fn<typeof Api.saveLink>(),
  listItems: vi.fn<typeof Api.listItems>(),
  listDishes: vi.fn<typeof Api.listDishes>(),
  unmark: vi.fn<typeof Api.unmark>(),
  importDishes: vi.fn<typeof Api.importDishes>(),
  listCafes: vi.fn<typeof Api.listCafes>(),
  saveStatus: vi.fn<typeof Api.saveStatus>(),
};

vi.mock('./settingsApi', () => ({
  readSetup: () => api.readSetup(),
  saveLink: (b: Api.LinkSettings) => api.saveLink(b),
  listItems: () => api.listItems(),
  listDishes: () => api.listDishes(),
  unmark: (id: number) => api.unmark(id),
  importDishes: (d: Parameters<typeof Api.importDishes>[0]) => api.importDishes(d),
  listCafes: () => api.listCafes(),
  saveStatus: (b: Parameters<typeof Api.saveStatus>[0]) => api.saveStatus(b),
}));

const { RemoteKitchenPage } = await import('./RemoteKitchenPage');

const LINK: Api.CafeLink = {
  id: 3,
  status: 'active',
  kitchen_title: 'Кухня Пульчинелли',
  kitchen_phone: '+380000000000',
  transit_minutes: 10,
  answer_seconds: 60,
  quote_ttl_seconds: 180,
  auto_confirm_max_min: 40,
};
const OPEN: Api.KitchenStatus = { accepting: true, paused_until: null, load_minutes: 0 };

afterEach(() => vi.clearAllMocks());

describe('RemoteKitchenPage', () => {
  it('tells a store with no link who links stores, and asks nothing more', async () => {
    api.readSetup.mockResolvedValue({ as_cafe: null, as_kitchen: null });
    render(<RemoteKitchenPage />);
    expect(await screen.findByTestId('rk-not-linked')).toHaveTextContent('адміністратор');
    expect(api.listItems).not.toHaveBeenCalled();
    expect(api.listCafes).not.toHaveBeenCalled();
  });

  it('the cafe turns auto-confirm off and saves its timers', async () => {
    const user = userEvent.setup();
    api.readSetup.mockResolvedValue({ as_cafe: { link: LINK, kitchen: OPEN }, as_kitchen: null });
    api.listItems.mockResolvedValue([]);
    api.listDishes.mockResolvedValue([]);
    api.saveLink.mockImplementation(async (b) => ({ ...LINK, ...b }) as Api.CafeLink);
    render(<RemoteKitchenPage />);

    await user.click(await screen.findByRole('checkbox', { name: 'Автопідтвердження' }));
    const answer = screen.getByRole('textbox', { name: /Скільки чекати відповіді/ });
    await user.clear(answer);
    await user.type(answer, '90');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(api.saveLink).toHaveBeenCalledWith({
      kitchen_title: 'Кухня Пульчинелли',
      kitchen_phone: '+380000000000',
      transit_minutes: 10,
      answer_seconds: 90,
      quote_ttl_seconds: 180,
      auto_confirm_max_min: null,
    });
    expect(await screen.findByText('Збережено')).toBeInTheDocument();
  });

  it('imports a kitchen dish only with the cafe’s own price', async () => {
    const user = userEvent.setup();
    api.readSetup.mockResolvedValue({ as_cafe: { link: LINK, kitchen: OPEN }, as_kitchen: null });
    api.listItems.mockResolvedValue([]);
    api.listDishes.mockResolvedValue([
      { variant_id: 11, name: 'Маргарита', label: '32 см', prep_minutes: 15 },
      { variant_id: 12, name: 'Карбонара', label: '', prep_minutes: 12 },
    ]);
    api.importDishes.mockResolvedValue({
      created: 1,
      linked: 1,
      skipped: 0,
      items: [
        {
          cafe_variant_id: 501,
          kitchen_variant_id: 11,
          cafe_name: 'Маргарита (32 см)',
          cafe_label: '',
          kitchen_name: 'Маргарита',
          kitchen_label: '32 см',
          prep_minutes: 15,
        },
      ],
    });
    render(<RemoteKitchenPage />);

    const list = await screen.findByTestId('rk-import');
    await user.click(within(list).getByRole('checkbox', { name: /Маргарита \(32 см\)/ }));
    await user.click(screen.getByRole('button', { name: /Додати в меню кафе/ }));
    expect(api.importDishes).not.toHaveBeenCalled();
    expect(screen.getByText(/Вкажіть ціну кафе: Маргарита \(32 см\)/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Ціна кафе: Маргарита (32 см)' }), '230,50');
    await user.click(screen.getByRole('button', { name: /Додати в меню кафе/ }));
    expect(api.importDishes).toHaveBeenCalledWith([{ kitchen_variant_id: 11, price_cents: 23050 }]);

    // Marked now, and gone from what is left to import.
    await waitFor(() => expect(screen.getByTestId('rk-marked')).toHaveTextContent('Маргарита (32 см)'));
    expect(within(screen.getByTestId('rk-import')).queryByText(/Маргарита/)).toBeNull();
  });

  it('the kitchen pauses for half an hour and sees its cafes', async () => {
    const user = userEvent.setup();
    api.readSetup.mockResolvedValue({ as_cafe: null, as_kitchen: { status: OPEN } });
    api.listCafes.mockResolvedValue({
      status: OPEN,
      cafes: [
        {
          link_id: 3,
          cafe_name: 'Пульчинелла Парк',
          status: 'active',
          transit_minutes: 10,
          dishes: [{ variant_id: 11, name: 'Маргарита', label: '32 см', prep_minutes: 15 }],
        },
      ],
    });
    api.saveStatus.mockResolvedValue({ accepting: false, paused_until: '2026-11-25T13:00:00Z', load_minutes: 0 });
    render(<RemoteKitchenPage />);

    expect(await screen.findByTestId('rk-cafes')).toHaveTextContent('Пульчинелла Парк');
    expect(screen.getByTestId('rk-cafes')).toHaveTextContent('Маргарита (32 см) ≈15 хв');
    await user.click(screen.getByRole('button', { name: 'Пауза 30 хв' }));
    expect(api.saveStatus).toHaveBeenCalledWith({ accepting: false, pause_minutes: 30 });
    expect(await screen.findByRole('button', { name: 'Відновити прийом' })).toBeInTheDocument();
  });
});
