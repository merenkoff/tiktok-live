import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ALL_MODULES, catalog, mockPosApi } from './helpers';

/**
 * The waiter's tablet as a PWA (TechDocs/POS_PWA.md): the same deploy under
 * `/tablet/`, a service worker that keeps the host build, and an offline
 * runtime that READS — the catalog snapshot, the hall map's mirror — and never
 * queues a write. Two things this spec exists to hold, both easy to lose:
 * without a network the app still opens and still shows yesterday's menu, and
 * a sale rung there is refused on the spot rather than invented.
 *
 * Every route is registered on the CONTEXT, not the page: once the worker
 * controls the page its fetches surface as service-worker requests, which only
 * a context route sees (`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`, set
 * by `npm run test:e2e`).
 */

const CDN = 'https://cdn.e2e.test/tables';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes/tables');
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
    { key: 'size', label: 'Розмір', type: 'text', inLabel: true, inSearch: true, placeholder: 'M' },
  ],
  units: ['шт', 'г', 'мл'],
  defaultUnit: 'шт',
  maxCompositionDepth: 3,
};

const TABLES_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Столи',
  routePath: '/tables',
  nav: [{ label: 'Столи', location: 'cashier-primary', order: 60, icon: 'Grid3X3' }],
  icon: 'Grid3X3',
};

const HALLS = [
  {
    id: 1,
    name: 'Зала',
    sort_order: 0,
    is_active: true,
    tables: [
      { id: 11, hall_id: 1, name: '5', seats: 4, pos_x: 0, pos_y: 0, width: 2, height: 2, shape: 'rect', is_active: true },
    ],
  },
];

/**
 * A first launch, as a real one goes: open, sign in, let the worker (which
 * registers once there is a session) install and claim the page, open again.
 * The second load is controlled from the start, which is the state every
 * later launch is in. The login itself happens BEFORE the worker exists: a
 * POST from a page the worker controls is one Playwright's routes cannot
 * answer, GETs are fine — which is also why the app registers it after the
 * session and not at boot.
 */
async function loginWithPin(page: Page) {
  await page.goto('/tablet/');
  await expect(page).toHaveURL(/\/tablet\/login$/);
  await expect(page.getByText('Планшет офіціанта')).toBeVisible();
  await page.getByLabel('Код магазину').fill('demo');
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.waitForURL(/\/tablet\/register$/);
  await serviceWorkerControls(page);
  await page.reload();
  await page.waitForURL(/\/tablet\/register$/);
}

/** The worker has installed this build and taken the page over. */
async function serviceWorkerControls(page: Page) {
  await page.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 20_000 }
  );
}

async function serveBuiltRemote(context: BrowserContext) {
  await context.route(`${CDN}/**`, async (route) => {
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

test('/tablet is its own entry: the till screens, no admin, installable', async ({ page }) => {
  await mockPosApi(page.context());
  await loginWithPin(page);

  // The tablet is served under its prefix, and `/tablet` alone lands there too.
  await page.goto('/tablet');
  await expect(page).toHaveURL(/\/tablet\/register$/);
  await expect(page.getByText(catalog[0].product_name).first()).toBeVisible();

  // No admin area on a tablet, even for an owner: the login sends them to the till
  // and the URL does not exist.
  await page.goto('/tablet/admin');
  await expect(page).toHaveURL(/\/tablet\/register$/);

  // Installable: a manifest with the scope and start URL of this entry.
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '';
    const res = await fetch(href);
    return res.json() as Promise<{ start_url: string; scope: string; display: string; icons: unknown[] }>;
  });
  expect(manifest).toMatchObject({ start_url: '/tablet/', scope: '/tablet/', display: 'standalone' });
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  // And the worker is scoped to it — the owner's `/admin` tab is never controlled.
  await serviceWorkerControls(page);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/tablet/');
});

test('without a network the tablet opens, shows the menu it saw, and refuses to sell', async ({
  page,
  context,
}) => {
  await mockPosApi(context);
  await loginWithPin(page);
  await expect(page.getByText(catalog[0].product_name).first()).toBeVisible();
  await serviceWorkerControls(page);
  // The reads runtime snapshots the catalog on start; give it the first read.
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === 'cloth-pos-offline');
  });

  await context.setOffline(true);
  await page.reload();

  // The shell comes from the worker's cache, the session from the cached
  // JWT, the tiles from the Dexie snapshot.
  await expect(page).toHaveURL(/\/tablet\/register$/);
  await expect(page.getByText(catalog[0].product_name).first()).toBeVisible();
  await expect(page.getByText('Без мережі — лише перегляд')).toBeVisible();

  // A sale is refused before anything is written — no queue on a tablet.
  await page.getByText(catalog[0].product_name).first().click();
  await page.getByRole('button', { name: /^Сплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Потрібна мережа');

  // Back online the same tap goes through.
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText('Без мережі — лише перегляд')).toHaveCount(0);
});

test('the hall map is read back from the mirror without a network', async ({ page, context }) => {
  await serveBuiltRemote(context);
  await mockPosApi(context, ALL_MODULES, {
    moduleRemotes: { tables: TABLES_REMOTE },
    store: { vertical: CAFE_VERTICAL },
  });
  await context.route('**/api/pos/halls', async (route) => route.fulfill({ json: { halls: HALLS } }));
  await context.route('**/api/pos/bills', async (route) => route.fulfill({ json: { bills: [] } }));

  await loginWithPin(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/tablet\/register$/);
  await serviceWorkerControls(page);

  await page.goto('/tablet/tables');
  await expect(page.getByTestId('table-tile-11')).toContainText('5');

  await context.setOffline(true);
  await page.reload();

  // The module itself comes back from the worker's remotes cache, the room
  // from the module's Dexie mirror — marked as a memory.
  await expect(page.getByTestId('table-tile-11')).toContainText('5');
  await expect(page.getByTestId('tables-stale')).toBeVisible();
});
