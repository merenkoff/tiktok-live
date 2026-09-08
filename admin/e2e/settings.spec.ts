import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket, signIn } from './helpers';

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
    await signIn(page);
    await page.goto('/');
    await expect(page.getByTestId('session-start')).toBeVisible();
  });

  test('opens settings and saves', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/i }).click();
    await expect(page.getByText('Налаштування')).toBeVisible();
    await expect(page.locator('input[name="novaposhta_merchant_name"]')).toHaveValue('Shop');
    await page.getByRole('button', { name: /Зберегти зміни/i }).click();
    await expect(page.getByText(/Налаштування збережено/i)).toBeVisible();
  });

  test('never puts a stored secret in the input', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/i }).click();
    // The API does not send secrets back at all; a blank field means "keep it".
    await expect(page.locator('input[name="telegram_bot_token"]')).toHaveValue('');
    await expect(page.getByText(/Збережено\. Введіть новий/i).first()).toBeVisible();
  });

  test('omits an untouched secret from the save', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/i }).click();
    await expect(page.locator('input[name="novaposhta_merchant_name"]')).toHaveValue('Shop');

    const [request] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes('/api/settings') && r.method() === 'PUT'
      ),
      page.getByRole('button', { name: /Зберегти зміни/i }).click(),
    ]);

    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body).not.toHaveProperty('telegram_bot_token');
    expect(JSON.stringify(body)).not.toContain('***');
  });
});
