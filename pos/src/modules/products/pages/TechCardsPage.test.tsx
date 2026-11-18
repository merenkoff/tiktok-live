// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Техкарти» — the workbench. What is pinned: a dish with one unpriced
// ingredient shows «—» and the reason, never 0 %; the filters say what cannot
// be trusted; a dish opens its recipe in place and saves only what changed; an
// ingredient's price is typed where it is read and every dish that takes it
// moves; and a replacement says what it will touch before it writes.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const getProducts = vi.fn<[], Promise<Product[]>>();
const getTags = vi.fn();
const listModifierGroups = vi.fn();
const updateVariant = vi.fn();
const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      getProducts: () => getProducts(),
      getTags: () => getTags(),
      listModifierGroups: () => listModifierGroups(),
      updateVariant: (...a: unknown[]) => updateVariant(...a),
      posRequest: (...a: unknown[]) => posRequest(...a),
    },
  };
});

const { TechCardsPage } = await import('./TechCardsPage');

type Part = [variantId: number, quantity: number, name: string];

function product(
  id: number,
  name: string,
  opts: { cost?: number; unit?: string; kind?: 'simple' | 'composite'; mode?: 'own' | 'derived'; sellable?: boolean; parts?: Part[]; price?: number } = {}
): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    kind: opts.kind ?? 'simple',
    stock_mode: opts.mode ?? 'own',
    sellable: opts.sellable ?? false,
    tag_ids: [],
    variants: [
      {
        id: id * 10,
        product_id: id,
        attributes: {},
        label: '',
        unit: opts.unit ?? 'г',
        sku: null,
        barcode: null,
        price_cents: opts.price ?? 0,
        // `cost`: thousandths of a kopeck per base unit, as the server keeps it.
        cost_cents: Math.round((opts.cost ?? 0) / 1000),
        cost_milli: opts.cost ?? 0,
        is_active: true,
        quantity: 5000,
        components: (opts.parts ?? []).map(([variantId, quantity, partName], index) => ({
          id: index + 1,
          component_variant_id: variantId,
          quantity,
          sort_order: index,
          product_name: partName,
          label: '',
          unit: 'г',
        })),
      },
    ],
  } as Product;
}

const dish = (id: number, name: string, price: number, parts: Part[]) =>
  product(id, name, { kind: 'composite', mode: 'derived', sellable: true, price, parts });

const BEEF = product(1, 'Яловичина', { cost: 50_000 });
const BACON = product(2, 'Бекон', { cost: 0 });
const SALT = product(3, 'Сіль', { cost: 1000 });
const BORSCH = dish(5, 'Борщ', 20000, [[10, 100, 'Яловичина'], [30, 20, 'Сіль']]); // 5 020 → 25,1 %
const CARBONARA = dish(6, 'Карбонара', 26500, [[20, 60, 'Бекон']]);
const STEAK = dish(7, 'Стейк', 10000, [[10, 300, 'Яловичина']]); // 15 000 → 150 %
const WATER = product(8, 'Вода 0,5', { sellable: true, price: 3000, unit: 'шт' });

function open(route = '/admin/tech-cards') {
  return renderWithProviders(<TechCardsPage />, { route });
}

