import { test, expect } from '@playwright/test';
import { mockApi, mockWebSocket, signIn } from './helpers';

test.describe('auth', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebSocket(page);
    await mockApi(page);
  });

  // The login form is gone: `POST /api/auth/login` authenticated on a TikTok
  // nickname alone, and a nickname is public. What a visitor gets now is a
  // pointer at the POS, where a real session exists.
  test('shows the retirement notice instead of a login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/більше не використовується/i)).toBeVisible();
    await expect(page.getByTestId('login-form')).toHaveCount(0);
    await expect(page.locator('input')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Перейти до POS/i })).toHaveAttribute(
      'href',
      'https://pos.the-live.shop'
    );
  });

  test('a stored session still opens the session page', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Live Session' })).toBeVisible();
    await expect(page.getByTestId('session-start')).toBeVisible();
  });

  test('an invalid stored token falls back to the notice', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    });

    await page.goto('/');
    await expect(page.getByText(/більше не використовується/i)).toBeVisible();
  });

  test('logout leaves the visitor at the notice', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page.getByTestId('session-start')).toBeVisible();
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page.getByText(/більше не використовується/i)).toBeVisible();
  });
});
