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
  readReport: vi.fn<typeof Api.readReport>(async () => []),
  readReportSides: vi.fn<typeof Api.readReportSides>(async () => null),
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
  readReport: (side: 'cafe' | 'kitchen', days: number) => api.readReport(side, days),
  readReportSides: () => api.readReportSides(),
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

afterEach(() => {
  vi.clearAllMocks();
  api.readReport.mockImplementation(async () => []);
  api.readReportSides.mockImplementation(async () => null);
});

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
      { variant_id: 12, name: 'Карбонара', label: '', prep_minutes: 12, measured_minutes: 17, measured_orders: 22 },
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
          measured_minutes: 21,
          measured_orders: 6,
        },
      ],
    });
    render(<RemoteKitchenPage />);

    const list = await screen.findByTestId('rk-import');
    // The time the kitchen will actually answer with, once its orders measured it.
    expect(list).toHaveTextContent('Карбонара · ≈17 хв за 22 замовлення');
    expect(list).toHaveTextContent('Маргарита (32 см) · ≈15 хв');
    await user.click(within(list).getByRole('checkbox', { name: /Маргарита \(32 см\)/ }));
    await user.click(screen.getByRole('button', { name: /Додати в меню кафе/ }));
    expect(api.importDishes).not.toHaveBeenCalled();
    expect(screen.getByText(/Вкажіть ціну кафе: Маргарита \(32 см\)/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Ціна кафе: Маргарита (32 см)' }), '230,50');
    await user.click(screen.getByRole('button', { name: /Додати в меню кафе/ }));
    expect(api.importDishes).toHaveBeenCalledWith([{ kitchen_variant_id: 11, price_cents: 23050 }]);

    // Marked now, and gone from what is left to import.
    await waitFor(() => expect(screen.getByTestId('rk-marked')).toHaveTextContent('Маргарита (32 см)'));
    expect(screen.getByTestId('rk-marked')).toHaveTextContent('≈21 хв за 6 замовлень');
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
          dishes: [
            { variant_id: 11, name: 'Маргарита', label: '32 см', prep_minutes: 15 },
            { variant_id: 12, name: 'Тірамісу', label: '', prep_minutes: 10, measured_minutes: 14, measured_orders: 9 },
          ],
        },
      ],
    });
    api.saveStatus.mockResolvedValue({ accepting: false, paused_until: '2026-11-25T13:00:00Z', load_minutes: 0 });
    render(<RemoteKitchenPage />);

    expect(await screen.findByTestId('rk-cafes')).toHaveTextContent('Пульчинелла Парк');
    expect(screen.getByTestId('rk-cafes')).toHaveTextContent('Маргарита (32 см) ≈15 хв');
    // A dish the kitchen's own orders measured shows that time — the one the suggestion uses.
    expect(screen.getByTestId('rk-cafes')).toHaveTextContent('Тірамісу ≈14 хв за 9 замовлень');
    await user.click(screen.getByRole('button', { name: 'Пауза 30 хв' }));
    expect(api.saveStatus).toHaveBeenCalledWith({ accepting: false, pause_minutes: 30 });
    expect(await screen.findByRole('button', { name: 'Відновити прийом' })).toBeInTheDocument();
  });

  it('says which reused cafe cards kept their own price', async () => {
    const user = userEvent.setup();
    api.readSetup.mockResolvedValue({ as_cafe: { link: LINK, kitchen: OPEN }, as_kitchen: null });
    api.listItems.mockResolvedValue([]);
    api.listDishes.mockResolvedValue([{ variant_id: 12, name: 'Карбонара', label: '', prep_minutes: 12 }]);
    api.importDishes.mockResolvedValue({
      created: 0,
      linked: 1,
      skipped: 0,
      kept_prices: [{ name: 'Карбонара', price_cents: 18000 }],
      items: [],
    });
    render(<RemoteKitchenPage />);
    await user.type(await screen.findByRole('textbox', { name: 'Ціна кафе: Карбонара' }), '230');
    await user.click(screen.getByRole('button', { name: /Додати в меню кафе/ }));
    expect(await screen.findByText(/Ціну не змінено — у картці лишилась своя: Карбонара — 180,00/)).toBeInTheDocument();
  });

  it('reads the marked dishes again when an import is refused', async () => {
    const user = userEvent.setup();
    api.readSetup.mockResolvedValue({ as_cafe: { link: LINK, kitchen: OPEN }, as_kitchen: null });
    api.listItems.mockResolvedValue([]);
    api.listDishes.mockResolvedValue([{ variant_id: 12, name: 'Карбонара', label: '', prep_minutes: 12 }]);
    api.importDishes.mockRejectedValue({ response: { data: { error: '«Карбонара»: не вдалося' } } });
    render(<RemoteKitchenPage />);
    await user.type(await screen.findByRole('textbox', { name: 'Ціна кафе: Карбонара' }), '230');
    await user.click(screen.getByRole('button', { name: /Додати в меню кафе/ }));
    expect(await screen.findByText('«Карбонара»: не вдалося')).toBeInTheDocument();
    await waitFor(() => expect(api.listItems).toHaveBeenCalledTimes(2));
  });

  it('keeps a quote time in seconds, so a save does not round it to minutes', async () => {
    const user = userEvent.setup();
    api.readSetup.mockResolvedValue({ as_cafe: { link: { ...LINK, quote_ttl_seconds: 90 }, kitchen: OPEN }, as_kitchen: null });
    api.listItems.mockResolvedValue([]);
    api.listDishes.mockResolvedValue([]);
    api.saveLink.mockImplementation(async (b) => ({ ...LINK, ...b }) as Api.CafeLink);
    render(<RemoteKitchenPage />);
    const phone = await screen.findByRole('textbox', { name: 'Телефон кухні' });
    await user.clear(phone);
    await user.type(phone, '+380671112233');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(api.saveLink).toHaveBeenCalledWith(expect.objectContaining({ quote_ttl_seconds: 90 }));
  });

  it('reads the kitchen again the moment a timed pause runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const until = new Date(Date.now() + 5_000).toISOString();
      api.readSetup.mockResolvedValue({ as_cafe: null, as_kitchen: { status: OPEN } });
      api.listCafes
        .mockResolvedValueOnce({ status: { accepting: false, paused_until: until, load_minutes: 0 }, cafes: [] })
        .mockResolvedValue({ status: OPEN, cafes: [] });
      render(<RemoteKitchenPage />);
      expect(await screen.findByRole('button', { name: 'Відновити прийом' })).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(7_000);
      expect(await screen.findByRole('button', { name: 'Пауза 30 хв' })).toBeInTheDocument();
      expect(api.listCafes).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('«Віддано на точки»: by cafe, the promises kept, the cost and the dishes by size, for the period picked', async () => {
    api.readSetup.mockResolvedValue({ as_cafe: null, as_kitchen: { status: OPEN, cafes: [] } } as never);
    api.listCafes.mockResolvedValue({ cafes: [], status: OPEN });
    api.readReport.mockImplementation(async (_side, days) => [
      {
        store_id: 3,
        store_name: 'Пульчинелла Парк',
        orders: days === 30 ? 40 : 10,
        cancelled: 3,
        cancelled_kitchen: 1,
        on_time: 8,
        on_time_moved: 9,
        delayed: 2,
        cost_cents: 123450,
        unpriced_lines: 1,
        dishes: [
          { name: 'Маргарита', label: '30 см', quantity: 9 },
          { name: 'Маргарита', label: '50 см', quantity: 5 },
        ],
      },
    ]);
    const user = userEvent.setup();
    render(<RemoteKitchenPage />);
    const report = await screen.findByTestId('rk-report-kitchen');
    expect(api.readReport).toHaveBeenLastCalledWith('kitchen', 7);
    // By the time the guest was told; what «+N хв» bought is said apart.
    expect(await within(report).findByText(/8 з 10 вчасно \(80 %\)/)).toBeInTheDocument();
    expect(report).toHaveTextContent('переносили 2, з переносом вчасно 9');
    // Whose cancels: the kitchen's one, the cafe's two.
    expect(report).toHaveTextContent('скасувала кухня 1, кафе 2');
    expect(report).toHaveTextContent(/Собівартість 1\s?234,50/);
    expect(report).toHaveTextContent('без ціни закупівлі: 1 поз.');
    expect(report).toHaveTextContent('Маргарита 30 см × 9, Маргарита 50 см × 5');

    expect(within(report).getByRole('button', { name: 'Сьогодні' })).toBeInTheDocument();
    await user.click(within(report).getByRole('button', { name: '30 днів' }));
    expect(api.readReport).toHaveBeenLastCalledWith('kitchen', 30);
    expect(await within(report).findByText(/8 з 40 вчасно/)).toBeInTheDocument();
    expect(screen.queryByTestId('rk-report-cafe')).toBeNull();
  });

  it('tells two points with one name apart, keyed by store', async () => {
    api.readSetup.mockResolvedValue({ as_cafe: null, as_kitchen: { status: OPEN, cafes: [] } } as never);
    api.listCafes.mockResolvedValue({ cafes: [], status: OPEN });
    const row = (id: number, address: string | null) => ({
      store_id: id,
      store_name: 'Пульчинелла',
      store_address: address,
      orders: 1,
      cancelled: 0,
      on_time: 1,
      delayed: 0,
      dishes: [],
    });
    api.readReport.mockResolvedValue([row(3, 'Вхід 1'), row(4, null)]);
    render(<RemoteKitchenPage />);
    expect(await screen.findByTestId('rk-report-row-3')).toHaveTextContent('Пульчинелла (Вхід 1)');
    expect(screen.getByTestId('rk-report-row-4')).toHaveTextContent('Пульчинелла (№ 4)');
  });

  it('keeps the report after the link is revoked, and says why there is no link', async () => {
    api.readSetup.mockResolvedValue({ as_cafe: null, as_kitchen: null });
    api.readReportSides.mockResolvedValue(['kitchen']);
    render(<RemoteKitchenPage />);
    expect(await screen.findByTestId('rk-report-kitchen')).toBeInTheDocument();
    expect(screen.getByTestId('rk-not-linked')).toHaveTextContent('Звіт за замовлення, що вже були');
    expect(screen.queryByTestId('rk-report-cafe')).toBeNull();
  });
});
