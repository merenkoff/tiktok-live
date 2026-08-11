import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket } from './helpers';

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
    await page.goto('/');
    await page.getByTestId('login-username').fill('evelin_kids');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('session-start')).toBeVisible();
  });

  test('opens settings and saves', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/i }).click();
    await expect(page.getByText('Налаштування')).toBeVisible();
    await expect(page.locator('input[name="novaposhta_merchant_name"]')).toHaveValue('Shop');
    await page.getByRole('button', { name: /Зберегти зміни/i }).click();
    await expect(page.getByText(/Налаштування збережено/i)).toBeVisible();
  });
});
