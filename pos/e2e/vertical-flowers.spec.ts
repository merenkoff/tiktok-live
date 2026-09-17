import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The first sales vertical delivered as a module, end to end in the web shell:
 * the REAL signed `vertical-flowers` bundle (built by the webServer command) is
 * served from a fake CDN, the store is on the flowers vertical and names the
 * module in `module_remotes`, and `/register` renders the module's catalog
 * instead of the bundled one — then takes a payment through the host frame,
 * which is the half that did not move.
 *
 * The second test is the one that matters most: with the CDN down, the till
 * still sells. On the web a failed remote leaves nothing behind at all — no
 * nav entry, no route, no placeholder — so the fallback is the only thing
 * standing between a bad release and a shop that cannot take money.
 */

const CDN = 'https://cdn.e2e.test/vertical-flowers';
const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist-remotes/vertical-flowers'
);

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const FLOWERS_VERTICAL = {
  id: 'flowers',
  title: 'Квіти',
  attributes: [
    { key: 'length_cm', label: 'Довжина', type: 'number', unitSuffix: 'см', inLabel: true },
    { key: 'color', label: 'Колір', type: 'text', inLabel: true, inSearch: true },
    { key: 'country', label: 'Країна', type: 'text', inSearch: true },
  ],
  units: ['шт'],
  defaultUnit: 'шт',
};

const FLOWERS_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Квіти',
  routePath: '/flowers',
  nav: [{ label: 'Квіти', location: 'cashier-primary', order: 80 }],
  icon: 'Flower2',
};

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

async function signInAsFlorist(page: Page, { down = false } = {}) {
  await serveBuiltRemote(page, { down });
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'vertical-flowers': FLOWERS_REMOTE },
    store: { vertical: FLOWERS_VERTICAL },
  });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
}

test('a flower shop sells through its own catalog module', async ({ page }) => {
  await signInAsFlorist(page);

  const completed: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/sales/complete', async (route) => {
    completed.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        id: 5,
        receipt_number: 'ЧК-000005',
        status: 'completed',
        subtotal_cents: 45000,
        total_cents: 45000,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [{ id: 1, method: 'cash', amount_cents: 45000 }],
        refunds: [],
      },
    });
  });

  await page.goto('/register');
  // The module's own catalog, not the bundled one.
  await expect(page.getByTestId('flowers-catalog')).toBeVisible();

  // Its screen is reachable too — that route is what the `module_remotes`
  // entry declares, and on the desktop it is what the pending tile points at.
  await page.goto('/flowers');
  await expect(page.getByRole('heading', { name: 'Квіти' })).toBeVisible();

  // …and the host frame still takes the money.
  await page.goto('/register');
  await page.getByText('Футболка базова').first().click();
  await page.getByRole('button', { name: /^Сплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByText('ЧК-000005')).toBeVisible();
  expect(completed).toHaveLength(1);
});

test('with the module CDN down the till still sells, on the bundled catalog', async ({ page }) => {
  await signInAsFlorist(page, { down: true });

  await page.goto('/register');
  await expect(page.getByTestId('flowers-catalog')).toHaveCount(0);
  // The bundled catalog is there instead: same search box, same tiles.
  await expect(page.getByPlaceholder('Пошук')).toBeVisible();
  await expect(page.getByText('Футболка базова')).toBeVisible();
});
