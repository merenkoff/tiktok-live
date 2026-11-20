import { expect, test } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * «Техкарти» as a workbench, end to end: the owner finds a dish from the
 * sidebar's search and lands on its recipe, changes a quantity with the cost
 * moving as it is typed, saves — and then gives an ingredient its purchase
 * price where it is listed. What this pins is the wire: a recipe leaves as the
 * whole composition of ONE variant with its price, and an ingredient's price
 * as kopecks per base unit (600 ₴/кг → 60 коп/г).
 */

function variant(id: number, productId: number, unit: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    product_id: productId,
    attributes: {},
    label: '',
    unit,
    sku: null,
    barcode: null,
    price_cents: 0,
    cost_cents: 0,
    is_active: true,
    quantity: 5000,
    ...patch,
  };
}

function product(id: number, name: string, patch: Record<string, unknown> = {}) {
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
    modifier_group_ids: [],
    ...patch,
  };
}

const BEANS = product(1, 'Зерно арабіка', { variants: [variant(10, 1, 'г', { cost_cents: 0 })] });
const MILK = product(2, 'Молоко', { variants: [variant(20, 2, 'мл', { cost_cents: 4 })] });
const LATTE = product(3, 'Латте', {
  kind: 'composite',
  stock_mode: 'derived',
  sellable: true,
  variants: [
    variant(30, 3, 'шт', {
      price_cents: 7500,
      components: [
        { id: 1, component_variant_id: 10, quantity: 18, sort_order: 0, product_name: 'Зерно арабіка', label: '', unit: 'г' },
        { id: 2, component_variant_id: 20, quantity: 200, sort_order: 1, product_name: 'Молоко', label: '', unit: 'мл' },
      ],
    }),
  ],
});

test('the owner finds a dish, fixes its recipe in place and prices an ingredient where it is listed', async ({ page }) => {
  await mockPosApi(page, ALL_MODULES);
  let beans = BEANS;
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];

  await page.route('**/api/pos/products', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [beans, MILK, LATTE] });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/pos/variants/30', async (route) => {
    patches.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: LATTE });
  });
  await page.route('**/api/pos/variants/10', async (route) => {
    // Thousandths of a kopeck per gram (migration 103): the server keeps the
    // precise figure and its rounded copy side by side.
    const body = route.request().postDataJSON() as { cost_milli: number };
    patches.push({ url: route.request().url(), body });
    beans = {
      ...BEANS,
      variants: [{ ...BEANS.variants[0], cost_milli: body.cost_milli, cost_cents: Math.round(body.cost_milli / 1000) }],
    };
    await route.fulfill({ json: beans });
  });

  await loginAsOwner(page);

  // 1. From anywhere in the cabinet: the name, then straight to the recipe.
  await page.getByRole('combobox', { name: 'Пошук у кабінеті' }).fill('латте');
  await page.getByTestId('sidebar-recipe-product:3').click();
  await expect(page).toHaveURL(/\/admin\/tech-cards\?open=3$/);
  const dialog = page.getByTestId('recipe-dialog');
  await expect(dialog.getByRole('heading', { name: 'Латте' })).toBeVisible();

  // 2. The beans have never been received with a price: no food cost, and why.
  await expect(dialog.getByTestId('recipe-totals')).toContainText('немає ціни: Зерно арабіка');

  // 3. More milk, and the beans by what reaches the cup: a tenth is lost in the
  //    grinder, so 18 г net is 20 г off the shelf — worked out, not typed. One
  //    request, with the whole recipe of this one size.
  await dialog.getByTestId('recipe-gross-net').click();
  const beansRow = dialog.getByTestId('composition-row').nth(0);
  await beansRow.getByLabel('Втрати «Зерно арабіка», %').fill('10');
  await beansRow.getByLabel('Нетто', { exact: true }).fill('18');
  await expect(beansRow.getByLabel('Брутто', { exact: true })).toHaveValue('20');
  await dialog.getByTestId('composition-row').nth(1).getByLabel('Брутто', { exact: true }).fill('250');
  await expect(dialog.getByTestId('recipe-yield')).toHaveText('Вихід ≈ 268 г');
  await dialog.getByTestId('recipe-dialog-save').click();
  await expect.poll(() => patches.find((p) => p.url.endsWith('/variants/30'))?.body).toEqual({
    components: [
      { component_variant_id: 10, quantity: 20, loss_bps: 1000 },
      { component_variant_id: 20, quantity: 250, loss_bps: 0 },
    ],
    price_cents: 7500,
  });
  await expect(dialog).toBeHidden();

  // 4. The dish is flagged; the ingredient is first on its own tab. 637,50 ₴/кг
  //    — with its kopecks: whole kopecks a gram would have stored 640.
  await expect(page.getByTestId('tech-card-3').getByTestId('tech-reason')).toContainText('немає ціни: Зерно арабіка');
  await page.getByTestId('tech-tab-ingredients').click();
  const price = page.getByTestId('ingredient-price-10');
  await price.fill('637,50');
  await price.press('Enter');
  await expect.poll(() => patches.find((p) => p.url.endsWith('/variants/10'))?.body).toEqual({ cost_milli: 63_750 });
  await expect(price).toHaveValue('637.50');
  await expect(page.getByTestId('tech-cards-flash')).toContainText('собівартість перераховано в 1 рецепті');

  // 5. And the dish has an honest figure: 18 г × 63,75 коп + 200 мл × 4 коп = 19,475 ₴ of 75 ₴.
  await page.getByTestId('tech-tab-dishes').click();
  await expect(page.getByTestId('tech-card-3').getByTestId('tech-food-cost')).toHaveText('26,0 %');
});
