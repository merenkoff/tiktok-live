// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Модифікатори» in the product card: what the dish asks, in order — read as
// rows, not chips — and the four ways a question gets there: one tap from
// what the neighbours ask, the searchable picker, a copy of another dish's
// set, and a new question made without leaving the card.

import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModifierGroup, Product } from '../../../types';

const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { posRequest: (...a: unknown[]) => posRequest(...a) } };
});

const { ProductModifiers } = await import('./ProductModifiers');

function group(id: number, name: string, answers: Array<[string, number]>, patch: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id,
    name,
    min_select: 0,
    max_select: 1,
    sort_order: 0,
    is_active: true,
    product_ids: [],
    modifiers: answers.map(([answerName, cents], index) => ({
      id: id * 10 + index,
      group_id: id,
      name: answerName,
      price_delta_cents: cents,
      component_variant_id: null,
      component_quantity: null,
      component: null,
      is_default: false,
      sort_order: index,
      is_active: true,
    })),
    ...patch,
  };
}

function product(id: number, name: string, tagIds: number[], groupIds: number[]): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    sellable: true,
    tag_ids: tagIds,
    modifier_group_ids: groupIds,
    variants: [],
  } as Product;
}

const COFFEE = 7;
const milk = group(1, 'Молоко', [['звичайне', 0], ['вівсяне', 1500]], { min_select: 1, product_ids: [5, 6] });
const syrup = group(2, 'Сироп', [['ваніль', 1000]], { max_select: 3, product_ids: [5] });
const doneness = group(3, 'Просмаження', [['medium', 0]], { product_ids: [9] });
const GROUPS = [milk, syrup, doneness];
const PRODUCTS = [
  product(5, 'Латте', [COFFEE], [1, 2]),
  product(6, 'Раф', [COFFEE], [1]),
  product(9, 'Стейк', [8], [3]),
];

