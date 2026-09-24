import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The restaurant end to end in the web shell (phase К4k): the REAL signed
 * `tables` bundle served from a fake CDN, a store that names it in
 * `module_remotes`, and one evening at table 5 —
 *
 *   карта залу → сісти за стіл → набрати → «На кухню» → оплатити → назад у залу
 *
 * Two things this spec exists to hold, both of which the design doc says in
 * words and which are easy to lose in code: the draft and the fired rounds are
 * DIFFERENT money (§4.3), and with the module's CDN down the till still sells
 * (the tables are simply not there).
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
      { id: 12, hall_id: 1, name: '6', seats: 2, pos_x: 2, pos_y: 0, width: 2, height: 2, shape: 'round', is_active: true },
    ],
  },
];

// A latte in two sizes with a required «Молоко»: the dish that cannot be one
// tap, so the sheet's own tap budget (§6) is measurable too.
const MILK = {
  id: 3,
  name: 'Молоко',
  min_select: 1,
  max_select: 1,
  modifiers: [
    { id: 31, name: 'звичайне', price_delta_cents: 0, is_default: true, component_variant_id: null, component_quantity: null },
    { id: 32, name: 'вівсяне', price_delta_cents: 1500, is_default: false, component_variant_id: null, component_quantity: null },
  ],
};

const LATTE = [5, 7].map((variantId, i) => ({
  variant_id: variantId,
  product_id: 1,
  product_name: 'Латте',
  attributes: { size: i === 0 ? 'M' : 'L' },
  label: i === 0 ? 'M' : 'L',
  unit: 'шт',
  sku: null,
  barcode: null,
  price_cents: i === 0 ? 6500 : 8500,
  compare_at_cents: null,
  quantity: 20,
  image_url: null,
  kind: 'simple',
  stock_mode: 'own',
  sellable: true,
  stop_listed: false,
  stop_listed_on: null,
  components: [],
  tag_ids: [],
  modifier_groups: [MILK],
}));

const MENU = [
  ...LATTE,
  {
    variant_id: 6,
    product_id: 4,
    product_name: 'Круасан',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 5500,
    compare_at_cents: null,
    quantity: 24,
    image_url: null,
    kind: 'simple',
    stock_mode: 'own',
    sellable: true,
    stop_listed: false,
    stop_listed_on: null,
    components: [],
    tag_ids: [],
    modifier_groups: [],
  },
];

function line(over: Record<string, unknown> = {}) {
  return {
    id: 21,
    variant_id: 6,
    quantity: 1,
    product_name: 'Круасан',
    variant_label: '',
    unit: 'шт',
    unit_price_cents: null,
    compare_at_unit_cents: null,
    preview_unit_price_cents: 5500,
    components: null,
    modifiers: [],
    note: '',
    sale_id: null,
    added_by: 1,
    added_by_name: 'Олена',
    sort_order: 0,
    ...over,
  };
}

function bill(over: Record<string, unknown> = {}) {
  return {
    id: 90,
    bill_no: 12,
    status: 'open',
    table_id: 11,
    table_name: '5',
    hall_id: 1,
    hall_name: 'Зала',
    guests: 2,
    note: null,
    customer_id: null,
    precheck_printed_at: null,
    opened_by: 1,
    opened_by_name: 'Олена',
    opened_at: new Date(Date.now() - 600_000).toISOString(),
    closed_at: null,
    rounds: [],
    draft: [],
    fired_total_cents: 0,
    draft_preview_cents: 0,
    ...over,
  };
}

/**
 * The evening at table 5, as a tiny state machine over the bill endpoints.
 *
 * Registered AFTER `mockPosApi`: Playwright matches routes in reverse
 * registration order, so its catch-all would otherwise answer `/halls` with
 * the clothing store's fixtures and the map would draw an empty room.
 */
async function mockTables(page: Page) {
  const sent: Array<{ path: string; body: unknown }> = [];
  let state = bill();

  await page.route('**/api/pos/halls', async (route) => route.fulfill({ json: { halls: HALLS } }));
  await page.route('**/api/pos/bills', async (route) => {
    if (route.request().method() === 'POST') {
      sent.push({ path: '/bills', body: route.request().postDataJSON() });
      return route.fulfill({ json: { bill: state, created: true } });
    }
    return route.fulfill({
      json: {
        bills:
          state.status === 'open' && (state.rounds.length > 0 || state.draft.length > 0)
            ? [
                {
                  id: 90,
                  bill_no: 12,
                  table_id: 11,
                  guests: 2,
                  opened_at: state.opened_at,
                  opened_by_name: 'Олена',
                  precheck_printed_at: null,
                  fired_total_cents: state.fired_total_cents,
                  draft_count: state.draft.length,
                  prep_status: state.rounds.length > 0 ? 'new' : null,
                },
              ]
            : [],
      },
    });
  });
  await page.route('**/api/pos/bills/90', async (route) => route.fulfill({ json: state }));
  await page.route('**/api/pos/bills/90/items', async (route) => {
    sent.push({ path: '/items', body: route.request().postDataJSON() });
    state = bill({ draft: [line()], draft_preview_cents: 5500 });
    await route.fulfill({ json: state });
  });
  await page.route('**/api/pos/bills/90/fire', async (route) => {
    sent.push({ path: '/fire', body: route.request().postDataJSON() });
    state = bill({
      rounds: [
        {
          id: 7,
          seq: 1,
          fired_at: new Date().toISOString(),
          fired_by: 1,
          fired_by_name: 'Олена',
          prep_status: 'new',
          ready_at: null,
          served_at: null,
          cancelled_at: null,
          items: [line({ unit_price_cents: 5500, preview_unit_price_cents: null })],
          total_cents: 5500,
        },
      ],
      fired_total_cents: 5500,
    });
    await route.fulfill({ json: state });
  });
  await page.route('**/api/pos/bills/90/pay', async (route) => {
    sent.push({ path: '/pay', body: route.request().postDataJSON() });
    state = bill({ status: 'paid', closed_at: new Date().toISOString() });
    await route.fulfill({ json: { bill: state, sale_ids: [501] } });
  });
  return sent;
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

async function signInAsWaiter(page: Page, { down = false } = {}) {
  await serveBuiltRemote(page, { down });
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { tables: TABLES_REMOTE },
    store: { vertical: CAFE_VERTICAL },
  });
  await page.route('**/api/pos/catalog**', async (route) => route.fulfill({ json: MENU }));
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
}

