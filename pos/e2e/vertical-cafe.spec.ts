import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The café vertical end to end in the web shell: the REAL signed
 * `vertical-cafe` bundle (built by the webServer command) served from a fake
 * CDN, a store on the café vertical naming it in `module_remotes`, and
 * `/register` rendering the menu — then the tap budget of
 * TechDocs/POS_CAFE.md §6 counted in clicks, not by eye:
 *
 *   «як завжди»                    1 tap   (the defaults go with it, explicitly)
 *   two answers changed            4 taps  («⋯» → chip → chip → «Додати»)
 *   a drink with sizes             +1 tap  (the size has no default)
 *
 * And the one that matters most: with the CDN down, the till still sells.
 */

const CDN = 'https://cdn.e2e.test/vertical-cafe';
const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist-remotes/vertical-cafe'
);

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const CAFE_VERTICAL = {
  id: 'cafe',
  title: 'Кафе',
  attributes: [
    { key: 'size', label: 'Розмір', type: 'text', inLabel: true, inSearch: true, placeholder: 'M · 350 мл' },
  ],
  units: ['шт', 'г', 'мл'],
  defaultUnit: 'шт',
  maxCompositionDepth: 3,
};

/** Names the module's own route (К3c) — the desktop's pending tile stands in for it. */
const CAFE_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Кафе',
  routePath: '/kitchen',
  nav: [{ label: 'Кухня', location: 'cashier-primary', order: 80, icon: 'ClipboardList' }],
  icon: 'Coffee',
};

