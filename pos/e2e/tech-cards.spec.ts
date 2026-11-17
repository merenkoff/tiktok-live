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
    const body = route.request().postDataJSON() as { cost_cents: number };
    patches.push({ url: route.request().url(), body });
    beans = { ...BEANS, variants: [{ ...BEANS.variants[0], cost_cents: body.cost_cents }] };
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

  // 3. More milk — and one request, with the whole recipe of this one size.
  await dialog.getByTestId('composition-row').nth(1).getByLabel('Кількість', { exact: true }).fill('250');
  await dialog.getByTestId('recipe-dialog-save').click();
  await expect.poll(() => patches.find((p) => p.url.endsWith('/variants/30'))?.body).toEqual({
    components: [
      { component_variant_id: 10, quantity: 18 },
      { component_variant_id: 20, quantity: 250 },
    ],
    price_cents: 7500,
  });
  await expect(dialog).toBeHidden();

  // 4. The dish is flagged; the ingredient is first on its own tab. 600 ₴/кг.
  await expect(page.getByTestId('tech-card-3').getByTestId('tech-reason')).toContainText('немає ціни: Зерно арабіка');
  await page.getByTestId('tech-tab-ingredients').click();
  const price = page.getByTestId('ingredient-price-10');
  await price.fill('600');
  await price.press('Enter');
  await expect.poll(() => patches.find((p) => p.url.endsWith('/variants/10'))?.body).toEqual({ cost_cents: 60 });
  await expect(page.getByTestId('tech-cards-flash')).toContainText('собівартість перераховано в 1 рецепті');

  // 5. And the dish has an honest figure: 18 г × 60 коп + 200 мл × 4 коп = 18,80 ₴ of 75 ₴.
  await page.getByTestId('tech-tab-dishes').click();
  await expect(page.getByTestId('tech-card-3').getByTestId('tech-food-cost')).toHaveText('25,1 %');
});
