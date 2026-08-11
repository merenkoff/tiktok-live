import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket } from './helpers';

test.describe('session', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
    await page.goto('/');
    await page.getByTestId('login-username').fill('evelin_kids');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('session-start')).toBeVisible();
  });

  test('start and stop session', async ({ page }) => {
    await page.getByTestId('session-start').click();
    await expect(page.getByTestId('session-stop')).toBeVisible();
    await expect(page.getByText(/Активна/i)).toBeVisible();
    await page.getByTestId('session-stop').click();
    await expect(page.getByTestId('session-start')).toBeVisible();
  });
});
