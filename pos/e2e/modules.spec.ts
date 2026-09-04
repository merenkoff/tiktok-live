import { expect, test } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The headline feature of the module platform: what the server says a store has
 * enabled decides what the browser mounts. Proven end-to-end, not just in the
 * route-gating unit tests.
 */
test('a store with stock enabled reaches the stock section', async ({ page }) => {
  await mockPosApi(page, ALL_MODULES);
  await loginAsOwner(page);

  await expect(page.getByRole('link', { name: 'Склад' })).toBeVisible();

  await page.getByRole('link', { name: 'Склад' }).click();
  await expect(page).toHaveURL(/\/admin\/stock$/);
});

test('a store with stock disabled loses the section and the route', async ({ page }) => {
  await mockPosApi(
    page,
    ALL_MODULES.filter((m) => m !== 'stock')
  );
  await loginAsOwner(page);

  await expect(page.getByRole('link', { name: 'Сьогодні' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Склад' })).toHaveCount(0);

  await page.goto('/admin/stock');
  await expect(page).toHaveURL(/\/admin$/);
});

test('core sections stay put when every toggleable module is off', async ({ page }) => {
  await mockPosApi(page, []);
  await loginAsOwner(page);

  await expect(page.getByRole('link', { name: 'Налаштування' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Товари' })).toHaveCount(0);
});
