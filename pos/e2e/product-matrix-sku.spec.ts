import { expect, test } from '@playwright/test';
import { loginAsOwner, mockPosApi } from './helpers';

/**
 * Articles on a NEW garment. A clothing card is made as a size × colour
 * matrix, so that is where the owner needs «the next number» — the field with
 * «Наступний» used to exist only behind «Ще» on a card that was already there.
 * What this pins is the wire: every variant leaves with its own article,
 * counted on from the series the owner picked.
 */

const SERIES = [
  { prefix: '', width: 4, last: '0042', next: '0043', count: 210, inTag: 0, samples: ['Сукня', 'Джинси'] },
  { prefix: 'т', width: 3, last: 'т014', next: 'т015', count: 128, inTag: 0, samples: ['Футболка', 'Боді'] },
];

test('a new garment gets an article per variant, counted on from the series picked', async ({ page }) => {
  await mockPosApi(page);

  let sent: { name?: string; variants?: Array<{ attributes?: Record<string, string>; sku?: string }> } | null = null;
  const created = () => ({
    id: 50,
    name: sent?.name ?? '',
    description: null,
    image_url: null,
    is_active: true,
    kind: 'simple',
    stock_mode: 'own',
    sellable: true,
    tag_ids: [],
    modifier_group_ids: [],
    variants: (sent?.variants ?? []).map((v, i) => ({
      id: 500 + i,
      product_id: 50,
      attributes: v.attributes ?? {},
      label: Object.values(v.attributes ?? {}).join(' / '),
      unit: 'шт',
      sku: v.sku ?? null,
      barcode: null,
      price_cents: 40000,
      cost_cents: 0,
      is_active: true,
      quantity: 0,
    })),
  });

  await page.route('**/api/pos/variants/sku-series*', (route) => route.fulfill({ json: { series: SERIES } }));
  await page.route('**/api/pos/products', async (route) => {
    if (route.request().method() === 'POST') {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: created() });
      return;
    }
    await route.fulfill({ json: sent ? [created()] : [] });
  });

  await loginAsOwner(page);
  await page.goto('/admin/products/new');

  await page.getByPlaceholder('Назва').fill('Боді з коротким рукавом');
  await page.getByLabel('Новий колір').fill('беж');
  await page.getByLabel('Новий колір').press('Enter');
  const sizes = page.getByRole('group', { name: 'Розміри' });
  for (const size of ['62', '68', '74']) await sizes.getByRole('button', { name: size, exact: true }).click();
  await page.getByPlaceholder('Ціна, грн').fill('400');

  // Two series: nothing is picked for the owner, both are shown with what they are used for.
  await page.getByRole('button', { name: 'Наступний' }).click();
  const list = page.getByRole('group', { name: 'Серії артикулів' });
  await expect(list).toContainText('після 0042 · 210 шт · Сукня, Джинси');
  await expect(page.getByLabel('Артикул першого варіанта')).toHaveValue('');

  await list.getByText('т015').click();
  await expect(page.getByLabel('Артикул першого варіанта')).toHaveValue('т015');
  // Each row shows the number it will get.
  await expect(page.getByLabel('Артикул: беж / 74')).toHaveAttribute('placeholder', 'т017');

  await page.getByRole('button', { name: 'Створити' }).click();
  await page.waitForURL(/\/admin\/products\/50$/);

  expect(sent!.variants!.map((v) => [v.attributes?.size, v.sku])).toEqual([
    ['62', 'т015'],
    ['68', 'т016'],
    ['74', 'т017'],
  ]);
});
