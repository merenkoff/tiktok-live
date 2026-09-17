import { expect, test, type Page, type Route } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * Composite products end to end in the admin shell: the owner builds a bouquet
 * out of stems, and then assembles a batch of them on the production screen.
 *
 * What this pins is the contract the two screens share with the server — the
 * composition leaves as a whole (never merged key by key), a production run
 * posts as create → line → post against the real document endpoints, and a
 * derived composite is never offered as something to assemble, because it is
 * assembled by the sale itself.
 */

const STEM = {
  id: 1,
  name: 'Троянда Freedom',
  description: null,
  image_url: null,
  is_active: true,
  kind: 'simple',
  stock_mode: 'own',
  tag_ids: [],
  variants: [
    {
      id: 10,
      product_id: 1,
      attributes: {},
      label: 'Червона',
      unit: 'шт',
      sku: null,
      barcode: null,
      price_cents: 9000,
      cost_cents: 4000,
      is_active: true,
      quantity: 100,
    },
  ],
};

const WRAP = {
  ...STEM,
  id: 2,
  name: 'Крафт-пакування',
  variants: [{ ...STEM.variants[0], id: 20, product_id: 2, label: '', quantity: 40 }],
};

/** Assembled in advance, so the production screen may offer it. */
const OWN_BOUQUET = {
  ...STEM,
  id: 3,
  name: 'Букет «Ранковий»',
  kind: 'composite',
  stock_mode: 'own',
  variants: [
    {
      ...STEM.variants[0],
      id: 30,
      product_id: 3,
      label: 'Рожевий',
      price_cents: 65000,
      quantity: 2,
      components: [
        {
          id: 1,
          component_variant_id: 10,
          quantity: 6,
          sort_order: 0,
          product_name: 'Троянда Freedom',
          label: 'Червона',
          unit: 'шт',
        },
        {
          id: 2,
          component_variant_id: 20,
          quantity: 1,
          sort_order: 1,
          product_name: 'Крафт-пакування',
          label: '',
          unit: 'шт',
        },
      ],
    },
  ],
};

/** Assembled when it sells — never producible. */
const DERIVED_BOUQUET = {
  ...OWN_BOUQUET,
  id: 4,
  name: 'Букет «Ніжність»',
  stock_mode: 'derived',
  variants: [{ ...OWN_BOUQUET.variants[0], id: 40, product_id: 4, quantity: 16 }],
};

async function mockProducts(page: Page, products: unknown[]) {
  await page.route('**/api/pos/products', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: products });
      return;
    }
    await route.fallback();
  });
}

test('the owner gives a bouquet its composition', async ({ page }) => {
  await mockPosApi(page, ALL_MODULES);
  await mockProducts(page, [STEM, WRAP, OWN_BOUQUET]);

  const variantPatches: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/variants/30', async (route) => {
    variantPatches.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: OWN_BOUQUET });
  });
  await page.route('**/api/pos/products/3', async (route) => route.fulfill({ json: OWN_BOUQUET }));
  await page.route('**/api/pos/products/3/tags', async (route) =>
    route.fulfill({ json: { tag_ids: [] } })
  );

  await loginAsOwner(page);
  await page.goto('/admin/products');

  await expect(page.getByText('Складений · збираємо')).toBeVisible();

  await page
    .locator('section', { hasText: 'Букет «Ранковий»' })
    .getByRole('button', { name: 'Редагувати' })
    .click();

  // Six stems and a wrap go in today. The florist makes it nine stems and
  // drops the wrap.
  const rows = page.getByTestId('composition-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Троянда Freedom · Червона');
  await expect(rows.nth(1)).toContainText('Крафт-пакування');

  await rows.first().getByLabel('Кількість', { exact: true }).fill('9');
  await rows.nth(1).getByRole('button', { name: 'Прибрати' }).click();
  await expect(rows).toHaveCount(1);

  await page.getByRole('button', { name: 'Зберегти' }).click();

  await expect.poll(() => variantPatches.length).toBeGreaterThan(0);
  // The composition travels whole — that is how "remove this component" is
  // expressible at all, and it is exactly how the server stores it.
  expect(variantPatches[0].components).toEqual([{ component_variant_id: 10, quantity: 9 }]);
});

