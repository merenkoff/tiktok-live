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
function ingredient(id: number, name: string, unit: string, costMilli: number, prepLossBps: number | null = null): Product {
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
      { id: id * 10, product_id: id, attributes: {}, label: '', unit, sku: null, barcode: null, price_cents: 0, cost_cents: Math.round(costMilli / 1000), cost_milli: costMilli, prep_loss_bps: prepLossBps, is_active: true, quantity: 1000 },
    ],
  } as Product;
}

const BEANS = ingredient(1, 'Зерно арабіка', 'г', 60_000);
const MILK = ingredient(2, 'Молоко', 'мл', 4_000);
const BACON = ingredient(3, 'Бекон', 'г', 0);
// 20 ₴/кг, and a fifth of it is peel — said on the ingredient's own card.
const POTATO = ingredient(4, 'Картопля', 'г', 2000, 2000);
const EGG = ingredient(5, 'Яйце', 'шт', 600_000);

function Harness({
  initial = [],
  price = 6500,
  target = null,
  onSetCost,
  sources,
  onPrint,
  losses = true,
}: {
  initial?: ProductComponentInput[];
  price?: number;
  target?: number | null;
  onSetCost?: (variantId: number, baseMilli: number) => Promise<void>;
  sources?: Parameters<typeof RecipeEditor>[0]['sources'];
  onPrint?: () => void;
  losses?: boolean;
}) {
  const [products, setProducts] = useState<Product[]>([BEANS, MILK, BACON, POTATO, EGG]);
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
        onPrint={onPrint}
        losses={losses}
      />
    </>
  );
}

const valueOf = () => JSON.parse(screen.getByTestId('value').textContent ?? '[]') as ProductComponentInput[];

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('RecipeEditor', () => {
  it('adds a line by typing: Enter picks, the caret goes to the quantity, Enter goes on to the next line', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const search = screen.getByRole('combobox', { name: 'Додати складник' });
    await user.type(search, 'зерн{Enter}');
    expect(valueOf()).toEqual([{ component_variant_id: 10, quantity: 1, loss_bps: 0 }]);

    // The caret is in the new line's quantity, selected: typing replaces the 1.
    const quantity = screen.getByLabelText('Кількість');
    await waitFor(() => expect(quantity).toHaveFocus());
    await user.keyboard('18{Enter}');
    expect(valueOf()).toEqual([{ component_variant_id: 10, quantity: 18, loss_bps: 0 }]);
    // Enter did not submit anything: it went back to the search for the next line.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Додати складник' })).toHaveFocus());

    await user.keyboard('молок{Enter}200');
    expect(valueOf()).toEqual([
      { component_variant_id: 10, quantity: 18, loss_bps: 0 },
      { component_variant_id: 20, quantity: 200, loss_bps: 0 },
    ]);
  });

  it('shows the money beside every line and the total, live', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { component_variant_id: 10, quantity: 18, loss_bps: 0 },
          { component_variant_id: 20, quantity: 200, loss_bps: 0 },
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
      <Harness initial={[{ component_variant_id: 10, quantity: 40, loss_bps: 0 }]} price={6500} target={3000} />
    );
    // 24 ₴ of 65 ₴ = 36,9 % > 30 %: the price for 30 % is 80 ₴.
    expect(screen.getByTestId('recipe-suggested')).toHaveTextContent('від 80 ₴');
    unmount();
    render(<Harness initial={[{ component_variant_id: 10, quantity: 18, loss_bps: 0 }]} price={6500} target={3000} />);
    expect(screen.queryByTestId('recipe-suggested')).not.toBeInTheDocument();
  });

  it('never prints a food cost on an unpriced ingredient — and takes its price on the spot', async () => {
    const user = userEvent.setup();
    const onSetCost = vi.fn().mockResolvedValue(undefined);
    render(
      <Harness
        initial={[
          { component_variant_id: 10, quantity: 18, loss_bps: 0 },
          { component_variant_id: 30, quantity: 60, loss_bps: 0 },
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
    render(<Harness initial={[{ component_variant_id: 30, quantity: 60, loss_bps: 0 }]} onSetCost={onSetCost} />);
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
    render(<Harness initial={[{ component_variant_id: 30, quantity: 60, loss_bps: 0 }]} onSetCost={onSetCost} />);
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
    await waitFor(() => expect(valueOf()).toEqual([{ component_variant_id: 90, quantity: 1, loss_bps: 0 }]));
    expect(screen.getByTestId('composition-row')).toHaveTextContent('Вершки 33');
  });

  it('copies a recipe from another size, scaled, and says it replaces what is there', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[{ component_variant_id: 30, quantity: 5, loss_bps: 0 }]}
        sources={[
          {
            key: 's1',
            title: 'S',
            sibling: true,
            components: [
              { component_variant_id: 10, quantity: 18, loss_bps: 0 },
              { component_variant_id: 20, quantity: 150, loss_bps: 0 },
              // Not something this recipe may hold: left out, not an error.
              { component_variant_id: 777, quantity: 1, loss_bps: 0 },
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
      { component_variant_id: 10, quantity: 27, loss_bps: 0 },
      { component_variant_id: 20, quantity: 225, loss_bps: 0 },
    ]);
  });

  it('removes a line, and offers no ingredient twice', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { component_variant_id: 10, quantity: 18, loss_bps: 0 },
          { component_variant_id: 20, quantity: 200, loss_bps: 0 },
        ]}
      />
    );
    await user.click(screen.getByRole('combobox', { name: 'Додати складник' }));
    expect(screen.queryByRole('option', { name: /Зерно/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Бекон/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Прибрати «Зерно арабіка»' }));
    expect(valueOf()).toEqual([{ component_variant_id: 20, quantity: 200, loss_bps: 0 }]);
  });
});