test('one evening at table 5: seat, ring, fire, pay', async ({ page }) => {
  await signInAsWaiter(page);
  const sent = await mockTables(page);

  await page.goto('/tables');
  await expect(page.getByTestId('table-tile-11')).toContainText('5');
  await expect(page.getByTestId('table-tile-11')).toHaveAttribute('data-tone', 'free');

  // One tap seats the table and opens its bill — the server answers with the
  // bill already there for an occupied one, so the screen never asks which.
  await page.getByTestId('table-tile-11').click();
  await expect(page.getByTestId('bill-page')).toContainText('Стіл 5');

  // The menu is on the screen beside the bill: a tap on the tile is the whole
  // order, and the line is on the draft before the server has answered.
  await page.getByTestId('menu-tile-4').click();
  await expect(page.getByTestId('bill-draft')).toContainText('Круасан');
  await expect(page.getByTestId('bill-line-21')).toHaveAttribute('data-pending', 'no');

  // The two sums are named apart: nothing is owed until the round fires.
  await expect(page.getByTestId('bill-owed')).toContainText('0');
  await expect(page.getByTestId('bill-draft-total')).toContainText('55');

  await page.getByTestId('bill-fire').click();
  await expect(page.getByTestId('bill-owed')).toContainText('55');
  await expect(page.getByTestId('bill-draft-total')).toHaveCount(0);
  expect(sent.find((s) => s.path === '/fire')?.body).toHaveProperty('client_uuid');

  await page.getByTestId('bill-pay').click();
  await page.getByTestId('pay-submit').click();
  // A settled bill sends the waiter back to the room.
  await expect(page).toHaveURL(/\/tables$/);
  await expect(page.getByTestId('table-tile-11')).toHaveAttribute('data-tone', 'free');
  const paid = sent.find((s) => s.path === '/pay')?.body as {
    parts: Array<{ payments: Array<{ amount_cents: number }> }>;
  };
  expect(paid.parts[0].payments[0].amount_cents).toBe(5500);
});

test('with the module CDN down there are no tables, and the till still sells', async ({ page }) => {
  await signInAsWaiter(page, { down: true });
  await mockTables(page);

  // An online-only module that failed to load leaves nothing behind on the
  // web: no route, no nav entry, no placeholder (the desktop shows one).
  await page.goto('/tables');
  await expect(page.getByTestId('hall-map')).toHaveCount(0);
  await expect(page.getByTestId('bill-page')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Столи' })).toHaveCount(0);

  // And the till sells exactly as it did before the restaurant existed.
  await page.goto('/register');
  await expect(page.getByPlaceholder(/^Пошук/)).toBeVisible();
});

/**
 * The speed budget of §6, counted rather than promised: every tap the waiter
 * makes goes through `tap`, and the number at the end is the number in the
 * table. «Стіл + три плитки + На кухню» is five; a latte with two changed
 * answers is «⋯» + two chips + «Додати», four.
 */
function counter(page: Page) {
  let taps = 0;
  return {
    tap: async (testId: string) => {
      taps += 1;
      await page.getByTestId(testId).click();
    },
    count: () => taps,
  };
}

test('five taps: open the table and ring three simple dishes', async ({ page }) => {
  await signInAsWaiter(page);
  const sent = await mockTables(page);
  await page.goto('/tables');
  const { tap, count } = counter(page);

  await tap('table-tile-11');
  await expect(page.getByTestId('bill-page')).toContainText('Стіл 5');
  await tap('menu-tile-4');
  await tap('menu-tile-4');
  await tap('menu-tile-4');
  // Three taps, one line: the draft merges the way the server does.
  await expect(page.getByTestId('bill-draft')).toContainText('Круасан');
  await expect(page.getByTestId('bill-line-21')).toHaveAttribute('data-pending', 'no');
  await tap('bill-fire');
  await expect(page.getByTestId('bill-owed')).toContainText('55');

  expect(count()).toBe(5);
  expect(sent.filter((s) => s.path === '/items')).toHaveLength(3);
  expect(sent.filter((s) => s.path === '/fire')).toHaveLength(1);
});

test('four taps: a latte with two changed answers', async ({ page }) => {
  await signInAsWaiter(page);
  const sent = await mockTables(page);
  await page.goto('/tables');
  await page.getByTestId('table-tile-11').click();
  await expect(page.getByTestId('bill-page')).toContainText('Стіл 5');
  const { tap, count } = counter(page);

  await tap('menu-tile-1-more');
  await tap('modifier-variant-7');
  await tap('modifier-chip-32');
  await tap('modifier-add');

  expect(count()).toBe(4);
  const added = sent.find((s) => s.path === '/items')?.body;
  expect(added).toMatchObject({ variant_id: 7, quantity: 1, modifiers: [32] });
});
