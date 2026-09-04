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
