import { expect, test, type Page } from '@playwright/test';

/**
 * `/super` — the cross-store admin (TechDocs/POS_SUPER_ADMIN.md): password
 * login, the store table, and re-pointing a module URL across stores. The API
 * is mocked; what is under test is the page and its use of the super client.
 */

const PASSWORD = 'e2e-super-password-1';
const OLD = 'https://cdn.jsdelivr.net/gh/o/r@module-tiktok-live-v1.0.0/tiktok-live/remote-entry.js';
const NEW = 'https://cdn.jsdelivr.net/gh/o/r@module-tiktok-live-v1.2.0/tiktok-live/remote-entry.js';

/** One lead from the café landing, as `/api/pos/super/leads` answers (TechDocs/CRM_LEADS.md). */
const lead = { status: 'new' as string, note: '' };
const TOUCH = {
  id: 70,
  created_at: '2026-10-24T09:30:00Z',
  form_id: 'vertical-kafe',
  intent: 'demo',
  product: 'kafe',
  business: null,
  page_path: '/pos/kafe',
  name_given: 'Олена',
  journey: {
    first: { ref: 'chatgpt.com', landing: '/pos/kafe' },
    visits: 2,
    ctas: [{ id: 'pricing-fix-price', p: '/pos/kafe' }, { id: 'download-windows', p: '/pos' }],
    pages: [{ p: '/pos/kafe' }, { p: '/pos' }],
    device: 'desktop',
  },
  source: 'AI-асистент: ChatGPT',
  first_source: 'AI-асистент: ChatGPT',
  signals: ['Дивився ціни', 'Завантажив касу (Windows)', '2-й візит', 'Прийшов з ChatGPT'],
  days_to_lead: 1,
};
const LEAD_ROW = () => ({
  id: 7, phone: '+380671234567', name: 'Олена', status: lead.status, note: lead.note,
  created_at: '2026-10-23T09:00:00Z', last_touch_at: '2026-10-24T09:30:00Z', touches: 1, interest: 'kafe', last: TOUCH,
});
const LEAD_CARD = () => {
  const { last: _last, ...row } = LEAD_ROW();
  return { ...row, history: [TOUCH] };
};

