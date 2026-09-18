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
  // The module's own screen is «Вітрина» now — the bouquets standing in the
  // window, and the write-off for one that did not sell.
  await expect(page.getByRole('heading', { name: 'Вітрина' })).toBeVisible();

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

test('the owner gets the florist’s numbers on the module’s own admin page', async ({ page }) => {
  // The B7 decision: a page the flowers module owns, not panels on «Сьогодні».
  // What this guards is that a remote module can put a route AND a sidebar
  // entry in the admin at all — the same shape `tiktok-live` uses for
  // `/admin/live` — and that the numbers the server sends survive the trip.
  await signInAsFlorist(page);

  await page.route('**/api/pos/analytics/flowers**', async (route) => {
    await route.fulfill({
      json: {
        from: '2026-08-20',
        to: '2026-09-18',
        loss: {
          total_cost_cents: 50000,
          by_reason: [{ reason: 'damaged', quantity: 10, cost_cents: 40000 }],
          top_variants: [
            {
              variant_id: 1,
              product_name: 'Троянда',
              label: 'Червона',
              unit: 'шт',
              written_off: 20,
              cost_cents: 40000,
              received: 100,
              waste_bps: 2000,
            },
          ],
        },
        stems: [
          {
            variant_id: 1,
            product_name: 'Троянда',
            label: 'Червона',
            unit: 'шт',
            loose: 4,
            in_bouquets: 18,
            total: 22,
          },
        ],
        margin: {
          rows: [
            {
              kind: 'bouquet',
              lines: 3,
              revenue_cents: 101250,
              cost_cents: 36000,
              margin_cents: 65250,
              markup_bps: 18125,
            },
          ],
          total_revenue_cents: 101250,
          total_cost_cents: 36000,
          total_margin_cents: 65250,
          labour_bps: 2500,
        },
        daily_loss: [{ date: '2026-09-18', cost_cents: 40000 }],
      },
    });
  });

  await page.getByRole('link', { name: 'Квіти' }).click();
  await page.waitForURL(/\/admin\/flowers$/);

  const panel = page.getByTestId('flower-analytics');
  await expect(panel.getByTestId('loss-total')).toContainText('500');
  // The number the core dashboard cannot show: stems that left inside bouquets.
  await expect(panel.getByTestId('stem-table')).toContainText('18');
  await expect(panel.getByTestId('stem-table')).toContainText('22');
  // Markup is read against cost, so it is far above the 25% assembly charge —
  // the page says both, because confusing them is the easy mistake here.
  await expect(panel.getByTestId('bouquet-markup')).toContainText('181.3%');
  await expect(panel).toContainText('25%');
});

test('a clothes shop has no flowers page at all', async ({ page }) => {
  // Not an empty screen and not a 409 the owner has to read: the module is not
  // there, so neither is its nav entry. That is the whole argument for a page
  // over panels on the shared dashboard.
  await mockPosApi(page);
  await loginAsOwner(page);

  await expect(page.getByRole('link', { name: 'Квіти' })).toHaveCount(0);
});

/**
 * B8 — the same module contributing to a screen it does not own
 * (`TechDocs/POS_FLORIST_BENCH.md` §15).
 *
 * The pair mirrors the two `/register` tests above, because the slot has the
 * same three failure modes and one deliberately different answer: the sell
 * screen must always end up with a catalog, while «Сьогодні» must be willing
 * to end up with nothing.
 */

const DASHBOARD_ANALYTICS = {
  from: '2026-09-18',
  to: '2026-09-18',
  loss: {
    total_cost_cents: 50000,
    by_reason: [
      { reason: 'damaged', quantity: 10, cost_cents: 40000 },
      { reason: 'gift', quantity: 2, cost_cents: 10000 },
    ],
    top_variants: [],
  },
  stems: [],
  margin: {
    rows: [
      {
        kind: 'bouquet',
        lines: 6,
        revenue_cents: 180000,
        cost_cents: 90000,
        margin_cents: 90000,
        markup_bps: 10000,
      },
      {
        kind: 'other',
        lines: 9,
        revenue_cents: 60000,
        cost_cents: 40000,
        margin_cents: 20000,
        markup_bps: 5000,
      },
    ],
    total_revenue_cents: 240000,
    total_cost_cents: 130000,
    total_margin_cents: 110000,
    labour_bps: 3000,
  },
  daily_loss: [],
};

test('the florist’s three figures land on the owner’s «Сьогодні»', async ({ page }) => {
  await signInAsFlorist(page);
  // Registered after `mockPosApi`, so it beats its catch-all.
  const ranges: string[] = [];
  await page.route('**/api/pos/analytics/flowers**', async (route) => {
    const url = new URL(route.request().url());
    ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
    await route.fulfill({ json: DASHBOARD_ANALYTICS });
  });

  await page.goto('/admin');

  const panels = page.getByTestId('flower-panels');
  await expect(panels).toBeVisible();
  // Money that the sales figures above physically cannot show.
  await expect(panels.getByTestId('panel-loss')).toContainText('500');
  await expect(panels.getByTestId('panel-loss')).toContainText('здебільшого: завʼяло');
  // Whether the florist's work is where the takings are: 1800 of 2400.
  await expect(panels.getByTestId('panel-bouquet-revenue')).toContainText('1800');
  await expect(panels.getByTestId('panel-bouquet-revenue')).toContainText('75%');
  // Realised markup next to the rate the shop asks — never one without the other.
  await expect(panels.getByTestId('panel-bouquet-markup')).toContainText('100%');
  await expect(panels.getByTestId('panel-bouquet-markup')).toContainText('магазин просить 30%');

  // The window is the host's. The dashboard opens on today, so the panel asks
  // for today — not for a month of its own choosing.
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges[ranges.length - 1]).toBe('2026-01-01..2026-01-01');
});

test('with the module CDN down «Сьогодні» is simply the dashboard it always was', async ({ page }) => {
  // The reason the slot has no fallback. A failed remote must cost the owner
  // three figures and nothing else — no empty frame, no error, no blank page.
  await signInAsFlorist(page, { down: true });

  await page.goto('/admin');
  await expect(page.getByText('Загальний огляд продажів')).toBeVisible();
  await expect(page.getByTestId('flower-panels')).toHaveCount(0);
});

test('a clothes shop’s «Сьогодні» never borrows another vertical’s figures', async ({ page }) => {
  await mockPosApi(page);
  await loginAsOwner(page);

  await expect(page.getByText('Загальний огляд продажів')).toBeVisible();
  await expect(page.getByTestId('flower-panels')).toHaveCount(0);
});
