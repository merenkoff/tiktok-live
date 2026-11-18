// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The recipe editor: a line is added by typing, the money moves with every
// keystroke, a missing ingredient is made from the search, one with no price
// gets it on the spot, and a recipe is copied from another size, scaled.

import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product, ProductComponentInput } from '../../../types';

const createProduct = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { createProduct: (...a: unknown[]) => createProduct(...a) } };
});

const { RecipeEditor } = await import('./RecipeEditor');
const { buildCostIndex } = await import('../lib/recipeCost');
const { ingredientOptions } = await import('../lib/ingredientOptions');

/** `costMilli`: thousandths of a kopeck per base unit — 600 ₴/кг is 60 000 a gram. */
function ingredient(id: number, name: string, unit: string, costMilli: number): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    kind: 'simple',
    stock_mode: 'own',
    sellable: false,
    tag_ids: [],
    variants: [
      { id: id * 10, product_id: id, attributes: {}, label: '', unit, sku: null, barcode: null, price_cents: 0, cost_cents: Math.round(costMilli / 1000), cost_milli: costMilli, is_active: true, quantity: 1000 },
    ],
  } as Product;
}

const BEANS = ingredient(1, 'Зерно арабіка', 'г', 60_000);
const MILK = ingredient(2, 'Молоко', 'мл', 4_000);
const BACON = ingredient(3, 'Бекон', 'г', 0);

function Harness({
  initial = [],
  price = 6500,
  target = null,
  onSetCost,
  sources,
}: {
  initial?: ProductComponentInput[];
  price?: number;
  target?: number | null;
  onSetCost?: (variantId: number, baseMilli: number) => Promise<void>;
  sources?: Parameters<typeof RecipeEditor>[0]['sources'];
}) {
  const [products, setProducts] = useState<Product[]>([BEANS, MILK, BACON]);
  const [value, setValue] = useState<ProductComponentInput[]>(initial);
  return (
    <>
      <output data-testid="value">{JSON.stringify(value)}</output>
      <RecipeEditor
        value={value}
        options={ingredientOptions(products)}
        onChange={setValue}
        money={{
          index: buildCostIndex(products),
          priceCents: price,
          targetBps: target,
          onSetCost: onSetCost
            ? async (variantId, baseMilli) => {
                await onSetCost(variantId, baseMilli);
                setProducts((prev) =>
                  prev.map((p) =>
                    p.variants[0].id === variantId ? { ...p, variants: [{ ...p.variants[0], cost_milli: baseMilli }] } : p
                  )
                );
              }
            : undefined,
        }}
        create={{ units: ['шт', 'г', 'мл'], onCreated: (p) => setProducts((prev) => [...prev, p]) }}
        sources={sources}
      />
    </>
  );
}

const valueOf = () => JSON.parse(screen.getByTestId('value').textContent ?? '[]') as ProductComponentInput[];

afterEach(() => {
  vi.clearAllMocks();
});

