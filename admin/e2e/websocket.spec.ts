import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket } from './helpers';

test.describe('websocket', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
    await page.goto('/');
    await page.getByTestId('login-username').fill('evelin_kids');
    await page.getByTestId('login-submit').click();
  });

  test('shows connected indicator and initial logs', async ({ page }) => {
    await expect(page.getByText(/підключено/i).first()).toBeVisible();
    await expect(page.getByText('E2E log line')).toBeVisible();
  });
});