describe('RecipeEditor: gross, loss and net', () => {
  it('keeps the three columns out of the way until they are asked for', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ component_variant_id: 20, quantity: 200, loss_bps: 0 }]} />);
    // A coffee shop's recipe: one weight, as before.
    expect(screen.getByLabelText('Кількість')).toHaveValue('200');
    expect(screen.queryByLabelText('Нетто')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recipe-yield')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('recipe-gross-net'));
    expect(screen.getByLabelText('Брутто')).toHaveValue('200');
    expect(screen.getByLabelText('Нетто')).toHaveValue('200');
    expect(screen.getByTestId('recipe-gross-net')).toHaveAttribute('aria-pressed', 'true');
    // The choice is this device's, for the next recipe too.
    expect(window.localStorage.getItem('products:recipeGrossNet')).toBe('1');
    await user.click(screen.getByTestId('recipe-gross-net'));
    expect(screen.queryByLabelText('Нетто')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('products:recipeGrossNet')).toBeNull();
  });

  it('works the gross out of the net and the loss — the sum that was done on a calculator', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ component_variant_id: 40, quantity: 1, loss_bps: 0 }]} />);
    await user.click(screen.getByTestId('recipe-gross-net'));

    await user.type(screen.getByLabelText('Втрати «Картопля», %'), '20');
    const net = screen.getByLabelText('Нетто');
    await user.clear(net);
    await user.type(net, '100');
    // 100 г in the pan at 20 % of peel is 125 г off the shelf.
    expect(screen.getByLabelText('Брутто')).toHaveValue('125');
    expect(net).toHaveValue('100');
    expect(valueOf()).toEqual([{ component_variant_id: 40, quantity: 125, loss_bps: 2000 }]);
    // The cost is of what leaves the shelf: 125 г × 20 ₴/кг = 2,50 ₴ — the peel is paid for.
    expect(screen.getByTestId('recipe-line-sum')).toHaveTextContent('2,50 ₴');

    // The other way: a new gross gives its net.
    const gross = screen.getByLabelText('Брутто');
    await user.clear(gross);
    await user.type(gross, '250');
    expect(screen.getByLabelText('Нетто')).toHaveValue('200');
    // And a loss with a comma is typed as it is said.
    const loss = screen.getByLabelText('Втрати «Картопля», %');
    await user.clear(loss);
    await user.type(loss, '12,5');
    expect(valueOf()).toEqual([{ component_variant_id: 40, quantity: 250, loss_bps: 1250 }]);
    expect(screen.getByLabelText('Нетто')).toHaveValue('219');
  });

  it('does not take a loss that is not 0…99 %: the box is ringed and the line keeps what it had', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ component_variant_id: 40, quantity: 125, loss_bps: 2000 }]} />);
    const loss = screen.getByLabelText('Втрати «Картопля», %');
    await user.clear(loss);
    await user.type(loss, '150');
    expect(loss).toHaveAttribute('aria-invalid', 'true');
    // «15» was a loss on the way there; «150» is not, and changes nothing.
    expect(valueOf()).toEqual([{ component_variant_id: 40, quantity: 125, loss_bps: 1500 }]);
  });

  it('shows the columns by itself for a recipe that has a loss, and cannot hide them', () => {
    render(<Harness initial={[{ component_variant_id: 40, quantity: 125, loss_bps: 2000 }]} />);
    expect(screen.getByLabelText('Брутто')).toHaveValue('125');
    expect(screen.getByLabelText('Втрати «Картопля», %')).toHaveValue('20');
    expect(screen.getByLabelText('Нетто')).toHaveValue('100');
    expect(screen.getByTestId('recipe-gross-net')).toBeDisabled();
  });

  it('brings an ingredient’s usual loss with it and puts the caret in the net', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('combobox', { name: 'Додати складник' }), 'картоп{Enter}');
    // The card of the potato says «відходи 20 %»: the line starts with it…
    expect(screen.getByLabelText('Втрати «Картопля», %')).toHaveValue('20');
    // …and the cook's card states the net, so that is where the typing lands.
    const net = screen.getByLabelText('Нетто');
    await waitFor(() => expect(net).toHaveFocus());
    await user.keyboard('150{Enter}');
    expect(valueOf()).toEqual([{ component_variant_id: 40, quantity: 188, loss_bps: 2000 }]);
    // Enter went on to the next line, as it does from the plain quantity.
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Додати складник' })).toHaveFocus());
  });

  it('says what the portion comes to: the net of what is weighed, the pieces named apart', () => {
    render(
      <Harness
        initial={[
          { component_variant_id: 40, quantity: 125, loss_bps: 2000 },
          { component_variant_id: 20, quantity: 50, loss_bps: 0 },
          { component_variant_id: 50, quantity: 2, loss_bps: 0 },
        ]}
      />
    );
    expect(screen.getByTestId('recipe-yield')).toHaveTextContent('Вихід ≈ 150 г + Яйце × 2 шт');
  });

  it('is a kitchen’s question: a florist’s bouquet is not asked about gross and net', () => {
    window.localStorage.setItem('products:recipeGrossNet', '1');
    const { unmount } = render(<Harness losses={false} initial={[{ component_variant_id: 20, quantity: 200, loss_bps: 0 }]} />);
    expect(screen.queryByTestId('recipe-gross-net')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Кількість')).toHaveValue('200');
    unmount();
    // …but a recipe that already states a loss shows it wherever it is opened.
    render(<Harness losses={false} initial={[{ component_variant_id: 40, quantity: 125, loss_bps: 2000 }]} />);
    expect(screen.getByLabelText('Нетто')).toHaveValue('100');
  });

  it('offers the kitchen’s sheet once there is something to print', async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    const { unmount } = render(<Harness onPrint={onPrint} />);
    expect(screen.queryByTestId('recipe-print')).not.toBeInTheDocument();
    unmount();
    render(<Harness initial={[{ component_variant_id: 40, quantity: 125, loss_bps: 2000 }]} onPrint={onPrint} />);
    await user.click(screen.getByTestId('recipe-print'));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});
