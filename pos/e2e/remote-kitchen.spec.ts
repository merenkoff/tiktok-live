import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { hasPrivateModule } from './_private';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

// `remote-kitchen` and `vertical-cafe` are online-only modules whose sources
// are private (POS_OPENCORE.md §5); run this spec only where both are present.
test.skip(
  () => !hasPrivateModule('remote-kitchen') || !hasPrivateModule('vertical-cafe'),
  'remote-kitchen: private module (POS_OPENCORE §5)'
);

/**
 * «Віддалена кухня» (TechDocs/POS_REMOTE_KITCHEN.md) through the REAL signed
 * bundles served from a fake CDN — its own module beside the café vertical:
 *
 *   - the cafe's till: «З кухні» holds «Оплатити» until the kitchen named a
 *     time and the guest agreed, and the receipt then carries the order;
 *   - the kitchen's till: «Запити з точок» stands over the board (the café
 *     vertical's page) through the host's `till.Banner`, and one tap answers;
 *   - a café WITHOUT the module: neither of them, and nothing asked of the
 *     remote kitchen's routes — the café vertical carries none of it.
 */

const CDN = 'https://cdn.e2e.test';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const CAFE_VERTICAL = {
  id: 'cafe',
  title: 'Кафе',
  attributes: [{ key: 'size', label: 'Розмір', type: 'text', inLabel: true, inSearch: true, placeholder: 'M' }],
  units: ['шт', 'г', 'мл'],
  defaultUnit: 'шт',
  maxCompositionDepth: 3,
};

const entry = (id: string, title: string, routePath: string, icon: string) => ({
  url: `${CDN}/${id}/remote-entry.js`,
  title,
  routePath,
  nav: [{ label: title, location: 'cashier-primary', order: 80, icon }],
  icon,
});
const CAFE_REMOTE = entry('vertical-cafe', 'Кухня', '/kitchen', 'ClipboardList');
const KITCHEN_REMOTE = entry('remote-kitchen', 'Віддалена кухня', '/remote-kitchen', 'ChefHat');

function dish(over: Record<string, unknown>) {
  return {
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    compare_at_cents: null,
    image_url: null,
    kind: 'simple',
    stock_mode: 'own',
    sellable: true,
    stop_listed: false,
    stop_listed_on: null,
    components: [],
    tag_ids: [],
    modifier_groups: [],
    ...over,
  };
}

/** The park cafe's menu: a hot dog made on the spot, a pizza the kitchen bakes. */
const MENU = [
  dish({ variant_id: 1, product_id: 1, product_name: 'Хот-дог', price_cents: 9000, quantity: 50 }),
  dish({ variant_id: 2, product_id: 2, product_name: 'Маргарита', price_cents: 22000, quantity: 100000 }),
];

const SETUP = {
  as_cafe: {
    link: {
      id: 1,
      status: 'active',
      kitchen_title: 'Кухня Пульчинелли',
      kitchen_phone: '+380671112233',
      transit_minutes: 10,
      answer_seconds: 60,
      quote_ttl_seconds: 180,
      auto_confirm_max_min: 40,
    },
    kitchen: { accepting: true, paused_until: null, load_minutes: 0 },
    items: [{ cafe_variant_id: 2, prep_minutes: 18 }],
  },
  as_kitchen: null,
};

