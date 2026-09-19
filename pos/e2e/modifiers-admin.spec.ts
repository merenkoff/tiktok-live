import { expect, test } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The owner's modifiers end to end: a question is asked on `/admin/modifiers`,
 * gets an answer that takes milk off the shelf, and is attached to a drink in
 * the product card. What this pins is the wire: the group leaves with its
 * range, the answer with a delta in kopecks and its component, and the
 * product's questions leave as an ordered list of ids.
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

test('the owner asks a question, gives it an answer that takes milk, and attaches it to a drink', async ({
  page,
}) => {
  await mockPosApi(page, ALL_MODULES);
  const groups: Array<typeof GROUP> = [];
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];

  await page.route('**/api/pos/products', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [CUP, MILK] });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/pos/modifier-groups', async (route) => {
    if (route.request().method() === 'POST') {
      sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
      groups.push(GROUP);
      await route.fulfill({ status: 201, json: GROUP });
      return;
    }
    await route.fulfill({ json: groups });
  });
  await page.route('**/api/pos/modifier-groups/7/modifiers', async (route) => {
    sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const answer = {
      id: 71,
      group_id: 7,
      name: 'вівсяне',
      price_delta_cents: 1500,
      component_variant_id: 20,
      component_quantity: 200,
      component: { product_name: 'Молоко вівсяне', label: '', unit: 'мл' },
      is_default: false,
      sort_order: 0,
      is_active: true,
    };
    groups[0] = { ...GROUP, modifiers: [answer] };
    await route.fulfill({ status: 201, json: groups[0] });
  });
  await page.route('**/api/pos/products/1/modifier-groups', async (route) => {
    sent.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: groups });
  });
  await page.route('**/api/pos/products/1/tags', async (route) =>
    route.fulfill({ json: { tag_ids: [] } })
  );
  await page.route('**/api/pos/products/1', async (route) => route.fulfill({ json: CUP }));
  await page.route('**/api/pos/variants/10', async (route) => route.fulfill({ json: CUP }));

  await loginAsOwner(page);

  // 1. The question.
  await page.goto('/admin/modifiers');
  await page.getByTestId('group-form-name').fill('Молоко');
  await page.getByTestId('group-form-submit').click();
  const card = page.getByTestId('group-card-7');
  await expect(card).toBeVisible();
  expect(sent[0].body).toEqual({ name: 'Молоко', min_select: 1, max_select: 1 });

  // 2. An answer that costs 15 ₴ more and takes 200 ml of oat milk.
  await card.getByTestId('modifier-form-name').fill('вівсяне');
  await card.getByTestId('modifier-form-delta').fill('15');
  await card.getByTestId('modifier-form-component').selectOption('20');
  await card.getByTestId('modifier-form-qty').fill('200');
  await card.getByTestId('modifier-form-submit').click();
  await expect(card.getByTestId('modifier-row')).toHaveCount(1);
  await expect(card.getByTestId('modifier-row').first()).toContainText('+15,00 ₴');
  expect(sent[1].body).toEqual({
    name: 'вівсяне',
    price_delta_cents: 1500,
    is_default: false,
    component_variant_id: 20,
    component_quantity: 200,
  });

  // 3. The drink asks it.
  await page.goto('/admin/products');
  await page
    .locator('section', { hasText: 'Латте' })
    .getByRole('button', { name: 'Редагувати' })
    .click();
  await page.getByTestId('modifier-group-chip-7').click();
  await expect(page.getByTestId('modifier-group-chip-7')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Зберегти' }).click();

  await expect
    .poll(() => sent.find((s) => s.url.endsWith('/products/1/modifier-groups'))?.body)
    .toEqual({ group_ids: [7] });
});
