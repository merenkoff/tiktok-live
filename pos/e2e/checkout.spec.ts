import { expect, test } from '@playwright/test';
import { catalog, loginAsOwner, mockPosApi } from './helpers';

test('the till renders the catalog it is served', async ({ page }) => {
  await mockPosApi(page);
  await loginAsOwner(page);

  await page.goto('/register');

  for (const item of catalog) {
    await expect(page.getByText(item.product_name).first()).toBeVisible();
  }
});

test('a ПРРО outage is readable on top of the payment screen, and the cart survives', async ({
  page,
}) => {
  // The regression this guards: the payment modal is an opaque full-screen
  // overlay, and the checkout error used to be written to a banner *behind* it
  // — so a cashier saw the button label change and nothing else. A 503 also
  // means the server wrote nothing at all, which is why retrying is safe and
  // the cart must still be there to retry with.
  await mockPosApi(page);
  await page.route('**/api/pos/sales/complete', async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        error: 'fiscal_unavailable',
        code: 'unavailable',
        message: 'Немає звʼязку з ПРРО — спробуйте ще раз',
        support_code: 'FS-UNAVAILABLE-503',
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(catalog[0].product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();

  const dialogEarly = page.getByRole('dialog', { name: 'Оплата' });
  await dialogEarly.getByRole('button', { name: 'Готівка' }).click();
  await dialogEarly.getByRole('button', { name: /^Прийняти/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Немає звʼязку з ПРРО');
  await expect(dialog.getByRole('alert')).toContainText('FS-UNAVAILABLE-503');
});

test('a long category row scrolls instead of pushing the receipt off the screen', async ({ page }) => {
  // The regression this guards: the catalog column was `1fr`, which never
  // shrinks below its content, so a shop with nine tags in the category row
  // (the clothing demo) pushed the receipt past the right edge on a 1366 px
  // till — «Оплатити» was a sliver at the border.
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockPosApi(page);
  const names = ['Футболки', 'Худі та светри', 'Джинси й штани', 'Сорочки', 'Сукні та спідниці',
    'Верхній одяг', 'Взуття', 'Аксесуари', 'Нижня білизна'];
  await page.route('**/api/pos/tags', async (route) => {
    await route.fulfill({
      json: names.map((name, i) => ({
        id: 100 + i,
        store_id: 1,
        parent_id: null,
        name,
        sort_order: i,
        color: null,
        show_in_catalog_bar: true,
        children: [],
      })),
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Нижня білизна' })).toBeAttached();

  const pay = page.getByRole('button', { name: /^Оплатити/ }).first();
  const box = await pay.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1366);
  const receipt = await page.getByTestId('sale-sidebar').boundingBox();
  expect(receipt!.x + receipt!.width).toBeLessThanOrEqual(1366);
});
