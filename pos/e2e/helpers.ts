import type { Page, Route } from '@playwright/test';

export const ALL_MODULES = [
  'returns',
  'customers',
  'products',
  'stock',
  'analytics',
  'staff',
  'gtin-enrichment',
  'qr-payment',
];

const store = {
  id: 1,
  name: 'Demo Store',
  slug: 'demo',
  currency: 'UAH',
  timezone: 'Europe/Kyiv',
  qr_payment_enabled: false,
  qr_payment_mode: 'static',
  qr_static_image_url: null,
  qr_purpose_template: null,
  qr_iban: null,
  qr_edrpou: null,
  qr_recipient: null,
  gtin_lookup_enabled: false,
  gtin_api_key_set: false,
  gtin_daily_limit: null,
  auto_print_receipt: false,
};

export const catalog = [
  {
    variant_id: 1,
    product_id: 1,
    product_name: 'Футболка базова',
    size: 'M',
    color: 'Синій',
    sku: 'TS-M-BL',
    barcode: '4820000000001',
    price_cents: 45000,
    quantity: 5,
    image_url: null,
    tag_ids: [],
  },
  {
    variant_id: 2,
    product_id: 2,
    product_name: 'Кросівки бігові',
    size: '42',
    color: 'Білий',
    sku: 'SN-42-WH',
    barcode: '4820000000002',
    price_cents: 189000,
    quantity: 2,
    image_url: null,
    tag_ids: [],
  },
];

/**
 * Mocks the whole `/api/pos` surface off one route handler. `enabledModules`
 * drives the module gating the specs assert on; anything unmocked falls through
 * to an empty list so a page never crashes on a request the spec does not care
 * about.
 */
export async function mockPosApi(page: Page, enabledModules: string[] = ALL_MODULES) {
  const auth = {
    token: 'e2e-token',
    expires_at: '2099-01-01T00:00:00.000Z',
    staff: { id: 1, display_name: 'Олена', role: 'owner' },
    store: {
      id: 1,
      name: 'Demo Store',
      slug: 'demo',
      currency: 'UAH',
      auto_print_receipt: false,
      enabled_modules: enabledModules,
    },
  };

  const authorized = (route: Route) =>
    route.request().headers()['authorization']?.startsWith('Bearer ') ?? false;

  await page.route('**/api/pos/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.replace(/^.*\/api\/pos/, '');

    if (path === '/auth/owner/login') {
      const body = route.request().postDataJSON() as { password?: string };
      if (!body?.password) {
        await route.fulfill({ status: 401, json: { error: 'Невірний логін або пароль' } });
        return;
      }
      await route.fulfill({ json: auth });
      return;
    }

    if (path === '/auth/staff/pin') {
      await route.fulfill({
        json: { ...auth, staff: { id: 2, display_name: 'Ігор', role: 'seller' } },
      });
      return;
    }

    if (path === '/auth/logout') {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    if (path === '/me') {
      if (!authorized(route)) {
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        return;
      }
      await route.fulfill({ json: auth });
      return;
    }

    if (path === '/store') {
      await route.fulfill({ json: { ...store, enabled_modules: enabledModules } });
      return;
    }

    if (path === '/catalog') {
      await route.fulfill({ json: catalog });
      return;
    }

    if (path === '/analytics/summary') {
      await route.fulfill({
        json: {
          from: '2026-01-01',
          to: '2026-01-01',
          sales_count: 0,
          gross_cents: 0,
          refunded_cents: 0,
          net_cents: 0,
          avg_check_cents: 0,
          top_items: [],
          payments: [],
          daily: [],
        },
      });
      return;
    }

    // Everything else the admin pages poll for — empty is a valid answer.
    await route.fulfill({ json: [] });
  });
}

/** Signs in as the owner through the real login form. */
export async function loginAsOwner(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Власник' }).click();
  await page.getByLabel('Email / логін').fill('owner@demo.shop');
  await page.getByLabel('Пароль').fill('owner123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  // Every caller works inside the admin area; without this the next action can
  // race the login request and land back on the form.
  await page.waitForURL(/\/admin$/);
}
