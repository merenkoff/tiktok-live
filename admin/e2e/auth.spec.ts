import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket } from './helpers';

test.describe('auth', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
  });

  test('login opens session page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('login-form')).toBeVisible();
    await page.getByTestId('login-username').fill('evelin_kids');
    await page.getByTestId('login-submit').click();
    await expect(page.getByRole('heading', { name: 'Live Session' })).toBeVisible();
    await expect(page.getByTestId('session-start')).toBeVisible();
  });

  test('invalid stored token shows login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'stale');
      localStorage.setItem('user', JSON.stringify({ id: 1, tiktok_username: 'x' }));
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    });

    await page.goto('/');
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('logout returns to login', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-username').fill('evelin_kids');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('session-start')).toBeVisible();
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