async function serveBuiltRemotes(page: Page) {
  await page.route(`${CDN}/**`, async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/').filter(Boolean);
    const [id, name] = [parts[0] ?? '', parts[parts.length - 1] ?? ''];
    try {
      const body = readFileSync(path.join(DIST, id, name));
      await route.fulfill({
        body,
        contentType: CONTENT_TYPES[path.extname(name)] ?? 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' },
      });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

/** Every request to the remote kitchen's routes, so a test can say none was made. */
function watchRemoteKitchen(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/api/pos/remote-kitchen/')) seen.push(`${request.method()} ${url.pathname}${url.search}`);
  });
  return seen;
}

async function signIn(page: Page, moduleRemotes: Record<string, unknown>) {
  await serveBuiltRemotes(page);
  await mockPosApi(page, ALL_MODULES, { moduleRemotes, store: { vertical: CAFE_VERTICAL } });
  // Registered after `mockPosApi`, so they beat its catch-all.
  await page.route('**/api/pos/catalog**', async (route) => route.fulfill({ json: MENU }));
  await page.route('**/api/pos/kitchen/orders**', async (route) =>
    route.fulfill({ json: { orders: [], now: new Date().toISOString() } })
  );
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the next boot.
  await page.reload();
  await page.waitForURL(/\/admin$/);
}

function quoted() {
  return {
    id: 5,
    revision: 1,
    status: 'quoted',
    quote_source: 'auto',
    quoted_minutes: 30,
    suggested_minutes: 30,
    promised_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    answer_deadline_at: null,
    answer_overdue: false,
    quote_expires_at: new Date(Date.now() + 180_000).toISOString(),
    decline_reason: null,
    kitchen_phone: '+380671112233',
  };
}

test('the cafe asks the kitchen, the guest agrees, and the receipt pays the kitchen’s order', async ({ page }) => {
  await signIn(page, { 'vertical-cafe': CAFE_REMOTE, 'remote-kitchen': KITCHEN_REMOTE });
  await page.route('**/api/pos/remote-kitchen/setup', async (route) => route.fulfill({ json: SETUP }));
  const asked: unknown[] = [];
  await page.route('**/api/pos/remote-kitchen/orders', async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: quoted() });
  });
  await page.route('**/api/pos/remote-kitchen/orders/5', async (route) => route.fulfill({ json: quoted() }));
  const completed: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/sales/complete', async (route) => {
    completed.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        id: 9,
        receipt_number: 'ЧК-000009',
        order_no: 12,
        status: 'completed',
        subtotal_cents: 22000,
        total_cents: 22000,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [{ id: 1, method: 'cash', amount_cents: 22000 }],
        refunds: [],
      },
    });
  });

  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toBeVisible();

  // A hot dog alone: the kitchen is not asked, nothing is held.
  await page.getByText('Хот-дог').first().click();
  await expect(page.getByTestId('remote-checkout')).toHaveCount(0);

  // The pizza: the block appears and «Оплатити» waits for the kitchen.
  await page.getByText('Маргарита').first().click();
  const block = page.getByTestId('remote-checkout').first();
  await expect(block).toContainText('Кухня Пульчинелли');
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  await expect(page.getByText('Страви з кухні: спершу запитайте кухню, коли буде готово.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Оплата' })).toHaveCount(0);

  await block.getByRole('button', { name: /Запитати кухню/ }).click();
  await expect(page.getByTestId('remote-checkout-quoted').first()).toContainText('30 хв');
  expect(asked).toHaveLength(1);
  expect((asked[0] as { items: unknown[] }).items).toEqual([{ variant_id: 2, quantity: 1 }]);

  await page.getByRole('button', { name: 'Гість згоден' }).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();

  await expect.poll(() => completed.length).toBe(1);
  expect(completed[0]).toMatchObject({ remote_order_id: 5 });
});

test('the kitchen’s requests stand over the board, and one tap answers', async ({ page }) => {
  await signIn(page, { 'vertical-cafe': CAFE_REMOTE, 'remote-kitchen': KITCHEN_REMOTE });
  await page.route('**/api/pos/remote-kitchen/setup', async (route) =>
    route.fulfill({ json: { as_cafe: null, as_kitchen: { status: { accepting: true }, cafes: [] } } })
  );
  let answered = false;
  const answers: unknown[] = [];
  await page.route('**/api/pos/remote-kitchen/orders?side=kitchen', async (route) =>
    route.fulfill({
      json: {
        now: new Date().toISOString(),
        orders: answered
          ? []
          : [
              {
                id: 7,
                status: 'requested',
                revision: 1,
                cafe_name: 'Pulcinella Park',
                guest_label: 'Стіл 3',
                note: null,
                prep_minutes: 18,
                load_minutes: 0,
                transit_minutes: 10,
                suggested_minutes: 30,
                answer_deadline_at: new Date(Date.now() + 60_000).toISOString(),
                requested_at: new Date().toISOString(),
                items: [{ id: 1, product_name: 'Маргарита', variant_label: '', quantity: 2, note: '' }],
              },
            ],
      },
    })
  );
  await page.route('**/api/pos/remote-kitchen/orders/7/quote', async (route) => {
    answers.push(route.request().postDataJSON());
    answered = true;
    await route.fulfill({ json: { id: 7, status: 'quoted' } });
  });

  await page.goto('/kitchen');
  await expect(page.getByTestId('kitchen-board')).toBeVisible();
  const strip = page.getByTestId('remote-requests');
  await expect(strip).toContainText('Запити з точок · 1');
  await expect(strip).toContainText('Pulcinella Park');
  // Over the board, not inside it: the strip belongs to the till's frame.
  await expect(page.getByTestId('kitchen-board').getByTestId('remote-requests')).toHaveCount(0);

  await page.getByTestId('remote-answer-7').click();
  await expect.poll(() => answers).toEqual([{ minutes: 20, revision: 1 }]);
  await expect(page.getByTestId('remote-requests')).toHaveCount(0);
});

test('a café without the module: no block, no strip, and nothing asked of the remote kitchen', async ({ page }) => {
  const seen = watchRemoteKitchen(page);
  await signIn(page, { 'vertical-cafe': CAFE_REMOTE });

  await page.goto('/kitchen');
  await expect(page.getByTestId('kitchen-board')).toBeVisible();
  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toBeVisible();
  await page.getByText('Маргарита').first().click();
  await expect(page.getByTestId('remote-checkout')).toHaveCount(0);
  await expect(page.getByTestId('remote-requests')).toHaveCount(0);
  // Long enough for a strip that polled every three seconds to have asked.
  await page.waitForTimeout(3500);
  expect(seen).toEqual([]);
});