test('an existing plain product can be turned into a bouquet', async ({ page }) => {
  // The gap this covers: the composition editor used to appear only for a
  // product that was *already* composite, and nothing in the UI ever sent
  // `kind`/`stock_mode`. A shop with a catalogue of stems could not make a
  // bouquet out of any of them.
  await mockPosApi(page, ALL_MODULES);
  await mockProducts(page, [STEM, WRAP]);

  const productPatches: Array<Record<string, unknown>> = [];
  const variantPatches: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/products/2', async (route) => {
    productPatches.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: WRAP });
  });
  await page.route('**/api/pos/variants/20', async (route) => {
    variantPatches.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: WRAP });
  });
  await page.route('**/api/pos/products/2/tags', async (route) =>
    route.fulfill({ json: { tag_ids: [] } })
  );

  await loginAsOwner(page);
  await page.goto('/admin/products');

  await page
    .locator('section', { hasText: 'Крафт-пакування' })
    .getByRole('button', { name: 'Редагувати' })
    .click();

  // Nothing composite on screen until it is chosen.
  await expect(page.getByTestId('composition-row')).toHaveCount(0);

  await page
    .getByLabel('Що це за товар')
    .selectOption({ label: 'Складений — збирається при продажу' });

  // The editor appears immediately, before saving. `.first()` because the edit
  // form carries one editor per variant plus one on the "+ Варіант" row.
  await page
    .getByLabel('Складник', { exact: true })
    .first()
    .selectOption({ label: 'Троянда Freedom · Червона' });
  await page.getByLabel('Кількість складника').first().fill('5');
  await page.getByRole('button', { name: '+ Додати' }).first().click();
  await expect(page.getByTestId('composition-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Зберегти' }).click();

  await expect.poll(() => productPatches.length).toBeGreaterThan(1);
  // Simple → derived cannot be one write: the server refuses a composition on
  // a simple product, and refuses `derived` until every variant is composed.
  // So it goes through `own`, the composition lands, then the mode flips.
  expect(productPatches[0]).toMatchObject({ kind: 'composite', stock_mode: 'own' });
  expect(variantPatches[0].components).toEqual([{ component_variant_id: 10, quantity: 5 }]);
  expect(productPatches[productPatches.length - 1]).toMatchObject({ stock_mode: 'derived' });
});

test('a production run posts as one document and never offers a derived bouquet', async ({
  page,
}) => {
  await mockPosApi(page, ALL_MODULES);
  await mockProducts(page, [STEM, WRAP, OWN_BOUQUET, DERIVED_BOUQUET]);

  const lines: Array<Record<string, unknown>> = [];
  let posted = false;
  await page.route('**/api/pos/stock/documents', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { id: 77, type: 'production', status: 'draft' } });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/pos/stock/documents/77/lines', async (route) => {
    lines.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { id: 1 } });
  });
  await page.route('**/api/pos/stock/documents/77/post', async (route) => {
    posted = true;
    await route.fulfill({ json: { id: 77, type: 'production', status: 'posted' } });
  });
  await page.route('**/api/pos/stock/documents/77', async (route) =>
    route.fulfill({
      json: { id: 77, type: 'production', status: 'posted', doc_number: 'ВР-000001', lines: [] },
    })
  );

  await loginAsOwner(page);
  await page.goto('/admin/stock/production');

  const picker = page.getByLabel('Що збираємо');
  // The list is populated by the products fetch; reading it before that lands
  // would pass for the wrong reason (an empty select offers nothing either).
  await expect(picker.locator('option')).not.toHaveCount(1);
  const offered = await picker.locator('option').allTextContents();
  expect(offered.some((o) => o.includes('Ранковий'))).toBe(true);
  // Assembled by the sale itself — producing it would write off the stems into
  // a stock row nobody ever reads.
  expect(offered.some((o) => o.includes('Ніжність'))).toBe(false);

  await picker.selectOption({ label: 'Букет «Ранковий» · Рожевий' });
  await page.getByLabel('Скільки зібрати').fill('3');

  // The bill of materials is what the florist checks before pressing the button.
  await expect(page.getByText('18 шт')).toBeVisible();
  await expect(page.getByText('є 100 шт')).toBeVisible();

  await page.getByRole('button', { name: 'Зібрати і провести' }).click();

  await expect.poll(() => posted).toBe(true);
  expect(lines).toEqual([{ variant_id: 30, quantity: 3 }]);
  await page.waitForURL(/\/admin\/stock\/documents\/77$/);
});
