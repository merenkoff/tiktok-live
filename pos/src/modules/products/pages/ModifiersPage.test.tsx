// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Модифікатори» — the owner's questions and answers.
//
// What is pinned here is the contract with the server: a group leaves with
// its range, an answer leaves with a SIGNED delta in kopecks («-20» is a
// discount, not 0) and, when it takes something off the shelf, with the
// variant and the quantity; and a refusal comes back in the server's words.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { ModifierGroup, Product } from '../../../types';

const listModifierGroups = vi.fn<[], Promise<ModifierGroup[]>>();
const getProducts = vi.fn<[], Promise<Product[]>>();
const createModifierGroup = vi.fn();
const updateModifierGroup = vi.fn();
const deleteModifierGroup = vi.fn();
const createModifier = vi.fn();
const updateModifier = vi.fn();
const deleteModifier = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      listModifierGroups: () => listModifierGroups(),
      getProducts: () => getProducts(),
      createModifierGroup: (...a: unknown[]) => createModifierGroup(...a),
      updateModifierGroup: (...a: unknown[]) => updateModifierGroup(...a),
      deleteModifierGroup: (...a: unknown[]) => deleteModifierGroup(...a),
      createModifier: (...a: unknown[]) => createModifier(...a),
      updateModifier: (...a: unknown[]) => updateModifier(...a),
      deleteModifier: (...a: unknown[]) => deleteModifier(...a),
    },
  };
});

const { ModifiersPage } = await import('./ModifiersPage');
const { signedUahInputToCents } = await import('../components/modifierInput');

const milk: ModifierGroup = {
  id: 1,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  sort_order: 0,
  is_active: true,
  modifiers: [
    {
      id: 11,
      group_id: 1,
      name: 'звичайне',
      price_delta_cents: 0,
      component_variant_id: 20,
      component_quantity: 200,
      component: { product_name: 'Молоко', label: '', unit: 'мл' },
      is_default: true,
      sort_order: 0,
      is_active: true,
    },
    {
      id: 12,
      group_id: 1,
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: 21,
      component_quantity: 200,
      component: { product_name: 'Молоко вівсяне', label: '', unit: 'мл' },
      is_default: false,
      sort_order: 1,
      is_active: true,
    },
  ],
};

const portion: ModifierGroup = {
  id: 2,
  name: 'Порція',
  min_select: 0,
  max_select: 1,
  sort_order: 1,
  is_active: true,
  modifiers: [
    {
      id: 21,
      group_id: 2,
      name: 'половина',
      price_delta_cents: -2000,
      component_variant_id: null,
      component_quantity: null,
      component: null,
      is_default: false,
      sort_order: 0,
      is_active: true,
    },
  ],
};

const oatMilk: Product = {
  id: 3,
  name: 'Молоко вівсяне',
  description: null,
  image_url: null,
  is_active: true,
  sellable: false,
  tag_ids: [],
  variants: [
    {
      id: 21,
      product_id: 3,
      attributes: {},
      label: '',
      unit: 'мл',
      sku: null,
      barcode: null,
      price_cents: 0,
      cost_cents: 0,
      is_active: true,
      quantity: 5000,
    },
  ],
};

