import { expect, test, type Page } from '@playwright/test';

/**
 * `/super` — the cross-store admin (TechDocs/POS_SUPER_ADMIN.md): password
 * login, the store table, and re-pointing a module URL across stores. The API
 * is mocked; what is under test is the page and its use of the super client.
 */

const PASSWORD = 'e2e-super-password-1';
const OLD = 'https://cdn.jsdelivr.net/gh/o/r@module-tiktok-live-v1.0.0/tiktok-live/remote-entry.js';
const NEW = 'https://cdn.jsdelivr.net/gh/o/r@module-tiktok-live-v1.2.0/tiktok-live/remote-entry.js';

async function mockSuperApi(page: Page) {
  const calls: Array<{ path: string; body: unknown; token: string | undefined }> = [];
  let currentUrl = OLD;
  const stores = () => [
    {
      id: 1, name: 'Demo Store', slug: 'demo', currency: 'UAH', created_at: '2026-01-01T00:00:00Z',
      enabled_modules: ['returns', 'customers'],
      module_remotes: { 'tiktok-live': { url: currentUrl, title: 'Прямий ефір', routePath: '/live', nav: [{ label: 'Ефір', location: 'cashier-primary', order: 85 }] } },
      live_tiktok_username: 'demo.shop', fiscal: { enabled: true, provider: 'checkbox' }, staff_count: 3, last_sale_at: '2026-09-09T10:00:00Z',
    },
    {
      id: 2, name: 'Second Store', slug: 'second', currency: 'UAH', created_at: '2026-02-01T00:00:00Z',
      enabled_modules: ['returns'], module_remotes: {}, live_tiktok_username: null, fiscal: { enabled: false, provider: null }, staff_count: 1, last_sale_at: null,
    },
  ];

  await page.route('**/api/pos/super/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/api\/pos\/super/, '');
    const token = req.headers()['x-pos-super-token'];
    const body = req.method() === 'GET' ? null : req.postDataJSON();
    calls.push({ path, body, token });

    if (path === '/login') {
      if ((body as { password?: string }).password !== PASSWORD) {
        await route.fulfill({ status: 401, json: { error: 'Invalid password' } });
        return;
      }
      await route.fulfill({ json: { token: '9999999999999.e2e', expires_at: '2099-01-01T00:00:00Z' } });
      return;
    }
    if (token !== '9999999999999.e2e') {
      await route.fulfill({ status: 401, json: { error: 'Super access required' } });
      return;
    }
    if (path === '/stores') {
      await route.fulfill({ json: stores() });
      return;
    }
    if (path === '/module-remotes/repoint') {
      currentUrl = (body as { url: string }).url;
      await route.fulfill({ json: { updated: [{ id: 1, slug: 'demo' }], skipped: [{ id: 2, slug: 'second' }], failed: [] } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: 'not found' } });
  });
  return calls;
}

test('the super admin logs in, sees every store and re-points a module release', async ({ page }) => {
  const calls = await mockSuperApi(page);
  await page.goto('/super');

  await page.getByLabel('Пароль').fill('wrong');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByText('Невірний пароль.')).toBeVisible();

  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();

  await expect(page.getByText('Demo Store').first()).toBeVisible();
  await expect(page.getByText('Second Store').first()).toBeVisible();
  await expect(page.getByText('tiktok-live 1.0.0')).toBeVisible();
  await expect(page.getByText('увімк. · checkbox')).toBeVisible();

  await page.getByLabel('Новий URL').fill(NEW);
  await expect(page.getByText('Версія з URL: 1.2.0')).toBeVisible();
  await page.getByRole('button', { name: /Застосувати до 1/ }).click();

  await expect(page.getByRole('status')).toContainText('Оновлено: 1 (demo)');
  await expect(page.getByRole('status')).toContainText('Пропущено (модуля немає): second');
  await expect(page.getByText('tiktok-live 1.2.0')).toBeVisible();

  const repoint = calls.find((c) => c.path === '/module-remotes/repoint');
  expect(repoint?.token).toBe('9999999999999.e2e');
  expect(repoint?.body).toEqual({ module_id: 'tiktok-live', url: NEW, store_ids: [1] });
});

test('the super session lives in the tab: a reload keeps it, "Вийти" ends it', async ({ page }) => {
  await mockSuperApi(page);
  await page.goto('/super');
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByText('Demo Store').first()).toBeVisible();

  await page.reload();
  await expect(page.getByText('Demo Store').first()).toBeVisible();

  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page.getByLabel('Пароль')).toBeVisible();
});