/** The card's two pieces of state the section lives in: the ids and the store's questions. */
function Harness({ initial = [], tagIds = [COFFEE] }: { initial?: number[]; tagIds?: number[] }) {
  const [value, setValue] = useState<number[]>(initial);
  const [groups, setGroups] = useState<ModifierGroup[]>(GROUPS);
  return (
    <>
      <output data-testid="value">{value.join(',')}</output>
      <ProductModifiers
        groups={groups}
        products={PRODUCTS}
        value={value}
        onChange={setValue}
        productId={42}
        productName="Капучино"
        tagIds={tagIds}
        options={[]}
        dish
        onGroupSaved={(g) =>
          setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g]))
        }
      />
    </>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProductModifiers', () => {
  it('reads each attached question as a row: order, rule, answers with prices, who else asks it', () => {
    render(<Harness initial={[1, 2]} />);
    const first = within(screen.getByTestId('product-modifier-1'));
    expect(first.getByText('Молоко')).toBeInTheDocument();
    expect(first.getByText('обовʼязково · одна відповідь')).toBeInTheDocument();
    expect(first.getByText('звичайне · вівсяне +15 ₴')).toBeInTheDocument();
    expect(first.getByText('ще у 2 стравах')).toBeInTheDocument();
    expect(within(screen.getByTestId('product-modifier-2')).getByText('ще в 1 страві')).toBeInTheDocument();
  });

  it('changes the till’s order with the arrows and takes a question away', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[1, 2]} />);
    expect(screen.getByTestId('product-modifier-up-1')).toBeDisabled();
    await user.click(screen.getByTestId('product-modifier-down-1'));
    expect(screen.getByTestId('value')).toHaveTextContent('2,1');
    await user.click(screen.getByTestId('product-modifier-remove-2'));
    expect(screen.getByTestId('value')).toHaveTextContent('1');
  });

  it('offers what the neighbours under the same tags ask — one tap each, most asked first', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const strip = within(screen.getByTestId('product-modifier-suggestions'));
    expect(strip.getAllByRole('button').map((b) => b.textContent)).toEqual(['Молоко', 'Сироп']);
    await user.click(screen.getByTestId('product-modifier-suggest-1'));
    expect(screen.getByTestId('value')).toHaveTextContent('1');
    // What is attached is not suggested again.
    expect(screen.queryByTestId('product-modifier-suggest-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('product-modifier-suggest-2')).toBeInTheDocument();
  });

  it('has no suggestions for a product with no tags', () => {
    render(<Harness tagIds={[]} />);
    expect(screen.queryByTestId('product-modifier-suggestions')).not.toBeInTheDocument();
  });

  it('finds a question in the picker by one of its ANSWERS and adds the ticked ones in order', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[3]} />);
    await user.click(screen.getByTestId('product-modifier-add'));
    const picker = within(await screen.findByTestId('modifier-picker'));
    // Attached already: not offered.
    expect(picker.queryByTestId('modifier-option-3')).not.toBeInTheDocument();
    expect(within(picker.getByTestId('modifier-picker-suggested')).getByTestId('modifier-option-1')).toHaveTextContent(
      'питають 2 з 2 схожих'
    );

    await user.type(picker.getByTestId('modifier-picker-search'), 'ваніль');
    expect(picker.queryByTestId('modifier-option-1')).not.toBeInTheDocument();
    await user.click(picker.getByTestId('modifier-option-2'));
    await user.clear(picker.getByTestId('modifier-picker-search'));
    await user.click(picker.getByTestId('modifier-option-1'));
    expect(picker.getByTestId('modifier-picker-add')).toHaveTextContent('Додати (2)');
    await user.click(picker.getByTestId('modifier-picker-add'));
    expect(screen.getByTestId('value')).toHaveTextContent('3,2,1');
    expect(screen.queryByTestId('modifier-picker')).not.toBeInTheDocument();
  });

  it('copies another dish’s whole set, in its order, skipping what is already there', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[2]} />);
    await user.click(screen.getByTestId('product-modifier-add'));
    const picker = within(await screen.findByTestId('modifier-picker'));
    await user.click(picker.getByTestId('modifier-picker-mode-copy'));
    expect(picker.getByTestId('modifier-donor-5')).toHaveTextContent('Молоко · Сироп');
    await user.click(picker.getByTestId('modifier-donor-5'));
    expect(screen.getByTestId('value')).toHaveTextContent('2,1');
  });

  it('turns a search with no match into a new question, created without leaving the card', async () => {
    const user = userEvent.setup();
    const created = group(50, 'Лід', [['з льодом', 0]]);
    posRequest.mockResolvedValueOnce(created);
    render(<Harness />);
    await user.click(screen.getByTestId('product-modifier-add'));
    const picker = within(await screen.findByTestId('modifier-picker'));
    await user.type(picker.getByTestId('modifier-picker-search'), 'Лід');
    await user.click(picker.getByTestId('modifier-picker-create-named'));

    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    expect(dialog.getByTestId('modifier-group-name')).toHaveValue('Лід');
    await user.type(within(dialog.getByTestId('answer-row-new')).getByTestId('answer-name'), 'з льодом');
    await user.click(dialog.getByTestId('modifier-group-save'));

    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    expect(posRequest.mock.calls[0].slice(0, 2)).toEqual(['post', '/modifier-groups']);
    // Created AND attached: the card's draft now asks it.
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('50'));
    expect(screen.getByTestId('product-modifier-50')).toHaveTextContent('з льодом');
  });

  it('changes a shared question for this dish only: a copy under its own name takes the same place', async () => {
    const user = userEvent.setup();
    posRequest.mockImplementation((_m: string, _p: string, body: { name: string; modifiers: ModifierGroup['modifiers'] }) =>
      Promise.resolve({ ...milk, id: 60, name: body.name, product_ids: [] })
    );
    render(<Harness initial={[2, 1]} />);
    await user.click(screen.getByTestId('product-modifier-edit-1'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    expect(dialog.getByTestId('modifier-group-shared')).toHaveTextContent('ще у 2 стравах: Латте, Раф');
    expect(dialog.getByTestId('modifier-group-save')).toHaveTextContent('Зберегти для всіх (3)');

    const oat = within(dialog.getAllByTestId('answer-row')[1]);
    await user.clear(oat.getByTestId('answer-delta'));
    await user.type(oat.getByTestId('answer-delta'), '25');
    await user.click(dialog.getByTestId('modifier-group-fork'));

    await waitFor(() => expect(posRequest).toHaveBeenCalledTimes(1));
    const [method, path, body] = posRequest.mock.calls[0] as [string, string, { name: string; modifiers: Array<Record<string, unknown>> }];
    // A NEW question: created, not changed — the other dishes keep theirs.
    expect([method, path]).toEqual(['post', '/modifier-groups']);
    expect(body.name).toBe('Молоко (Капучино)');
    expect(body.modifiers.every((m) => !('id' in m))).toBe(true);
    expect(body.modifiers[1]).toMatchObject({ name: 'вівсяне', price_delta_cents: 2500 });
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('2,60'));
  });

  it('goes straight to creating when the store has no questions at all', async () => {
    const user = userEvent.setup();
    function Empty() {
      const [value, setValue] = useState<number[]>([]);
      return (
        <ProductModifiers
          groups={[]}
          products={[]}
          value={value}
          onChange={setValue}
          productName=""
          tagIds={[]}
          options={[]}
          dish
          onGroupSaved={() => undefined}
        />
      );
    }
    render(<Empty />);
    expect(screen.getByTestId('product-modifier-add')).toHaveTextContent('Новий модифікатор');
    await user.click(screen.getByTestId('product-modifier-add'));
    const dialog = within(await screen.findByTestId('modifier-group-dialog'));
    // A café gets a head start.
    expect(dialog.getByTestId('modifier-group-templates')).toBeInTheDocument();
  });
});
