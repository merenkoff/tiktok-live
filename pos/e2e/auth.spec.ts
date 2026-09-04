import { expect, test } from '@playwright/test';
import { loginAsOwner, mockPosApi } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockPosApi(page);
});

test('shows the login form when there is no session', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продавець (PIN)' })).toBeVisible();
});

test('an owner signs in and lands in the admin area', async ({ page }) => {
  await loginAsOwner(page);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('link', { name: 'Сьогодні' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo Store' })).toBeVisible();
});

test('the session survives a reload', async ({ page }) => {
  await loginAsOwner(page);
  await expect(page).toHaveURL(/\/admin$/);

  await page.reload();

  await expect(page.getByRole('link', { name: 'Сьогодні' })).toBeVisible();
});

test('signing out returns to the login form', async ({ page }) => {
  await loginAsOwner(page);
  await page.getByRole('button', { name: 'Вийти' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
});
