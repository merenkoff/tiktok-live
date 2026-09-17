import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The florist's bench (`TechDocs/POS_FLORIST_BENCH.md`), driven through the
 * REAL signed `vertical-flowers` bundle the webServer command builds — same
 * setup as `vertical-flowers.spec.ts`, because a screenshot of a mock would
 * prove nothing about what a shop actually sees.
 *
 * It does two jobs. It asserts the behaviour the design rests on: one tap adds
 * one stem, the price moves with every tap and carries the shop's assembly
 * charge, the budget bar warns rather than re-pricing, and a finished bouquet
 * lands in the cart as ONE line. And it writes the screenshots the design
 * review is done from, at the two sizes the doc names — a 14" till (§4) and a
 * tablet (§2).
 *
 * The tap count is asserted, not eyeballed: §5 budgets a five-stem bouquet at
 * ≤ 12 taps from «Зібрати букет» to «Додати в чек».
 */

const CDN = 'https://cdn.e2e.test/vertical-flowers';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../dist-remotes/vertical-flowers');
// The demo shop's artwork lives at the repo root and is served by the API in
// production (`public/` is already mounted at `/`). `vite preview` serves only
// `pos/dist`, so the spec hands the files over itself.
const ARTWORK = path.resolve(HERE, '../../public/demo-flowers');
const SHOTS = path.resolve(HERE, '__screenshots__/bench');

const TILL = { width: 1366, height: 768 }; // Toast Flex 14", the doc's reference
const TABLET = { width: 834, height: 1112 }; // iPad 10.9"

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

/** Prices and stock from migration `039`, so the screenshots read as the demo shop. */
function stem(
  variantId: number,
  productId: number,
  name: string,
  art: string,
  color: string,
  lengthCm: number,
  priceCents: number,
  quantity: number
) {
  return {
    variant_id: variantId,
    product_id: productId,
    product_name: name,
    attributes: lengthCm > 0 ? { color, length_cm: lengthCm } : { color },
    label: lengthCm > 0 ? `${color} · ${lengthCm} см` : color,
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: priceCents,
    quantity,
    image_url: `/demo-flowers/${art}.svg`,
    kind: 'simple',
    stock_mode: 'own',
    tag_ids: [],
  };
}