beforeEach(() => {
  listModifierGroups.mockResolvedValue([milk, portion]);
  getProducts.mockResolvedValue([oatMilk]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ModifiersPage', () => {
  it('lists every question with its range and its answers, deltas signed', async () => {
    renderWithProviders(<ModifiersPage />);
    const card = within(await screen.findByTestId('group-card-1'));
    expect(card.getByText('Молоко')).toBeInTheDocument();
    expect(card.getByText('обовʼязково · одна відповідь')).toBeInTheDocument();
    const rows = card.getAllByTestId('modifier-row');
    expect(rows[0]).toHaveTextContent('звичайне');
    expect(rows[0]).toHaveTextContent('без доплати');
    expect(rows[0]).toHaveTextContent('за умовчанням');
    expect(rows[1]).toHaveTextContent('+15,00 ₴');
    expect(rows[1]).toHaveTextContent('списує Молоко вівсяне × 200 мл');

    const half = within(screen.getByTestId('group-card-2')).getAllByTestId('modifier-row')[0];
    expect(half).toHaveTextContent('−20,00 ₴');
    expect(half).toHaveTextContent('без списання');
  });

  it('creates a question with its range', async () => {
    const user = userEvent.setup();
    createModifierGroup.mockResolvedValue({ ...portion, id: 9, name: 'Сироп', min_select: 0, max_select: 3, modifiers: [] });
    renderWithProviders(<ModifiersPage />);
    await screen.findByTestId('group-card-1');

    await user.type(screen.getByTestId('group-form-name'), 'Сироп');
    await user.clear(screen.getByTestId('group-form-min'));
    await user.type(screen.getByTestId('group-form-min'), '0');
    await user.clear(screen.getByTestId('group-form-max'));
    await user.type(screen.getByTestId('group-form-max'), '3');
    await user.click(screen.getByTestId('group-form-submit'));

    expect(createModifierGroup).toHaveBeenCalledWith({ name: 'Сироп', min_select: 0, max_select: 3 });
    expect(await screen.findByTestId('group-card-9')).toHaveTextContent('за бажанням · до 3');
  });

  it('adds an answer with a negative delta and what it takes off the shelf', async () => {
    const user = userEvent.setup();
    createModifier.mockImplementation(async (_groupId: number, input: Record<string, unknown>) => ({
      ...milk,
      modifiers: [...milk.modifiers, { ...milk.modifiers[1], id: 13, ...input }],
    }));
    renderWithProviders(<ModifiersPage />);
    const card = within(await screen.findByTestId('group-card-1'));

    await user.type(card.getByTestId('modifier-form-name'), 'без молока');
    await user.clear(card.getByTestId('modifier-form-delta'));
    await user.type(card.getByTestId('modifier-form-delta'), '-20');
    await user.selectOptions(card.getByTestId('modifier-form-component'), '21');
    await user.clear(card.getByTestId('modifier-form-qty'));
    await user.type(card.getByTestId('modifier-form-qty'), '150');
    await user.click(card.getByTestId('modifier-form-submit'));

    expect(createModifier).toHaveBeenCalledWith(1, {
      name: 'без молока',
      price_delta_cents: -2000,
      is_default: false,
      component_variant_id: 21,
      component_quantity: 150,
    });
    await waitFor(() => expect(card.getAllByTestId('modifier-row')).toHaveLength(3));
  });

  it('sends no component when the answer takes nothing', async () => {
    const user = userEvent.setup();
    createModifier.mockResolvedValue(milk);
    renderWithProviders(<ModifiersPage />);
    const card = within(await screen.findByTestId('group-card-1'));

    await user.type(card.getByTestId('modifier-form-name'), 'гарячіше');
    await user.click(card.getByTestId('modifier-form-default'));
    await user.click(card.getByTestId('modifier-form-submit'));

    expect(createModifier).toHaveBeenCalledWith(1, {
      name: 'гарячіше',
      price_delta_cents: 0,
      is_default: true,
      component_variant_id: null,
      component_quantity: null,
    });
  });

  it("surfaces the server's refusal in its own words", async () => {
    const user = userEvent.setup();
    createModifierGroup.mockRejectedValue({
      response: { data: { error: 'max_select не може бути меншим за min_select' } },
    });
    renderWithProviders(<ModifiersPage />);
    await screen.findByTestId('group-card-1');

    await user.type(screen.getByTestId('group-form-name'), 'Сироп');
    await user.click(screen.getByTestId('group-form-submit'));

    expect(await screen.findByTestId('modifiers-error')).toHaveTextContent(
      'max_select не може бути меншим за min_select'
    );
  });

  it('deletes a question after asking, and drops its card', async () => {
    const user = userEvent.setup();
    deleteModifierGroup.mockResolvedValue(undefined);
    renderWithProviders(<ModifiersPage />);
    await screen.findByTestId('group-card-2');

    await user.click(screen.getByTestId('group-delete-2'));

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteModifierGroup).toHaveBeenCalledWith(2);
    await waitFor(() => expect(screen.queryByTestId('group-card-2')).toBeNull());
  });
});

describe('signedUahInputToCents', () => {
  it('reads a minus in any of its spellings, and a plain number as a surcharge', () => {
    expect(signedUahInputToCents('15')).toBe(1500);
    expect(signedUahInputToCents('+15')).toBe(1500);
    expect(signedUahInputToCents('-20')).toBe(-2000);
    expect(signedUahInputToCents('−20')).toBe(-2000);
    expect(signedUahInputToCents('- 7,50')).toBe(-750);
    expect(signedUahInputToCents('')).toBe(0);
  });
});
