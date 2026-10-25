import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The grocery vertical end to end in the web shell (TechDocs/grocery/
 * G4_WEIGHED.md §6): the REAL signed `vertical-grocery` bundle (built by the
 * webServer command) served from a fake CDN, a store on the grocery vertical
 * naming it in `module_remotes`, and `/register` ringing the two kinds of
 * goods a corner shop has — loose potatoes through the weight pad, a carton
 * of milk by its barcode — into one receipt. With the CDN down, the till
 * still sells, weights included, on the bundled catalog.
 */

const CDN = 'https://cdn.e2e.test/vertical-grocery';
const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist-remotes/vertical-grocery'
);

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const GROCERY_VERTICAL = {
  id: 'grocery',
  title: 'Продукти',
  attributes: [
    { key: 'variety', label: 'Сорт', type: 'text', inLabel: true, inSearch: true, placeholder: 'Гауда' },
    { key: 'packaging', label: 'Фасування', type: 'text', inLabel: true, inSearch: true, placeholder: '900 г' },
  ],
  units: ['шт', 'г', 'мл'],
  defaultUnit: 'шт',
  weighedUnits: ['г', 'мл'],
  maxCompositionDepth: 1,
  autoBarcode: true,
};

/** The sell screen is a slot: the route and nav only shape the desktop's pending tile. */
const GROCERY_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Продукти',
  routePath: '/grocery',
  nav: [{ label: 'Продукти', location: 'cashier-primary', order: 85, icon: 'ShoppingCart' }],
  icon: 'ShoppingCart',
};

function good(over: Record<string, unknown>) {
  return {
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    compare_at_cents: null,
    price_per: 1,
    image_url: null,
    kind: 'simple',
    stock_mode: 'own',
    tag_ids: [],
    ...over,
  };
}

const POTATO = good({
  variant_id: 1,
  product_id: 1,
  product_name: 'Картопля',
  unit: 'г',
  price_per: 1000,
  price_cents: 2490,
  quantity: 0,
  barcode: '2900000000018',
});
const GOUDA = good({
  variant_id: 2,
  product_id: 2,
  product_name: 'Сир твердий',
  attributes: { variety: 'Гауда' },
  label: 'Гауда',
  unit: 'г',
  price_per: 1000,
  price_cents: 18990,
  compare_at_cents: 22990,
  quantity: 5200,
  barcode: '2900000000025',
});
const DUTCH = good({
  ...GOUDA,
  variant_id: 3,
  attributes: { variety: 'Голландський' },
  label: 'Голландський',
  price_cents: 21990,
  compare_at_cents: null,
  barcode: '2900000000032',
});
const MILK = good({
  variant_id: 4,
  product_id: 3,
  product_name: 'Молоко «Ферма»',
  attributes: { variety: '2,5 %', packaging: '900 г' },
  label: '2,5 % · 900 г',
  price_cents: 4690,
  quantity: 24,
  barcode: '4820003000012',
});
const LOAF = good({
  variant_id: 5,
  product_id: 4,
  product_name: 'Батон нарізний',
  attributes: { packaging: '500 г' },
  label: '500 г',
  price_cents: 2890,
  quantity: 0,
  barcode: '4820003000074',
});
const SHELF = [POTATO, GOUDA, DUTCH, MILK, LOAF];

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

/** What the catalog route was asked for a barcode — the scan's own lookup. */
async function signInAsShopkeeper(page: Page, { down = false } = {}) {
  const barcodeLookups: string[] = [];
  await serveBuiltRemote(page, { down });
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'vertical-grocery': GROCERY_REMOTE },
    store: { vertical: GROCERY_VERTICAL },
  });
  // Registered after `mockPosApi`, so it beats its clothing catalog.
  await page.route('**/api/pos/catalog**', async (route) => {
    const barcode = new URL(route.request().url()).searchParams.get('barcode');
    if (barcode) barcodeLookups.push(barcode);
    await route.fulfill({ json: barcode ? SHELF.filter((g) => g.barcode === barcode) : SHELF });
  });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
  return barcodeLookups;
}

async function captureCheckout(page: Page) {
  const completed: Array<{ items?: unknown[] }> = [];
  await page.route('**/api/pos/sales/complete', async (route) => {
    completed.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        id: 6,
        receipt_number: 'ЧК-000006',
        status: 'completed',
        subtotal_cents: 8425,
        total_cents: 8425,
        cart_discount_cents: 0,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [{ id: 1, method: 'cash', amount_cents: 10000 }],
        refunds: [],
      },
    });
  });
  return completed;
}