const FLOWERS_CATALOG = [
  stem(1, 1, 'Троянда Freedom', 'rose-freedom', 'Червона', 60, 9000, 90),
  stem(2, 2, 'Троянда Avalanche', 'rose-avalanche', 'Біла', 60, 9500, 60),
  stem(3, 3, 'Троянда Mondial', 'rose-mondial', 'Кремова', 60, 10000, 45),
  stem(4, 4, 'Троянда кущова Bombastic', 'rose-spray-bombastic', 'Рожева', 50, 13000, 30),
  stem(5, 5, 'Тюльпан Dynasty', 'tulip-pink', 'Рожевий', 40, 4500, 200),
  stem(6, 6, 'Тюльпан Strong Gold', 'tulip-yellow', 'Жовтий', 40, 4500, 150),
  stem(7, 7, 'Хризантема кущова', 'chrysanthemum', 'Жовта', 55, 6500, 80),
  stem(8, 8, 'Еустома', 'eustoma', 'Біла', 55, 8500, 55),
  stem(9, 9, 'Альстромерія', 'alstroemeria', 'Рожева', 60, 6000, 75),
  stem(10, 10, 'Ранункулюс', 'ranunculus', 'Персиковий', 40, 9500, 40),
  stem(11, 11, 'Гортензія', 'hydrangea', 'Блакитна', 50, 22000, 18),
  stem(12, 12, 'Півонія', 'peony', 'Рожева', 50, 18000, 24),
  stem(13, 13, 'Евкаліпт', 'eucalyptus', 'Зелений', 50, 5500, 100),
  stem(14, 14, 'Рускус', 'ruscus', 'Зелений', 60, 4500, 85),
  stem(15, 15, 'Гіпсофіла', 'gypsophila', 'Біла', 50, 7000, 90),
  stem(16, 16, 'Статиця', 'statice', 'Бузкова', 45, 5000, 60),
  stem(17, 17, 'Крафт-папір', 'kraft', 'Натуральний', 0, 4000, 300),
  stem(18, 18, 'Стрічка атласна', 'ribbon', 'Пудрова', 0, 2500, 200),
  {
    // A bouquet already standing in the window: one_off, one on the shelf.
    variant_id: 60,
    product_id: 60,
    product_name: 'Букет №41',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: '2000000000604',
    price_cents: 130000,
    quantity: 1,
    image_url: '/demo-flowers/bouquet-tenderness.svg',
    kind: 'composite',
    // `own`: it is already tied and standing in a bucket. Marking it `derived`
    // would make it a second card the «Зібрати букет» button offers to assemble
    // ON, which is not what a finished bouquet is.
    stock_mode: 'own',
    one_off: true,
    components: [
      { component_variant_id: 1, quantity: 9, product_name: 'Троянда Freedom', label: 'Червона · 60 см', unit: 'шт' },
      { component_variant_id: 13, quantity: 3, product_name: 'Евкаліпт', label: 'Зелений · 50 см', unit: 'шт' },
    ],
    tag_ids: [],
  },
  {
    // A catalogue recipe: a `derived` template the shop rings again and again.
    // Tapping it opens the bench ALREADY LOADED with these stems.
    variant_id: 70,
    product_id: 70,
    product_name: 'Букет «Весняний»',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 95000,
    quantity: 8,
    image_url: '/demo-flowers/bouquet-morning.svg',
    kind: 'composite',
    stock_mode: 'derived',
    one_off: false,
    components: [
      { component_variant_id: 5, quantity: 11, product_name: 'Тюльпан Dynasty', label: 'Рожевий · 40 см', unit: 'шт' },
      { component_variant_id: 13, quantity: 3, product_name: 'Евкаліпт', label: 'Зелений · 50 см', unit: 'шт' },
    ],
    tag_ids: [],
  },
  {
    // The card the bench opens on: a composite the shop ties when it sells, so
    // its own stock is 0 forever and tapping it must mean "make me one".
    variant_id: 50,
    product_id: 50,
    product_name: 'Букет на замовлення',
    attributes: {},
    label: '',
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 0,
    quantity: 0,
    image_url: '/demo-flowers/bouquet-tenderness.svg',
    kind: 'composite',
    stock_mode: 'derived',
    components: [],
    tag_ids: [],
  },
];

