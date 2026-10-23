import { expect, test } from '@playwright/test';
import { loginAsOwner, mockPosApi } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockPosApi(page);
});

test('shows the login form when there is no session', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продавець · PIN' })).toBeVisible();
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

test('after signing out the store code is remembered and locked until «Змінити»', async ({
  page,
}) => {
  await loginAsOwner(page);
  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: 'Власник' }).click();
  const storeCode = page.getByLabel('Код магазину');
  await expect(storeCode).toHaveValue('demo');
  await expect(storeCode).toBeDisabled();

  // Only email + password are typed now, and the code still travels.
  const login = page.waitForRequest('**/api/pos/auth/owner/login');
  await page.getByLabel('Email / логін').fill('owner@demo.shop');
  await page.getByLabel('Пароль').fill('owner123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  expect((await login).postDataJSON()).toMatchObject({ store_slug: 'demo' });
  await page.waitForURL(/\/admin$/);

  await page.getByRole('button', { name: 'Вийти' }).click();
  await page.getByRole('button', { name: 'Змінити' }).click();
  await expect(page.getByLabel('Код магазину')).toBeEditable();
  await expect(page.getByLabel('Код магазину')).toBeFocused();
});

test('a session that predates the remembered code teaches it on reload', async ({ page }) => {
  await loginAsOwner(page);
  // A browser signed in before the code was remembered on the web.
  await page.evaluate(() => localStorage.removeItem('pos_last_store_slug'));

  await page.reload();
  await expect(page.getByRole('link', { name: 'Сьогодні' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pos_token'))).toBe('e2e-token');
  expect(await page.evaluate(() => localStorage.getItem('pos_last_store_slug'))).toBe('demo');
});