beforeEach(() => {
  window.localStorage.clear();
  getProducts.mockResolvedValue([BEEF, BACON, SALT, BORSCH, CARBONARA, STEAK, WATER]);
  getTags.mockResolvedValue([]);
  listModifierGroups.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TechCardsPage', () => {
  it('says out loud which prices the cost is built from', async () => {
    open();
    expect(await screen.findByText(/за останніми цінами закупівлі/)).toBeInTheDocument();
  });

  it('lists the dishes worst first, with «—» and a named reason instead of 0 %', async () => {
    open();
    await screen.findByTestId('tech-card-5');
    const cards = screen.getAllByTestId(/^tech-card-\d+$/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['tech-card-7', 'tech-card-5', 'tech-card-6']);

    expect(within(screen.getByTestId('tech-card-5')).getByTestId('tech-food-cost')).toHaveTextContent('25,1 %');
    // Sold at a loss: red, and said in words.
    const steak = within(screen.getByTestId('tech-card-7'));
    expect(steak.getByTestId('tech-food-cost')).toHaveTextContent('150,0 %');
    expect(steak.getByText('дорожче за ціну')).toBeInTheDocument();
    // One unpriced ingredient: no percentage at all, and which one.
    const carbonara = within(screen.getByTestId('tech-card-6'));
    expect(carbonara.queryByTestId('tech-food-cost')).not.toBeInTheDocument();
    expect(carbonara.getByTestId('tech-reason')).toHaveTextContent('немає ціни: Бекон');
    expect(screen.queryByText('0,0 %')).not.toBeInTheDocument();
  });

  it('filters to what cannot be trusted, to what is over the owner’s own target, and to what has no recipe', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByTestId('tech-card-5');
    expect(screen.getByTestId('tech-filter-attention')).toHaveTextContent('Потребують уваги2');
    // No target yet: nothing is «over» anything.
    expect(screen.queryByTestId('tech-filter-over')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tech-filter-attention'));
    expect(screen.queryByTestId('tech-card-5')).not.toBeInTheDocument();
    expect(screen.getByTestId('tech-card-6')).toBeInTheDocument();
    expect(screen.getByTestId('tech-card-7')).toBeInTheDocument();

    await user.type(screen.getByTestId('tech-target'), '20');
    await user.tab();
    expect(await screen.findByTestId('tech-filter-over')).toHaveTextContent('Вище цілі 20,0 %1');
    await user.click(screen.getByTestId('tech-filter-over'));
    expect(screen.getAllByTestId(/^tech-card-\d+$/).map((c) => c.getAttribute('data-testid'))).toEqual(['tech-card-5']);

    await user.click(screen.getByTestId('tech-filter-none'));
    expect(screen.getByTestId('tech-bare-8')).toHaveTextContent('Вода 0,5');
    expect(within(screen.getByTestId('tech-bare-8')).getByRole('link', { name: 'Додати рецепт' })).toHaveAttribute(
      'href',
      '/admin/products/8#recipe'
    );
  });

  it('opens on the filter the sidebar’s count points at', async () => {
    open('/admin/tech-cards?show=attention');
    await screen.findByTestId('tech-card-6');
    expect(screen.queryByTestId('tech-card-5')).not.toBeInTheDocument();
    expect(screen.getByTestId('tech-filter-attention')).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a recipe in place and saves only the size that changed — its lines and its price', async () => {
    const user = userEvent.setup();
    updateVariant.mockResolvedValue(BORSCH);
    open();
    await user.click(await screen.findByTestId('tech-card-5'));
    const dialog = within(await screen.findByTestId('recipe-dialog'));
    expect(dialog.getByTestId('recipe-totals')).toHaveTextContent('Собівартість 50,20 ₴');
    expect(dialog.getByTestId('recipe-dialog-save')).toBeDisabled();

    // «What if it cost 250»: the food cost follows the price as it is typed.
    const price = dialog.getByTestId('recipe-dialog-price');
    await user.clear(price);
    await user.type(price, '250');
    expect(dialog.getByTestId('recipe-food-cost')).toHaveTextContent('20,1 %');

    const beef = within(dialog.getAllByTestId('composition-row')[0]).getByLabelText('Кількість');
    await user.clear(beef);
    await user.type(beef, '120');
    await user.click(dialog.getByTestId('recipe-dialog-save'));

    await waitFor(() => expect(updateVariant).toHaveBeenCalledTimes(1));
    expect(updateVariant).toHaveBeenCalledWith(50, {
      components: [
        { component_variant_id: 10, quantity: 120, loss_bps: 0 },
        { component_variant_id: 30, quantity: 20, loss_bps: 0 },
      ],
      price_cents: 25000,
    });
    await waitFor(() => expect(screen.queryByTestId('recipe-dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('tech-cards-flash')).toHaveTextContent('«Борщ»: рецепт збережено.');
    // The list is read again: the figures on it are the server's.
    expect(getProducts).toHaveBeenCalledTimes(2);
  });

  it('shows the server’s refusal in its own words and keeps the recipe open', async () => {
    const user = userEvent.setup();
    updateVariant.mockRejectedValue({ response: { data: { error: 'Component 10 listed twice' } } });
    open();
    await user.click(await screen.findByTestId('tech-card-5'));
    const dialog = within(await screen.findByTestId('recipe-dialog'));
    const salt = within(dialog.getAllByTestId('composition-row')[1]).getByLabelText('Кількість');
    await user.clear(salt);
    await user.type(salt, '25');
    await user.click(dialog.getByTestId('recipe-dialog-save'));
    expect(await dialog.findByTestId('recipe-dialog-error')).toHaveTextContent('Component 10 listed twice');
    expect(screen.getByTestId('recipe-dialog')).toBeInTheDocument();
  });

  it('lands on a dish’s recipe from the sidebar’s search', async () => {
    open('/admin/tech-cards?open=6');
    const dialog = within(await screen.findByTestId('recipe-dialog'));
    expect(dialog.getByRole('heading', { name: 'Карбонара' })).toBeInTheDocument();
  });

  it('lists what is bought — unpriced first — with where it goes, and takes a new price where it is read', async () => {
    const user = userEvent.setup();
    updateVariant.mockResolvedValue({ ...BACON, variants: [{ ...BACON.variants[0], cost_cents: 55, cost_milli: 55_000 }] });
    open('/admin/tech-cards?tab=ingredients');
    await screen.findByTestId('ingredient-row-20');
    const rows = screen.getAllByTestId(/^ingredient-row-\d+$/).map((r) => r.getAttribute('data-testid'));
    expect(rows).toEqual(['ingredient-row-20', 'ingredient-row-30', 'ingredient-row-10']);

    // Where the beef goes — a tap away.
    await user.click(screen.getByTestId('ingredient-uses-10'));
    expect(within(screen.getByTestId('ingredient-used-10')).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Борщ',
      'Стейк',
    ]);

    // 550 ₴ за кг is 55 коп за грам, written at once.
    const price = screen.getByTestId('ingredient-price-20');
    expect(price).toHaveValue('');
    await user.type(price, '550{Enter}');
    await waitFor(() => expect(updateVariant).toHaveBeenCalledWith(20, { cost_milli: 55_000 }));
    expect(await screen.findByTestId('tech-cards-flash')).toHaveTextContent(
      '«Бекон»: ціну збережено, собівартість перераховано в 1 рецепті.'
    );
    // And the dish that had no honest cost has one now, without a reload.
    await user.click(screen.getByTestId('tech-tab-dishes'));
    // 60 г × 55 коп = 33 ₴ of 265 ₴ — 12,45 %, however the last digit rounds.
    expect(within(await screen.findByTestId('tech-card-6')).getByTestId('tech-food-cost')).toHaveTextContent(/12,[45] %/);
  });

  it('takes an ingredient’s usual loss where its price is, and «not said» for an emptied box', async () => {
    const user = userEvent.setup();
    updateVariant.mockResolvedValue({ ...BEEF, variants: [{ ...BEEF.variants[0], prep_loss_bps: 1250 }] });
    open('/admin/tech-cards?tab=ingredients');
    const loss = await screen.findByTestId('ingredient-loss-10');
    expect(loss).toHaveValue('');
    await user.type(loss, '12,5{Enter}');
    await waitFor(() => expect(updateVariant).toHaveBeenCalledWith(10, { prep_loss_bps: 1250 }));
    expect(await screen.findByTestId('tech-cards-flash')).toHaveTextContent(
      '«Яловичина»: відходи 12,5 % — підставлятимуться в нові рядки рецептів.'
    );
    await waitFor(() => expect(screen.getByTestId('ingredient-loss-10')).toHaveValue('12,5'));

    // 150 % is not a loss: nothing is sent.
    updateVariant.mockClear();
    await user.clear(screen.getByTestId('ingredient-loss-10'));
    await user.type(screen.getByTestId('ingredient-loss-10'), '150{Enter}');
    expect(await screen.findByText('від 0 до 99')).toBeInTheDocument();
    expect(updateVariant).not.toHaveBeenCalled();

    // Emptied: «not said», which is null on the wire — not 0 %.
    updateVariant.mockResolvedValue(BEEF);
    await user.clear(screen.getByTestId('ingredient-loss-10'));
    await user.tab();
    await waitFor(() => expect(updateVariant).toHaveBeenCalledWith(10, { prep_loss_bps: null }));
  });

  it('prints the recipe that is on screen as a sheet of weights, with no money on it', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    open();
    await user.click(await screen.findByTestId('tech-card-5'));
    const dialog = within(await screen.findByTestId('recipe-dialog'));
    // Unsaved edits are printed too: what the cook is handed is what the owner sees.
    await user.click(dialog.getByTestId('recipe-gross-net'));
    await user.type(dialog.getByLabelText('Втрати «Яловичина», %'), '20');
    await user.click(dialog.getByTestId('recipe-print'));

    const sheet = within(await screen.findByTestId('tech-card-printable'));
    expect(sheet.getByRole('heading', { name: 'Технологічна карта' })).toBeInTheDocument();
    expect(sheet.getByText(/Борщ · на 1 порцію/)).toBeInTheDocument();
    const rows = sheet.getAllByRole('row').map((row) => row.textContent);
    expect(rows).toEqual(['СкладникБруттоНеттоВтрати, %', 'Яловичина100 г80 г20', 'Сіль20 г20 г']);
    expect(sheet.getByText('Вихід: ≈ 100 г')).toBeInTheDocument();
    expect(screen.getByTestId('tech-card-printable').textContent).not.toMatch(/₴/);
    await waitFor(() => expect(print).toHaveBeenCalled());
    print.mockRestore();
  });

  it('replaces an ingredient everywhere: says what it will touch, never sends an empty multiplier', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValue({ recipes: 2, products: 2, modifiers: 0 });
    open('/admin/tech-cards?tab=ingredients');
    await user.click(await screen.findByTestId('ingredient-replace-10'));
    const dialog = within(await screen.findByTestId('replace-ingredient-dialog'));
    expect(dialog.getByTestId('replace-preview')).toHaveTextContent('Зміниться 2 рецепти');
    expect(dialog.getByTestId('replace-save')).toBeDisabled();

    await user.type(dialog.getByRole('combobox', { name: 'На що замінити' }), 'бекон');
    await user.click(dialog.getByRole('option', { name: /Бекон/ }));
    await user.clear(dialog.getByTestId('replace-factor'));
    expect(dialog.getByTestId('replace-save')).toBeDisabled();
    expect(dialog.getByText(/порожнім він не буває/)).toBeInTheDocument();
    await user.type(dialog.getByTestId('replace-factor'), '0,8');
    await user.click(dialog.getByTestId('replace-save'));

    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('post', '/products/components/replace', {
        from_variant_id: 10,
        to_variant_id: 20,
        factor: 0.8,
        include_modifiers: false,
      })
    );
    expect(await screen.findByTestId('tech-cards-flash')).toHaveTextContent('«Яловичина» замінено на «Бекон»: 2 рецепти.');
  });

  it('explains itself to a shop with no recipes yet', async () => {
    getProducts.mockResolvedValue([BEEF, WATER]);
    open();
    expect(await screen.findByTestId('tech-empty')).toHaveTextContent(/які збирають зі складників/);
  });
});