async function serveArtwork(page: Page) {
  await page.route('**/demo-flowers/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    try {
      await route.fulfill({ body: readFileSync(path.join(ARTWORK, name)), contentType: 'image/svg+xml' });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

async function serveBuiltRemote(page: Page) {
  await page.route(`${CDN}/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    try {
      await route.fulfill({
        body: readFileSync(path.join(DIST, name)),
        contentType: CONTENT_TYPES[path.extname(name)] ?? 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' },
      });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

async function openBench(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await serveArtwork(page);
  await serveBuiltRemote(page);
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'vertical-flowers': FLOWERS_REMOTE },
    // 2500 bps = 25%, the trade's usual assembly charge and what migration 040
    // gives the demo shop.
    store: { vertical: FLOWERS_VERTICAL, florist_labour_bps: 2500 },
  });
  await page.route('**/api/pos/catalog**', (route) => route.fulfill({ json: FLOWERS_CATALOG }));
  await loginAsOwner(page);
  // A module list only applies on the next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
  await page.goto('/register');
  await expect(page.getByTestId('flowers-catalog')).toBeVisible();
}

/**
 * One tap = one stem. Returns how many taps it took, for the speed budget.
 *
 * Scoped to the bench's own grid: the sell screen's catalog stays mounted
 * underneath the full-screen bench, so an unscoped locator finds its tile
 * first and then waits forever for the overlay to stop covering it.
 */
async function addStems(page: Page, name: string, count: number): Promise<number> {
  const tile = page.getByTestId('bench-grid').getByRole('button', { name: new RegExp(name) }).first();
  for (let i = 0; i < count; i += 1) await tile.click();
  return count;
}

test('the bench prices a bouquet as it is assembled, and rings it as one line', async ({
  page,
}) => {
  await openBench(page, TILL);

  const completed: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/sales/complete', async (route) => {
    completed.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        id: 7,
        receipt_number: 'ЧК-000007',
        status: 'completed',
        subtotal_cents: 121875,
        total_cents: 121875,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [{ id: 1, method: 'cash', amount_cents: 121875 }],
        refunds: [],
      },
    });
  });

  await page.getByTestId('start-bouquet').click();
  await expect(page.getByTestId('florist-bench')).toBeVisible();

  // Nine roses at 90 = 810; plus 25% labour = 1012.50. The price is on screen
  // the whole time, which is the one thing §2 says may never be broken.
  await addStems(page, 'Троянда Freedom', 9);
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1012,50 ₴');
  await expect(page.getByTestId('bench-grid').getByTestId('tile-count').first()).toHaveText('9');

  // Three eucalyptus at 55 = 165 → parts 975, labour 243.75, total 1218.75.
  await addStems(page, 'Евкаліпт', 3);
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1218,75 ₴');

  await page.locator('[data-testid=bench-add-to-cart]:visible').click();
  await expect(page.getByTestId('florist-bench')).toBeHidden();

  // ONE cart line, whose caption counts what was tied rather than repeating the
  // template card's own.
  await expect(page.getByText('12 стебел')).toBeVisible();

  await page.getByRole('button', { name: /^Сплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByText('ЧК-000007')).toBeVisible();
  expect(completed).toHaveLength(1);

  const items = (completed[0] as { items: Array<Record<string, unknown>> }).items;
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ variant_id: 50, quantity: 1 });
  // The price is NOT sent: the server recomputes it from the components, which
  // is what stops a freely settable line price from becoming a hole.
  expect(items[0]).not.toHaveProperty('unit_price_cents');
  expect(items[0].components).toEqual([
    { component_variant_id: 1, quantity: 9 },
    { component_variant_id: 13, quantity: 3 },
  ]);
});

test('a stem comes back out with one tap, and the budget warns without re-pricing', async ({
  page,
}) => {
  await openBench(page, TILL);
  await page.getByTestId('start-bouquet').click();

  await page.locator('[data-testid=bench-set-budget]:visible').click();
  await page.getByTestId('bench-budget-input').fill('1200');
  await page.getByRole('button', { name: 'Готово' }).click();

  await addStems(page, 'Гортензія', 5); // 220 each → 1100 + 25% = 1375
  await expect(page.locator('[data-testid=bench-budget]:visible')).toContainText('Перебір на');
  // §3.5: the bar is a hint. The price stays what the composition says.
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1375,00 ₴');

  // §3.7: taking one back is free and instant — no manager code, no confirm.
  await page.getByRole('button', { name: 'Менше: Гортензія' }).click();
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1100,00 ₴');
  await expect(page.locator('[data-testid=bench-budget]:visible')).not.toContainText('Перебір');
});

test('a real bouquet stays inside the speed budget', async ({ page }) => {
  await openBench(page, TILL);

  // Nine roses, three eucalyptus, two statice, a wrap and a ribbon — five kinds
  // of stem and sixteen stems, which is an ordinary counter bouquet. One tap
  // per stem would be seventeen taps on its own; the pad is what makes the
  // budget reachable.
  let taps = 0;
  await page.getByTestId('start-bouquet').click();
  taps += 1;

  taps += await addStems(page, 'Троянда Freedom', 1);
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  taps += 1;

  taps += await addStems(page, 'Евкаліпт', 1);
  await page.locator('[data-testid=bench-pad-3]:visible').click();
  taps += 1;

  taps += await addStems(page, 'Статиця', 2);
  taps += await addStems(page, 'Крафт-папір', 1);
  taps += await addStems(page, 'Стрічка атласна', 1);

  await page.locator('[data-testid=bench-add-to-cart]:visible').click();
  taps += 1;

  await expect(page.getByText('16 стебел')).toBeVisible();
  // §5: five kinds of stem, from «Зібрати букет» to «Додати в чек», ≤ 12 taps.
  expect(taps).toBeLessThanOrEqual(12);
});

test('the pad types a count into the stem last touched', async ({ page }) => {
  await openBench(page, TILL);
  await page.getByTestId('start-bouquet').click();

  await addStems(page, 'Троянда Freedom', 1);
  // The first digit replaces the count, so «9» means nine roses, not ninety…
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1012,50 ₴');

  // …and a second digit builds on it: 9 then 1 is ninety-one, capped at the 90
  // the shelf holds.
  await page.locator('[data-testid=bench-pad-1]:visible').click();
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('10125,00 ₴');

  // ⌫ rubs out the last digit rather than clearing the row.
  await page.locator('[data-testid=bench-pad-backspace]:visible').click();
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1012,50 ₴');

  // A stem added earlier is aimed at by tapping its count.
  await addStems(page, 'Евкаліпт', 1);
  await page.locator('[data-testid=bench-stem-qty]:visible').first().click();
  await page.locator('[data-testid=bench-pad-2]:visible').click();
  // 2 roses (180) + 1 eucalyptus (55) = 235 + 25% = 293.75
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('293,75 ₴');
});

test('a bouquet can go to the window instead of the cart', async ({ page }) => {
  await openBench(page, TILL);

  const made: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/bench/showcase', async (route) => {
    made.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        product_id: 90,
        variant_id: 900,
        name: 'Букет №42',
        barcode: '2000000009003',
        price_cents: 130000,
        cost_cents: 47000,
        document_id: 12,
        doc_number: 'ВР-2026-00042',
        created: true,
      },
    });
  });

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 1);
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  await addStems(page, 'Евкаліпт', 1);
  await page.locator('[data-testid=bench-pad-3]:visible').click();
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1218,75 ₴');

  await page.getByTestId('bench-to-showcase').click();
  await expect(page.getByTestId('showcase-sheet')).toBeVisible();
  // The sheet starts on the computed price; the florist rounds it up.
  await expect(page.getByTestId('showcase-price')).toHaveValue('1218,75');
  await page.getByTestId('showcase-price').fill('1300');
  await page.getByTestId('showcase-submit').click();

  await expect.poll(() => made.length).toBe(1);
  expect(made[0]).toMatchObject({
    price_cents: 130000,
    components: [
      { component_variant_id: 1, quantity: 9 },
      { component_variant_id: 13, quantity: 3 },
    ],
  });
  // Blank name: only the server knows the document number it is named after.
  expect(made[0].name).toBeNull();
  expect(made[0].client_uuid).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );

  // The bench closes, nothing is rung, and the cart says where the bouquet went.
  await expect(page.getByTestId('florist-bench')).toBeHidden();
  await expect(page.getByText('Букет №42 — на вітрині, 1300,00 ₴')).toBeVisible();
});

test('it sends no price when the florist did not round it', async ({ page }) => {
  await openBench(page, TILL);

  const made: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/bench/showcase', async (route) => {
    made.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        product_id: 91,
        variant_id: 901,
        name: 'Букет №43',
        barcode: '2000000009010',
        price_cents: 121875,
        cost_cents: 40000,
        document_id: 13,
        doc_number: 'ВР-2026-00043',
        created: true,
      },
    });
  });

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 1);
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  await addStems(page, 'Евкаліпт', 1);
  await page.locator('[data-testid=bench-pad-3]:visible').click();

  await page.getByTestId('bench-to-showcase').click();
  await page.getByTestId('showcase-submit').click();

  await expect.poll(() => made.length).toBe(1);
  // Untouched price → the server prices it from the components, so one
  // authority owns the arithmetic instead of two that can drift.
  expect(made[0].price_cents).toBeNull();
});

test('a refusal is shown in the server\'s own words, and nothing closes', async ({ page }) => {
  await openBench(page, TILL);
  await page.route('**/api/pos/bench/showcase', (route) =>
    route.fulfill({ status: 400, json: { error: 'Недостатньо стебел на полиці' } })
  );

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 3);
  await page.getByTestId('bench-to-showcase').click();
  await page.getByTestId('showcase-submit').click();

  await expect(page.getByTestId('showcase-error')).toHaveText('Недостатньо стебел на полиці');
  await expect(page.getByTestId('showcase-sheet')).toBeVisible();
  await expect(page.getByTestId('florist-bench')).toBeVisible();
});

test('screenshots — till', async ({ page }) => {
  await openBench(page, TILL);
  await page.getByTestId('start-bouquet').click();
  await expect(page.getByTestId('florist-bench')).toBeVisible();
  await page.waitForTimeout(300); // let the SVG artwork paint
  await page.screenshot({ path: path.join(SHOTS, 'bench-till-empty.png') });

  await page.locator('[data-testid=bench-set-budget]:visible').click();
  await page.getByTestId('bench-budget-input').fill('1500');
  await page.getByRole('button', { name: 'Готово' }).click();

  await addStems(page, 'Троянда Freedom', 1);
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  await addStems(page, 'Евкаліпт', 1);
  await page.locator('[data-testid=bench-pad-3]:visible').click();
  await addStems(page, 'Крафт-папір', 1);
  await expect(page.locator('[data-testid=bench-budget]:visible')).not.toContainText('Перебір');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'bench-till-filled.png') });

  await addStems(page, 'Гортензія', 2);
  await expect(page.locator('[data-testid=bench-budget]:visible')).toContainText('Перебір на');
  await page.screenshot({ path: path.join(SHOTS, 'bench-till-over-budget.png') });

  // The second ending: the bouquet goes to the window, not to the cart.
  await page.getByTestId('bench-to-showcase').click();
  await expect(page.getByTestId('showcase-sheet')).toBeVisible();
  // `animate-fade-up` is still running when the element becomes "visible";
  // shooting now catches it half transparent.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'bench-till-showcase.png') });
});

test('screenshots — tablet', async ({ page }) => {
  await openBench(page, TABLET);
  await page.getByTestId('start-bouquet').click();
  await expect(page.getByTestId('florist-bench')).toBeVisible();

  await page.locator('[data-testid=bench-set-budget]:visible').click();
  await page.getByTestId('bench-budget-input').fill('900');
  await page.getByRole('button', { name: 'Готово' }).click();

  await addStems(page, 'Тюльпан Dynasty', 1);
  await addStems(page, 'Евкаліпт', 1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'bench-tablet-grid.png') });

  await page.getByTestId('bench-open-sheet').click();
  await expect(page.locator('[data-testid=bench-pad]:visible')).toBeVisible();
  await page.locator('[data-testid=bench-stem-qty]:visible').first().click();
  await page.locator('[data-testid=bench-pad-1]:visible').click();
  await page.locator('[data-testid=bench-pad-1]:visible').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'bench-tablet-sheet.png') });
});

test('the window lists what is made up, and writes off what did not sell', async ({ page }) => {
  await openBench(page, TILL);

  const written: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/bench/writeoff', async (route) => {
    written.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: { variant_id: 60, quantity: 1, doc_number: 'СП-2026-00007', created: true },
    });
  });

  await page.goto('/flowers');
  await expect(page.getByRole('heading', { name: 'Вітрина' })).toBeVisible();

  // Only the one-off card. «Букет на замовлення» is the bench's template and
  // has no stock; the stems are not bouquets.
  const rows = page.getByTestId('showcase-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Букет №41');
  await expect(rows.first()).toContainText('1300,00 ₴');
  // Its recipe is on the row — the only place a one-off bouquet's is.
  await expect(rows.first()).toContainText('Троянда Freedom × 9');

  await page.getByTestId('showcase-writeoff').click();
  await expect(page.getByTestId('writeoff-dialog')).toBeVisible();
  // The one thing a florist might reasonably expect to work the other way.
  await expect(page.getByTestId('writeoff-dialog')).toContainText('Стебла не повернуться');
  await page.getByTestId('writeoff-damaged').click();

  await expect.poll(() => written.length).toBe(1);
  expect(written[0]).toMatchObject({ variant_id: 60, reason_code: 'damaged' });
  expect(written[0].client_uuid).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );
});

test('a refused write-off says why, in the server\'s words', async ({ page }) => {
  await openBench(page, TILL);
  await page.route('**/api/pos/bench/writeoff', (route) =>
    route.fulfill({ status: 400, json: { error: 'Цього букета вже немає на вітрині' } })
  );

  await page.goto('/flowers');
  await page.getByTestId('showcase-writeoff').click();
  await page.getByTestId('writeoff-damaged').click();

  await expect(page.getByTestId('showcase-page-error')).toHaveText(
    'Цього букета вже немає на вітрині'
  );
  // Still listed: nothing was written off, so nothing may disappear.
  await expect(page.getByTestId('showcase-row')).toHaveCount(1);
});

test('screenshots — showcase', async ({ page }) => {
  await openBench(page, TILL);
  await page.goto('/flowers');
  await expect(page.getByTestId('showcase-row')).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'showcase-list.png') });

  await page.getByTestId('showcase-writeoff').click();
  await expect(page.getByTestId('writeoff-dialog')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'showcase-writeoff.png') });
});

/** A 1×1 PNG — enough for `createImageBitmap`, small enough to inline. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('a photo shot on the bench rides onto the card', async ({ page }) => {
  await openBench(page, TILL);

  await page.route('**/api/pos/bench/photo', (route) =>
    route.fulfill({ status: 201, json: { url: '/pos-uploads/shot.jpg', filename: 'shot.jpg' } })
  );
  await page.route('**/demo-flowers/shot.jpg', (route) =>
    route.fulfill({ body: TINY_PNG, contentType: 'image/png' })
  );
  const made: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/bench/showcase', async (route) => {
    made.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        product_id: 92,
        variant_id: 902,
        name: 'Букет №44',
        barcode: '2000000009027',
        price_cents: 121875,
        cost_cents: 40000,
        document_id: 14,
        doc_number: 'ВР-2026-00044',
        created: true,
      },
    });
  });

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 3);
  await page.getByTestId('bench-to-showcase').click();

  // The tablet path: the input carries `capture`, so one tap is the camera.
  await expect(page.getByTestId('bouquet-photo-input')).toHaveAttribute('capture', 'environment');
  await page.getByTestId('bouquet-photo-input').setInputFiles({
    name: 'bouquet.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(page.getByTestId('bouquet-photo-shoot')).toHaveText('Зняти ще раз');

  await page.getByTestId('showcase-submit').click();
  await expect.poll(() => made.length).toBe(1);
  expect(made[0].image_url).toBe('/pos-uploads/shot.jpg');
});

test('a photo can be added to a bouquet already in the window', async ({ page }) => {
  await openBench(page, TILL);

  await page.route('**/api/pos/bench/photo', (route) =>
    route.fulfill({ status: 201, json: { url: '/pos-uploads/late.jpg', filename: 'late.jpg' } })
  );
  const attached: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/bench/showcase/photo', async (route) => {
    attached.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, json: { variant_id: 60, image_url: '/pos-uploads/late.jpg' } });
  });

  await page.goto('/flowers');
  await page.getByTestId('showcase-photo').click();
  await expect(page.getByTestId('photo-dialog')).toBeVisible();
  await page.getByTestId('bouquet-photo-input').setInputFiles({
    name: 'bouquet.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });

  await expect.poll(() => attached.length).toBe(1);
  expect(attached[0]).toMatchObject({ variant_id: 60, image_url: '/pos-uploads/late.jpg' });
});

test('an upload refusal is shown and the bouquet is not lost', async ({ page }) => {
  await openBench(page, TILL);
  await page.route('**/api/pos/bench/photo', (route) =>
    route.fulfill({ status: 400, json: { error: 'Файл більше 5 МБ' } })
  );

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 3);
  await page.getByTestId('bench-to-showcase').click();
  await page.getByTestId('bouquet-photo-input').setInputFiles({
    name: 'bouquet.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });

  await expect(page.getByTestId('bouquet-photo-error')).toHaveText('Файл більше 5 МБ');
  // The sheet stays open and the bouquet is still ringable without a photo.
  await expect(page.getByTestId('showcase-sheet')).toBeVisible();
  await expect(page.getByTestId('showcase-submit')).toBeEnabled();
});

test('screenshots — photo', async ({ page }) => {
  await openBench(page, TILL);
  await page.route('**/api/pos/bench/photo', (route) =>
    route.fulfill({ status: 201, json: { url: '/demo-flowers/bouquet-summer.svg', filename: 's.svg' } })
  );

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 1);
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  await page.getByTestId('bench-to-showcase').click();
  await page.getByTestId('bouquet-photo-input').setInputFiles({
    name: 'bouquet.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(page.getByTestId('bouquet-photo-shoot')).toHaveText('Зняти ще раз');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'showcase-sheet-photo.png') });
});

test('tapping a recipe card opens the bench already loaded with it', async ({ page }) => {
  await openBench(page, TILL);

  // Assembling BY a recipe is tapping that recipe's own card — the «Зібрати
  // букет» shortcut is the blank start.
  await page.getByRole('button', { name: /Весняний/ }).first().click();

  await expect(page.getByTestId('florist-bench')).toBeVisible();
  // 11 tulips at 45 + 3 eucalyptus at 55 = 660; +25% = 825.
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('825,00 ₴');
  await expect(page.locator('[data-testid=bench-stem]:visible')).toHaveCount(2);
  // …and it is a starting point, not a fixed order: the florist adjusts.
  await addStems(page, 'Троянда Freedom', 1);
  await expect(page.locator('[data-testid=bench-stem]:visible')).toHaveCount(3);
});

test('a recipe caps at the shelf rather than promising flowers that are gone', async ({ page }) => {
  await page.setViewportSize(TILL);
  await serveArtwork(page);
  await serveBuiltRemote(page);
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'vertical-flowers': FLOWERS_REMOTE },
    store: { vertical: FLOWERS_VERTICAL, florist_labour_bps: 2500 },
  });
  // The fridge holds four tulips; the recipe asks for eleven.
  await page.route('**/api/pos/catalog**', (route) =>
    route.fulfill({
      json: FLOWERS_CATALOG.map((row) =>
        row.variant_id === 5 ? { ...row, quantity: 4 } : row
      ),
    })
  );
  await loginAsOwner(page);
  await page.reload();
  await page.waitForURL(/\/admin$/);
  await page.goto('/register');

  await page.getByRole('button', { name: /Весняний/ }).first().click();

  // 4 tulips (180) + 3 eucalyptus (165) = 345; +25% = 431.25.
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('431,25 ₴');
});

test('the composition can be kept as a catalogue recipe', async ({ page }) => {
  await openBench(page, TILL);

  const saved: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/bench/recipe', async (route) => {
    saved.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      json: { product_id: 80, variant_id: 800, name: 'Ніжність', price_cents: 121875 },
    });
  });

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 1);
  await page.locator('[data-testid=bench-pad-9]:visible').click();
  await addStems(page, 'Евкаліпт', 1);
  await page.locator('[data-testid=bench-pad-3]:visible').click();

  await page.getByTestId('bench-save-recipe').click();
  await expect(page.getByTestId('recipe-sheet')).toBeVisible();
  // A recipe nobody can name is one nobody finds again.
  await expect(page.getByTestId('recipe-submit')).toBeDisabled();
  await page.getByTestId('recipe-name').fill('Ніжність');
  await page.getByTestId('recipe-submit').click();

  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({
    name: 'Ніжність',
    components: [
      { component_variant_id: 1, quantity: 9 },
      { component_variant_id: 13, quantity: 3 },
    ],
  });
  // Untouched price → the server prices it, same rule as the window.
  expect(saved[0].price_cents).toBeNull();

  // The bench stays open: saving a recipe is not finishing with the bouquet.
  await expect(page.getByTestId('florist-bench')).toBeVisible();
  await expect(page.locator('[data-testid=bench-total]:visible')).toHaveText('1218,75 ₴');
});

test('a name the catalogue already uses is refused in the server\'s words', async ({ page }) => {
  await openBench(page, TILL);
  await page.route('**/api/pos/bench/recipe', (route) =>
    route.fulfill({ status: 400, json: { error: 'Товар «Ніжність» уже є в каталозі' } })
  );

  await page.getByTestId('start-bouquet').click();
  await addStems(page, 'Троянда Freedom', 3);
  await page.getByTestId('bench-save-recipe').click();
  await page.getByTestId('recipe-name').fill('Ніжність');
  await page.getByTestId('recipe-submit').click();

  await expect(page.getByTestId('recipe-error')).toHaveText('Товар «Ніжність» уже є в каталозі');
  await expect(page.getByTestId('recipe-sheet')).toBeVisible();
});

test('screenshots — recipe', async ({ page }) => {
  await openBench(page, TILL);
  await page.getByRole('button', { name: /Весняний/ }).first().click();
  await expect(page.locator('[data-testid=bench-stem]:visible')).toHaveCount(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'bench-from-recipe.png') });

  await page.getByTestId('bench-save-recipe').click();
  await page.getByTestId('recipe-name').fill('Весняний великий');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'bench-recipe-sheet.png') });
});