async function weigh(page: Page, keys: string[]) {
  const pad = page.getByTestId('weight-pad');
  await expect(pad).toBeVisible();
  for (const key of keys) await pad.getByTestId(`weight-pad-key-${key}`).click();
  await pad.getByTestId('weight-pad-confirm').click();
  await expect(pad).toBeHidden();
}

test('loose potatoes by weight and a carton by its barcode go into one receipt', async ({ page }) => {
  const lookups = await signInAsShopkeeper(page);
  const completed = await captureCheckout(page);

  await page.goto('/register');
  const grocery = page.getByTestId('grocery-catalog');
  await expect(grocery).toBeVisible();

  // A weighed card names its price per kilogram and stays sellable at zero;
  // a packed one at zero is sold out; a markdown per kilogram stays on the tile.
  await expect(page.getByTestId('grocery-tile-1')).toContainText('24,90 ₴/кг');
  await expect(page.getByTestId('grocery-tile-1')).toBeEnabled();
  await expect(page.getByTestId('grocery-tile-4')).toBeDisabled();
  await expect(page.getByTestId('grocery-tile-2').getByTestId('tile-old-price')).toHaveText('229,90 ₴');

  // 1,5 kg of potatoes: one tap, the weight, «Додати».
  await page.getByTestId('grocery-tile-1').click();
  await weigh(page, ['1', 'comma', '5']);

  // The carton is scanned — and the tiles stay where they were.
  await page.keyboard.type('4820003000012');
  await page.keyboard.press('Enter');
  const receipt = page.getByTestId('sale-sidebar');
  await expect(receipt.getByText('Молоко «Ферма»')).toBeVisible();
  expect(lookups).toEqual(['4820003000012']);
  await expect(page.getByTestId('grocery-tile-1')).toBeVisible();
  await expect(page.getByTestId('grocery-tile-2')).toBeVisible();

  await expect(receipt.getByText('1,500 кг × 24,90 ₴/кг')).toBeVisible();
  // 1,5 × 24,90 = 37,35 and 46,90 for the milk.
  await page.getByRole('button', { name: 'Оплатити 84,25 ₴' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();

  await expect.poll(() => completed.length).toBe(1);
  expect(completed[0].items).toEqual([
    { variant_id: 1, quantity: 1500, weight_source: 'manual' },
    { variant_id: 4, quantity: 1 },
  ]);
});

test('a scanned price tag of a weighed good asks its weight, the variety already known', async ({ page }) => {
  await signInAsShopkeeper(page);

  await page.goto('/register');
  await expect(page.getByTestId('grocery-catalog')).toBeVisible();

  await page.keyboard.type('2900000000032');
  await page.keyboard.press('Enter');
  const pad = page.getByTestId('weight-pad');
  await expect(pad).toBeVisible();
  await expect(pad).toContainText('Голландський');
  await expect(pad).toContainText('219,90 ₴/кг');
  for (const key of ['0', 'comma', '3', '5']) await pad.getByTestId(`weight-pad-key-${key}`).click();
  // 0,350 × 219,90 = 76,965 → 76,97: half a kopeck up, the server's rule.
  await expect(pad.getByTestId('weight-pad-sum')).toContainText('76,97 ₴');
});

test('on a phone the tiles fit the screen, three to a row', async ({ page }) => {
  // A market trader sells from a phone. The category row is wider than the
  // screen and scrolls on its own; it must not widen the grid with it.
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsShopkeeper(page);

  await page.goto('/register');
  await expect(page.getByTestId('grocery-catalog')).toBeVisible();
  const tile = await page.getByTestId('grocery-tile-1').boundingBox();
  expect(tile!.width).toBeLessThan(140);
  expect(tile!.x + tile!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('with the module CDN down the till still sells by weight, on the bundled catalog', async ({ page }) => {
  await signInAsShopkeeper(page, { down: true });

  await page.goto('/register');
  await expect(page.getByTestId('grocery-catalog')).toHaveCount(0);
  await expect(page.getByPlaceholder(/^Пошук/)).toBeVisible();

  await page.getByRole('button', { name: /Картопля/ }).click();
  await weigh(page, ['2']);
  await expect(page.getByTestId('sale-sidebar').getByText('2,000 кг × 24,90 ₴/кг')).toBeVisible();
});