describe('RecipeEditor', () => {
  it('adds a line by typing: Enter picks, the caret goes to the quantity, Enter goes on to the next line', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const search = screen.getByRole('combobox', { name: 'Додати складник' });
    await user.type(search, 'зерн{Enter}');
    expect(valueOf()).toEqual([{ component_variant_id: 10, quantity: 1 }]);

    // The caret is in the new line's quantity, selected: typing replaces the 1.
    const quantity = screen.getByLabelText('Кількість');
    await waitFor(() => expect(quantity).toHaveFocus());
    await user.keyboard('18{Enter}');
    expect(valueOf()).toEqual([{ component_variant_id: 10, quantity: 18 }]);
    // Enter did not submit anything: it went back to the search for the next line.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Додати складник' })).toHaveFocus());

    await user.keyboard('молок{Enter}200');
    expect(valueOf()).toEqual([
      { component_variant_id: 10, quantity: 18 },
      { component_variant_id: 20, quantity: 200 },
    ]);
  });

  it('shows the money beside every line and the total, live', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { component_variant_id: 10, quantity: 18 },
          { component_variant_id: 20, quantity: 200 },
        ]}
      />
    );
    const rows = screen.getAllByTestId('composition-row');
    expect(within(rows[0]).getByTestId('recipe-unit-price')).toHaveTextContent('600 ₴/кг');
    expect(within(rows[0]).getByTestId('recipe-line-sum')).toHaveTextContent('10,80 ₴');
    expect(within(rows[1]).getByTestId('recipe-unit-price')).toHaveTextContent('40 ₴/л');
    expect(within(rows[1]).getByTestId('recipe-line-sum')).toHaveTextContent('8 ₴');
    const totals = screen.getByTestId('recipe-totals');
    expect(totals).toHaveTextContent('Собівартість 18,80 ₴');
    expect(screen.getByTestId('recipe-food-cost')).toHaveTextContent('28,9 %');
    expect(totals).toHaveTextContent('Маржа 46,20 ₴');

    // A bigger pour moves the figure as it is typed.
    const milk = within(rows[1]).getByLabelText('Кількість');
    await user.clear(milk);
    await user.type(milk, '300');
    expect(screen.getByTestId('recipe-totals')).toHaveTextContent('Собівартість 22,80 ₴');
  });

  it('says what price would meet the owner’s target — only when the dish is over it', () => {
    const { unmount } = render(
      <Harness initial={[{ component_variant_id: 10, quantity: 40 }]} price={6500} target={3000} />
    );
    // 24 ₴ of 65 ₴ = 36,9 % > 30 %: the price for 30 % is 80 ₴.
    expect(screen.getByTestId('recipe-suggested')).toHaveTextContent('від 80 ₴');
    unmount();
    render(<Harness initial={[{ component_variant_id: 10, quantity: 18 }]} price={6500} target={3000} />);
    expect(screen.queryByTestId('recipe-suggested')).not.toBeInTheDocument();
  });

  it('never prints a food cost on an unpriced ingredient — and takes its price on the spot', async () => {
    const user = userEvent.setup();
    const onSetCost = vi.fn().mockResolvedValue(undefined);
    render(
      <Harness
        initial={[
          { component_variant_id: 10, quantity: 18 },
          { component_variant_id: 30, quantity: 60 },
        ]}
        onSetCost={onSetCost}
      />
    );
    const totals = screen.getByTestId('recipe-totals');
    expect(totals).toHaveTextContent('від 10,80 ₴');
    expect(totals).toHaveTextContent('Food cost невідомий — немає ціни: Бекон');
    expect(screen.queryByTestId('recipe-food-cost')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('recipe-set-cost'));
    // 550 ₴ за кг → 55 коп за грам, kept in thousandths of a kopeck.
    await user.type(screen.getByTestId('recipe-cost-input'), '550{Enter}');
    await waitFor(() => expect(onSetCost).toHaveBeenCalledWith(30, 55_000));
    await waitFor(() => expect(screen.getByTestId('recipe-totals')).toHaveTextContent('Собівартість 43,80 ₴'));
    expect(screen.getByTestId('recipe-food-cost')).toHaveTextContent('67,4 %');
  });

  it('keeps a price per kilogram to the kopeck — no step of 10 ₴', async () => {
    const user = userEvent.setup();
    const onSetCost = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={[{ component_variant_id: 30, quantity: 60 }]} onSetCost={onSetCost} />);
    await user.click(screen.getByTestId('recipe-set-cost'));
    // 4 ₴ a kilogram used to be «too small»; 35,50 used to become 40.
    await user.type(screen.getByTestId('recipe-cost-input'), '35,50{Enter}');
    await waitFor(() => expect(onSetCost).toHaveBeenCalledWith(30, 3550));
    const row = await screen.findByTestId('composition-row');
    await waitFor(() => expect(within(row).getByTestId('recipe-unit-price')).toHaveTextContent('35,50 ₴/кг'));
    // 60 г × 3,55 коп = 2,13 ₴.
    expect(within(row).getByTestId('recipe-line-sum')).toHaveTextContent('2,13 ₴');
    expect(screen.getByTestId('recipe-totals')).toHaveTextContent('Собівартість 2,13 ₴');
  });

  it('asks for a price rather than storing «nothing»', async () => {
    const user = userEvent.setup();
    const onSetCost = vi.fn();
    render(<Harness initial={[{ component_variant_id: 30, quantity: 60 }]} onSetCost={onSetCost} />);
    await user.click(screen.getByTestId('recipe-set-cost'));
    await user.type(screen.getByTestId('recipe-cost-input'), '0{Enter}');
    expect(screen.getByText('Вкажіть ціну')).toBeInTheDocument();
    expect(onSetCost).not.toHaveBeenCalled();
  });

  it('makes a missing ingredient from the search, and it is in the recipe at once', async () => {
    const user = userEvent.setup();
    const cream = ingredient(9, 'Вершки 33', 'мл', 12_000);
    createProduct.mockResolvedValue(cream);
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Додати складник' }), 'Вершки 33');
    await user.click(screen.getByTestId('ingredient-create'));

    const dialog = within(await screen.findByTestId('new-ingredient-dialog'));
    expect(dialog.getByTestId('new-ingredient-name')).toHaveValue('Вершки 33');
    await user.click(dialog.getByTestId('new-ingredient-unit-мл'));
    await user.type(dialog.getByTestId('new-ingredient-price'), '120');
    await user.click(dialog.getByTestId('new-ingredient-save'));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    // An ingredient: not sold by itself, counted in millilitres, 120 ₴/л = 12 коп/мл.
    expect(createProduct).toHaveBeenCalledWith({
      name: 'Вершки 33',
      sellable: false,
      variants: [{ attributes: {}, unit: 'мл', price_cents: 0, cost_milli: 12_000 }],
    });
    await waitFor(() => expect(valueOf()).toEqual([{ component_variant_id: 90, quantity: 1 }]));
    expect(screen.getByTestId('composition-row')).toHaveTextContent('Вершки 33');
  });

  it('copies a recipe from another size, scaled, and says it replaces what is there', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[{ component_variant_id: 30, quantity: 5 }]}
        sources={[
          {
            key: 's1',
            title: 'S',
            sibling: true,
            components: [
              { component_variant_id: 10, quantity: 18 },
              { component_variant_id: 20, quantity: 150 },
              // Not something this recipe may hold: left out, not an error.
              { component_variant_id: 777, quantity: 1 },
            ],
          },
        ]}
      />
    );
    await user.click(screen.getByTestId('recipe-copy'));
    const dialog = within(await screen.findByTestId('recipe-copy-dialog'));
    expect(dialog.getByText(/Теперішні рядки \(1\) буде замінено/)).toBeInTheDocument();
    await user.clear(dialog.getByTestId('recipe-copy-factor'));
    await user.type(dialog.getByTestId('recipe-copy-factor'), '1,5');
    await user.click(dialog.getByTestId('recipe-copy-s1'));
    expect(valueOf()).toEqual([
      { component_variant_id: 10, quantity: 27 },
      { component_variant_id: 20, quantity: 225 },
    ]);
  });

  it('removes a line, and offers no ingredient twice', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { component_variant_id: 10, quantity: 18 },
          { component_variant_id: 20, quantity: 200 },
        ]}
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Додати складник' }));
    expect(screen.queryByRole('option', { name: /Зерно/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Бекон/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Прибрати «Зерно арабіка»' }));
    expect(valueOf()).toEqual([{ component_variant_id: 20, quantity: 200 }]);
  });
});
