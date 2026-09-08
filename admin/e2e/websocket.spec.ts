import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket, signIn } from './helpers';

test.describe('websocket', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
    await signIn(page);
    await page.goto('/');
  });

  test('shows connected indicator and initial logs', async ({ page }) => {
    await expect(page.getByText(/підключено/i).first()).toBeVisible();
    await expect(page.getByText('E2E log line')).toBeVisible();
  });
});