async function mockSuperApi(page: Page) {
  lead.status = 'new';
  lead.note = '';
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
    if (path === '/stores/1/import/choiceqr') {
      const b = body as { url: string; apply?: boolean; offset?: number; limit?: number };
      if (!b.url.includes('.choiceqr.com')) {
        await route.fulfill({ status: 400, json: { error: 'Посилання має вести на меню ChoiceQR: https://<заклад>.choiceqr.com/menu' } });
        return;
      }
      if (!b.apply) {
        await route.fulfill({
          json: {
            place: { name: 'Корчма', address: 'вул. Тестова, 1', phone: null, hours: { '1': { open: '11:00', close: '22:00' } }, logo: true },
            tags: [
              { name: 'Перші страви', station: 'kitchen', exists: false, products: 2 },
              { name: 'Холодні напої', station: 'bar', exists: false, products: 1 },
            ],
            products: [
              { name: 'Борщ', tag: 'Перші страви', variants: [{ size: '300 г', price_cents: 15500 }], photo_url: 'x', exists: false },
              { name: 'Бульйон', tag: 'Перші страви', variants: [{ size: '300 г', price_cents: 12000 }], photo_url: null, exists: false },
              { name: 'Взвар', tag: 'Холодні напої', variants: [{ size: '1 л', price_cents: 11000 }, { size: '300 мл', price_cents: 4000 }], photo_url: 'y', exists: false },
            ],
            warnings: ['Ціна 0 ₴: Хліб — перевірте.'],
            totals: { tags_new: 2, products_new: 3, products_existing: 0, variants_new: 4, photos: 2 },
          },
        });
        return;
      }
      const first = (b.offset ?? 0) === 0;
      await route.fulfill({
        json: first
          ? { total: 3, next_offset: 2, done: false, created: ['Борщ', 'Бульйон'], skipped_existing: 0, photos_failed: [], profile: ['адреса', 'логотип'] }
          : { total: 3, next_offset: 3, done: true, created: ['Взвар'], skipped_existing: 0, photos_failed: ['Взвар'] },
      });
      return;
    }
    if (path === '/stores' && req.method() === 'POST') {
      const b = body as { name: string; slug: string; template_store_id: number | null };
      if (b.slug === 'demo') {
        await route.fulfill({ status: 409, json: { error: 'Код «demo» уже зайнятий' } });
        return;
      }
      await route.fulfill({
        status: 201,
        json: {
          id: 3, name: b.name, slug: b.slug, currency: 'UAH', created_at: '2026-10-26T10:00:00Z', vertical: 'cafe',
          enabled_modules: ['returns'], module_remotes: {}, live_tiktok_username: null,
          fiscal: { enabled: false, provider: null }, staff_count: 1, last_sale_at: null,
        },
      });
      return;
    }
    if (path === '/stores') {
      await route.fulfill({ json: stores() });
      return;
    }
    if (path === '/leads' && req.method() === 'GET') {
      await route.fulfill({ json: { items: [LEAD_ROW()], total: 1, counts: { new: lead.status === 'new' ? 1 : 0, contacted: 0, demo: lead.status === 'demo' ? 1 : 0, client: 0, lost: 0 } } });
      return;
    }
    if (path === '/leads/7' && req.method() === 'GET') {
      await route.fulfill({ json: LEAD_CARD() });
      return;
    }
    if (path === '/leads/7' && req.method() === 'PATCH') {
      Object.assign(lead, body as object);
      await route.fulfill({ json: LEAD_CARD() });
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

test('the «Ліди» tab lists the site leads with where they came from, and keeps a status', async ({ page }) => {
  const calls = await mockSuperApi(page);
  await page.goto('/super');
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByText('Demo Store').first()).toBeVisible();
  // The stores tab does not ask for leads it does not show.
  expect(calls.some((c) => c.path.startsWith('/leads'))).toBe(false);

  await page.getByRole('tab', { name: 'Ліди' }).click();
  await expect(page).toHaveURL(/\/super\/leads$/);
  const row = page.getByTestId('lead-row-7');
  await expect(row).toContainText('Олена');
  await expect(row).toContainText('+380671234567');
  await expect(row).toContainText('Кафе');
  await expect(row).toContainText('AI-асистент: ChatGPT');
  await expect(row).toContainText('Дивився ціни');

  await row.click();
  const card = page.getByRole('dialog', { name: 'Лід' });
  await expect(card).toContainText('vertical-kafe');
  await expect(card).toContainText('pricing-fix-price → download-windows');
  await expect(card).toContainText('днів до заявки: 1');

  await card.getByRole('button', { name: 'Демо' }).click();
  await expect(card.getByRole('button', { name: 'Демо' })).toHaveAttribute('aria-pressed', 'true');
  const patch = calls.find((c) => c.path === '/leads/7' && c.body);
  expect(patch?.body).toEqual({ status: 'demo' });
  expect(patch?.token).toBe('9999999999999.e2e');

  // The chips move the lead at once, before any re-read.
  await page.keyboard.press('Escape');
  const chips = page.getByRole('group', { name: 'Статус', exact: true });
  await expect(chips.getByRole('button', { name: /^Нові/ })).toHaveText('Нові 0');
  await expect(chips.getByRole('button', { name: /^Демо/ })).toHaveText('Демо 1');

  // A reload lands on the same tab.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Ліди' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('lead-row-7')).toContainText('Демо');
});


test('«Імпорт меню з ChoiceQR» previews the plan, then walks the chunks', async ({ page }) => {
  const calls = await mockSuperApi(page);
  await page.goto('/super');
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.getByRole('button', { name: 'Редагувати' }).first().click();

  const box = page.getByRole('region', { name: 'Імпорт меню з ChoiceQR' });
  await box.getByLabel('Посилання на меню ChoiceQR').fill('https://evil.example/menu');
  await box.getByRole('button', { name: 'Переглянути' }).click();
  await expect(box.getByText(/меню ChoiceQR: https:/)).toBeVisible();

  await box.getByLabel('Посилання на меню ChoiceQR').fill('https://korchma.choiceqr.com/menu');
  await box.getByRole('button', { name: 'Переглянути' }).click();
  await expect(box.getByTestId('choiceqr-totals')).toContainText('карток нових: 3 (4 варіантів)');
  await expect(box.getByText('Холодні напої · бар · 1')).toBeVisible();
  await expect(box.getByText('Ціна 0 ₴: Хліб — перевірте.')).toBeVisible();

  await box.getByRole('button', { name: 'Імпортувати 3' }).click();
  await expect(box.getByRole('status')).toContainText('Імпортовано карток: 3. Профіль: адреса, логотип. Без фото: Взвар.');

  const chunks = calls.filter((c) => c.path === '/stores/1/import/choiceqr' && (c.body as { apply?: boolean }).apply);
  expect(chunks.map((c) => (c.body as { offset: number }).offset)).toEqual([0, 2]);
});

test('«Новий магазин» opens a store from a template and never shows the password back', async ({ page }) => {
  const calls = await mockSuperApi(page);
  await page.goto('/super');
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByText('Demo Store').first()).toBeVisible();

  await page.getByRole('button', { name: 'Новий магазин' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новий магазин' });
  await dialog.getByLabel('Назва').fill('Шабля');
  // The code is suggested from the name until it is typed over.
  await expect(dialog.getByLabel('Код магазину')).toHaveValue('shablia');
  await dialog.getByLabel('Код магазину').fill('demo');
  await dialog.getByLabel('Шаблон').selectOption('1');
  await dialog.getByLabel('Логін власника').fill('owner@shablya.test');
  await dialog.getByLabel('Пароль власника').fill('short');
  await expect(dialog.getByRole('button', { name: 'Створити магазин' })).toBeDisabled();
  await dialog.getByLabel('Пароль власника').fill('typed-by-the-super-admin');

  // A taken code comes back in the server's words and keeps the form.
  await dialog.getByRole('button', { name: 'Створити магазин' }).click();
  await expect(dialog.getByText('Код «demo» уже зайнятий')).toBeVisible();

  await dialog.getByLabel('Код магазину').fill('Shablya');
  await expect(dialog.getByLabel('Код магазину')).toHaveValue('shablya');
  await dialog.getByRole('button', { name: 'Створити магазин' }).click();

  await expect(dialog).toBeHidden();
  const status = page.getByRole('status');
  await expect(status).toContainText('Магазин «Шабля» відкрито.');
  await expect(status).toContainText('shablya');
  await expect(status).toContainText('owner@shablya.test');
  await expect(page.locator('body')).not.toContainText('typed-by-the-super-admin');
  await expect(page.getByText('shablya · #3')).toBeVisible();

  const posts = calls.filter((c) => c.path === '/stores' && c.body);
  expect(posts.at(-1)).toEqual({
    path: '/stores',
    token: '9999999999999.e2e',
    body: {
      name: 'Шабля',
      slug: 'shablya',
      template_store_id: 1,
      owner_login: 'owner@shablya.test',
      owner_password: 'typed-by-the-super-admin',
    },
  });
});