const MILK = {
  id: 1,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  modifiers: [
    { id: 11, name: 'звичайне', price_delta_cents: 0, is_default: true, component_variant_id: 91, component_quantity: 200 },
    { id: 12, name: 'вівсяне', price_delta_cents: 1500, is_default: false, component_variant_id: 92, component_quantity: 200 },
  ],
};
const SYRUP = {
  id: 2,
  name: 'Сироп',
  min_select: 0,
  max_select: 3,
  modifiers: [
    { id: 21, name: 'карамель', price_delta_cents: 1000, is_default: false, component_variant_id: null, component_quantity: null },
    { id: 22, name: 'ваніль', price_delta_cents: 1000, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};
const SUGAR = {
  id: 3,
  name: 'Цукор',
  min_select: 1,
  max_select: 1,
  modifiers: [
    { id: 31, name: 'з цукром', price_delta_cents: 0, is_default: true, component_variant_id: 93, component_quantity: 5 },
    { id: 32, name: 'без цукру', price_delta_cents: 0, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};
const SHOT = {
  id: 4,
  name: 'Порція',
  min_select: 0,
  max_select: 1,
  modifiers: [
    { id: 41, name: 'подвійна', price_delta_cents: 2000, is_default: false, component_variant_id: 94, component_quantity: 18 },
    { id: 42, name: 'половина', price_delta_cents: -2000, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

function drink(over: Record<string, unknown>) {
  return {
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    compare_at_cents: null,
    image_url: null,
    kind: 'composite',
    stock_mode: 'derived',
    sellable: true,
    stop_listed: false,
    stop_listed_on: null,
    components: [],
    tag_ids: [],
    ...over,
  };
}

const MENU = [
  // One size; every required question has a default → one tap.
  drink({ variant_id: 1, product_id: 1, product_name: 'Еспресо', price_cents: 4500, quantity: 200, modifier_groups: [SUGAR, SHOT] }),
  // Three sizes → the sheet asks for one first.
  drink({ variant_id: 2, product_id: 2, product_name: 'Латте', attributes: { size: 'S' }, label: 'S', price_cents: 6000, quantity: 200, modifier_groups: [MILK, SYRUP, SUGAR] }),
  drink({ variant_id: 3, product_id: 2, product_name: 'Латте', attributes: { size: 'M' }, label: 'M', price_cents: 6500, quantity: 200, modifier_groups: [MILK, SYRUP, SUGAR] }),
  drink({ variant_id: 4, product_id: 2, product_name: 'Латте', attributes: { size: 'L' }, label: 'L', price_cents: 7000, quantity: 200, modifier_groups: [MILK, SYRUP, SUGAR] }),
  // One size with a milk question: one tap «як завжди», «⋯» to change it.
  drink({ variant_id: 5, product_id: 3, product_name: 'Флет вайт', price_cents: 7000, quantity: 200, modifier_groups: [MILK, SUGAR] }),
  drink({ variant_id: 6, product_id: 4, product_name: 'Круасан', kind: 'simple', stock_mode: 'own', price_cents: 5500, quantity: 24 }),
  drink({ variant_id: 7, product_id: 5, product_name: 'Сирник', kind: 'simple', stock_mode: 'own', price_cents: 6500, quantity: 0 }),
  // In the case, but pulled for the day on the kitchen board (К3). No day
  // on purpose: the till then trusts the verdict, whatever the browser's date.
  drink({ variant_id: 8, product_id: 6, product_name: 'Чізкейк', kind: 'simple', stock_mode: 'own', price_cents: 7500, quantity: 10, stop_listed: true }),
];

function kitchenOrder(prep_status: 'new' | 'ready') {
  return {
    id: 7,
    order_no: 7,
    receipt_number: 'ЧК-000007',
    prep_status,
    created_at: new Date(Date.now() - 120_000).toISOString(),
    ready_at: prep_status === 'ready' ? new Date().toISOString() : null,
    staff_name: 'Олена',
    note: null,
    items: [
      { id: 70, product_name: 'Латте', variant_label: 'M · вівсяне', quantity: 1, modifiers: [{ group_name: 'Молоко', name: 'вівсяне' }], note: 'гарячіше', stations: ['bar'] },
      { id: 71, product_name: 'Круасан', variant_label: '', quantity: 2, modifiers: [], note: '', stations: ['kitchen'] },
    ],
  };
}

/** A board with one order whose state follows the taps it receives. */
async function mockKitchen(page: Page) {
  let status: 'new' | 'ready' | 'served' = 'new';
  const taps: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/kitchen/orders', async (route) =>
    route.fulfill({
      json: { orders: status === 'served' ? [] : [kitchenOrder(status)], now: new Date().toISOString() },
    })
  );
  await page.route('**/api/pos/sales/7/prep', async (route) => {
    const body = route.request().postDataJSON() as { prep_status: 'ready' | 'served' };
    taps.push(body);
    status = body.prep_status;
    await route.fulfill({ json: { id: 7, prep_status: status, ready_at: new Date().toISOString(), served_at: null } });
  });
  return taps;
}

async function serveBuiltRemote(page: Page, { down = false } = {}) {
  await page.route(`${CDN}/**`, async (route) => {
    if (down) return route.fulfill({ status: 404, body: 'not found' });
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    try {
      const body = readFileSync(path.join(DIST, name));
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

async function signInAsBarista(page: Page, { down = false } = {}) {
  await serveBuiltRemote(page, { down });
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'vertical-cafe': CAFE_REMOTE },
    store: { vertical: CAFE_VERTICAL },
  });
  // Registered after `mockPosApi`, so it beats its clothing catalog.
  await page.route('**/api/pos/catalog**', async (route) => route.fulfill({ json: MENU }));
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
}

/** Captures what checkout sends and answers with a sale that carries a daily number. */
async function captureCheckout(page: Page) {
  const completed: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/sales/complete', async (route) => {
    completed.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        id: 5,
        receipt_number: 'ЧК-000005',
        order_no: 42,
        status: 'completed',
        subtotal_cents: 4500,
        total_cents: 4500,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [{ id: 1, method: 'cash', amount_cents: 4500 }],
        refunds: [],
      },
    });
  });
  return completed;
}

async function payCash(page: Page) {
  await page.getByRole('button', { name: /^Сплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: 'Готово' }).click();
}

test('«як завжди» is one tap, and the counter gets its number', async ({ page }) => {
  await signInAsBarista(page);
  const completed = await captureCheckout(page);

  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toBeVisible();
  // Out of stock is visible, not gone.
  await expect(page.getByText('Сирник')).toBeVisible();
  await expect(page.getByText('немає')).toBeVisible();

  // Tap 1 — and the only one.
  await page.getByText('Еспресо').first().click();
  await expect(page.getByTestId('modifier-sheet')).toHaveCount(0);
  await expect(page.getByTestId('sale-sidebar').getByText('з цукром')).toBeVisible();

  await payCash(page);
  // The number the barista calls out, large, above the receipt number.
  await expect(page.getByTestId('order-no')).toHaveText('42');
  await expect(page.getByText('ЧК-000005')).toBeVisible();

  expect(completed).toHaveLength(1);
  // The default went with the line explicitly: the server never applies it.
  expect((completed[0].items as Array<Record<string, unknown>>)[0]).toEqual({
    variant_id: 1,
    quantity: 1,
    modifiers: [31],
  });
});

test('two answers changed is four taps, priced before the line exists', async ({ page }) => {
  await signInAsBarista(page);
  const completed = await captureCheckout(page);

  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toBeVisible();

  // Tap 1: the tile's «⋯».
  await page.getByRole('button', { name: 'Змінити: Флет вайт' }).click();
  const sheet = page.getByTestId('modifier-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('modifier-price')).toHaveText('70,00 ₴');
  // Tap 2: oat milk — the price moves at once.
  await sheet.getByTestId('modifier-chip-12').click();
  await expect(sheet.getByTestId('modifier-price')).toHaveText('85,00 ₴');
  // Tap 3: no sugar. Tap 4: into the cart.
  await sheet.getByTestId('modifier-chip-32').click();
  await sheet.getByTestId('modifier-add').click();
  await expect(sheet).toHaveCount(0);

  const sidebar = page.getByTestId('sale-sidebar');
  await expect(sidebar.getByText('вівсяне · без цукру')).toBeVisible();

  // A line with answers can be parked since К3 — the sheet opens, nothing is
  // refused and nothing is dropped; the shape it sends is pinned by the unit
  // test of `RegisterPage`.
  await sidebar.getByTestId('park-cart').click();
  const parkSheet = page.getByTestId('park-cart-sheet');
  await expect(parkSheet).toBeVisible();
  await parkSheet.getByRole('button', { name: 'Закрити' }).click();
  await expect(parkSheet).toHaveCount(0);

  await payCash(page);
  await expect(page.getByTestId('order-no')).toHaveText('42');
  expect((completed[0].items as Array<Record<string, unknown>>)[0]).toEqual({
    variant_id: 5,
    quantity: 1,
    modifiers: [12, 32],
  });
});

test('a drink with sizes asks for the size first, with the answers pre-selected', async ({ page }) => {
  await signInAsBarista(page);

  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toBeVisible();

  await page.getByText('Латте').first().click();
  const sheet = page.getByTestId('modifier-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('modifier-error')).toHaveText('Оберіть «Розмір»');
  await expect(sheet.getByTestId('modifier-add')).toBeDisabled();

  await sheet.getByTestId('modifier-variant-3').click();
  await expect(sheet.getByTestId('modifier-price')).toHaveText('65,00 ₴');
  await sheet.getByTestId('modifier-add').click();

  await expect(page.getByTestId('sale-sidebar').getByText('M · звичайне · з цукром')).toBeVisible();
});

test('a dish on the day’s stop-list is greyed with «стоп», not gone, and cannot be tapped', async ({ page }) => {
  await signInAsBarista(page);

  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toBeVisible();
  const tile = page.getByRole('button', { name: /Чізкейк/ });
  await expect(tile).toBeVisible();
  await expect(tile).toBeDisabled();
  await expect(page.getByTestId('tile-badge').filter({ hasText: 'стоп' })).toBeVisible();
});

test('the kitchen board takes two taps: «Готово» moves the order to «Видача», «Видано» takes it off', async ({ page }) => {
  await signInAsBarista(page);
  const taps = await mockKitchen(page);

  await page.goto('/kitchen');
  await expect(page.getByTestId('kitchen-board')).toBeVisible();
  const inWork = page.getByTestId('kitchen-in-work');
  const pickup = page.getByTestId('kitchen-pickup');
  await expect(inWork.getByTestId('kitchen-order-7')).toBeVisible();
  await expect(inWork.getByTestId('kitchen-order-no')).toHaveText('7');
  await expect(inWork.getByText('вівсяне', { exact: true })).toBeVisible();
  await expect(inWork.getByText('✎ гарячіше')).toBeVisible();
  await expect(pickup.getByText('Нічого не чекає видачі')).toBeVisible();

  // Tap 1. The card moves before the server answers (optimistically), so
  // the request is awaited on its own — it is what the test is about.
  await page.getByTestId('kitchen-ready-7').click();
  await expect(pickup.getByTestId('kitchen-order-7')).toBeVisible();
  await expect(inWork.getByText('Замовлень немає')).toBeVisible();
  await expect.poll(() => taps).toEqual([{ prep_status: 'ready' }]);

  // Tap 2 — and nothing else ever takes it off.
  await page.getByTestId('kitchen-served-7').click();
  await expect(page.getByTestId('kitchen-order-7')).toHaveCount(0);
  await expect.poll(() => taps).toEqual([{ prep_status: 'ready' }, { prep_status: 'served' }]);
});

test('with the module CDN down the till still sells, on the bundled catalog', async ({ page }) => {
  await signInAsBarista(page, { down: true });

  await page.goto('/register');
  await expect(page.getByTestId('cafe-catalog')).toHaveCount(0);
  await expect(page.getByPlaceholder('Пошук')).toBeVisible();
});
