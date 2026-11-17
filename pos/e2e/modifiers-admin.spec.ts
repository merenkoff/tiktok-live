import { expect, test } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The owner's modifiers end to end, the way a café owner meets them — from the
 * dish. In the product card the drink has no questions; «Новий модифікатор»
 * makes «Молоко» with an answer that takes oat milk off the shelf, without
 * leaving the card, and the card then asks it. On «Модифікатори» the same
 * question says who asks it. What this pins is the wire: the question leaves
 * WHOLE in one request (its range, the answer with a delta in kopecks and its
 * component), and the product's questions leave as an ordered list of ids.
 */

const CUP = {
  id: 1,
  name: 'Латте',
  description: null,
  image_url: null,
  is_active: true,
  kind: 'composite',
  stock_mode: 'derived',
  sellable: true,
  tag_ids: [],
  modifier_group_ids: [],
  variants: [
    {
      id: 10,
      product_id: 1,
      attributes: { size: 'M' },
      label: 'M',
      unit: 'шт',
      sku: null,
      barcode: null,
      price_cents: 6500,
      cost_cents: 0,
      is_active: true,
      quantity: 0,
      components: [],
    },
  ],
};

const MILK = {
  ...CUP,
  id: 2,
  name: 'Молоко вівсяне',
  kind: 'simple',
  stock_mode: 'own',
  sellable: false,
  variants: [
    {
      ...CUP.variants[0],
      id: 20,
      product_id: 2,
      attributes: {},
      label: '',
      unit: 'мл',
      price_cents: 0,
      quantity: 5000,
      components: undefined,
    },
  ],
};

const GROUP = {
  id: 7,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  sort_order: 0,
  is_active: true,
  modifiers: [] as unknown[],
};

test('the owner makes a question from the dish, gives it an answer that takes milk, and the dish asks it', async ({
  page,
}) => {
  await mockPosApi(page, ALL_MODULES);
  const groups: Array<Record<string, unknown>> = [];
  const sent: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  let cup = CUP;

  await page.route('**/api/pos/products', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [cup, MILK] });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/pos/modifier-groups', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      sent.push({ method: 'POST', url: route.request().url(), body });
      const answer = {
        id: 71,
        group_id: 7,
        name: 'вівсяне',
        price_delta_cents: 1500,
        label_deltas: [],
        component_variant_id: 20,
        component_quantity: 200,
        component: { product_name: 'Молоко вівсяне', label: '', unit: 'мл' },
        is_default: false,
        sort_order: 0,
        is_active: true,
      };
      const created = { ...GROUP, modifiers: [answer], labels_in_use: [], product_ids: [] };
      groups.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fulfill({ json: groups });
  });
  await page.route('**/api/pos/products/1/modifier-groups', async (route) => {
    sent.push({ method: 'PUT', url: route.request().url(), body: route.request().postDataJSON() });
    cup = { ...CUP, modifier_group_ids: [7] as never[] };
    groups[0] = { ...groups[0], product_ids: [1] };
    await route.fulfill({ json: groups });
  });
  await page.route('**/api/pos/products/1/tags', async (route) =>
    route.fulfill({ json: { tag_ids: [] } })
  );
  await page.route('**/api/pos/products/1', async (route) => route.fulfill({ json: cup }));
  await page.route('**/api/pos/variants/10', async (route) => route.fulfill({ json: cup }));

  await loginAsOwner(page);

  // 1. The dish asks nothing yet, and the store has no questions: one button.
  await page.goto('/admin/products');
  await page.getByRole('link', { name: 'Латте' }).click();
  await expect(page).toHaveURL(/\/admin\/products\/1$/);
  await expect(page.getByTestId('product-modifier-add')).toHaveText('Новий модифікатор');
  await page.getByTestId('product-modifier-add').click();

  // 2. The question, required, with an answer that costs 15 ₴ more and takes
  //    200 ml of oat milk — found by typing, not scrolled to.
  const dialog = page.getByTestId('modifier-group-dialog');
  await dialog.getByTestId('modifier-group-name').fill('Молоко');
  await dialog.getByTestId('modifier-required').check();
  const row = dialog.getByTestId('answer-row-new');
  await row.getByTestId('answer-name').fill('вівсяне');
  const answer = dialog.getByTestId('answer-row').first();
  await answer.getByTestId('answer-delta').fill('15');
  await answer.getByTestId('answer-more').click();
  await answer.getByRole('combobox').fill('вівс');
  await answer.getByRole('option', { name: /Молоко вівсяне/ }).click();
  await answer.getByTestId('answer-component-qty').fill('200');
  await expect(dialog.getByTestId('modifier-preview')).toContainText('вівсяне+15 ₴');
  await dialog.getByTestId('modifier-group-save').click();

  await expect.poll(() => sent[0]?.body).toEqual({
    name: 'Молоко',
    min_select: 1,
    max_select: 1,
    is_active: true,
    modifiers: [
      {
        name: 'вівсяне',
        price_delta_cents: 1500,
        // Sent every time, wholesale — no size has a price of its own here (066).
        label_deltas: [],
        is_default: false,
        is_active: true,
        component_variant_id: 20,
        component_quantity: 200,
      },
    ],
  });

  // 3. The card asks it — as a row that says what it asks — once it is saved.
  const attached = page.getByTestId('product-modifier-7');
  await expect(attached).toContainText('Молоко');
  await expect(attached).toContainText('вівсяне +15 ₴');
  await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
  await expect
    .poll(() => sent.find((s) => s.url.endsWith('/products/1/modifier-groups'))?.body)
    .toEqual({ group_ids: [7] });

  // 4. «Модифікатори» says who asks it.
  await page.goto('/admin/modifiers');
  const card = page.getByTestId('group-card-7');
  await expect(card.getByTestId('group-answers')).toHaveText('вівсяне +15 ₴');
  await expect(card.getByTestId('group-usage-7')).toContainText('Латте');
});
