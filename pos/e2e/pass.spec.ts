import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { hasPrivateModule } from './_private';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

// `pass` is an online-only module whose source is private (POS_OPENCORE.md §5);
// run this spec only where that source is present.
test.skip(() => !hasPrivateModule('pass'), 'pass: private module (POS_OPENCORE §5)');

/**
 * «Роздача» (TechDocs/POS_PASS.md, B2) through the REAL signed bundle served
 * from a fake CDN: the row of tables, «Несете на стіл 5?», the plate leaving
 * the list, «Повернути», the server's refusal in its own words, and a store
 * without «Столи» told so instead of shown an empty screen.
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
  nav: [{ label: title, location: 'cashier-primary', order: 60, icon }],
  icon,
});
const TABLES_REMOTE = entry('tables', 'Столи', '/tables', 'Table');
const PASS_REMOTE = entry('pass', 'Роздача', '/pass', 'UtensilsCrossed');

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

function feed(servedBorscht = 0) {
  return {
    now: new Date().toISOString(),
    tables: [
      {
        table_id: 11,
        table_name: '5',
        hall_name: 'Зала',
        bill_id: 90,
        bill_no: 12,
        opened_by_name: 'Олена',
        to_serve: 3 - servedBorscht,
        rounds: [
          {
            id: 7,
            seq: 1,
            fired_at: minutesAgo(12),
            fired_by_name: 'Олена',
            prep_status: 'ready',
            ready_at: minutesAgo(2),
            items: [
              { id: 21, product_name: 'Борщ', caption: '', note: '', modifiers: [], quantity: 2, served_quantity: servedBorscht, stations: ['kitchen'] },
              { id: 22, product_name: 'Узвар', caption: '', note: 'без цукру', modifiers: [], quantity: 1, served_quantity: 0, stations: ['bar'] },
            ],
          },
        ],
      },
    ],
  };
}

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

async function signIn(page: Page, moduleRemotes: Record<string, unknown>) {
  await serveBuiltRemotes(page);
  await mockPosApi(page, ALL_MODULES, { moduleRemotes, store: { vertical: CAFE_VERTICAL } });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the next boot.
  await page.reload();
  await page.waitForURL(/\/admin$/);
}

/** The serving endpoints, as a tiny state machine. Registered AFTER `mockPosApi`. */
async function mockServing(page: Page, opts: { refuse?: string } = {}) {
  const sent: Array<{ path: string; body: unknown }> = [];
  let served = 0;
  await page.route('**/api/pos/serving', async (route) => route.fulfill({ json: feed(served) }));
  await page.route('**/api/pos/serving/bills/*', async (route) =>
    route.fulfill({ json: { now: new Date().toISOString(), bill_id: 90, status: 'open', rounds: [], history: [] } })
  );
  await page.route('**/api/pos/serving/serve', async (route) => {
    const body = route.request().postDataJSON() as { items: Array<{ quantity: number }> };
    sent.push({ path: '/serve', body });
    if (opts.refuse) {
      return route.fulfill({ status: 409, json: { error: opts.refuse, code: 'over_served' } });
    }
    served += body.items[0].quantity;
    return route.fulfill({
      json: { replay: false, events: [{ id: 501, bill_item_id: 21, quantity: body.items[0].quantity, served_at: new Date().toISOString() }], lines: [], rounds: [] },
    });
  });
  await page.route('**/api/pos/serving/undo', async (route) => {
    sent.push({ path: '/undo', body: route.request().postDataJSON() });
    served = 0;
    return route.fulfill({ json: { undone: [501], lines: [], rounds: [] } });
  });
  return sent;
}

test('a plate goes out: «Несете на стіл 5?», «Несу», then «Повернути»', async ({ page }) => {
  await signIn(page, { tables: TABLES_REMOTE, pass: PASS_REMOTE });
  const sent = await mockServing(page);

  await page.goto('/pass');
  await expect(page.getByTestId('pass-chip-all')).toContainText('3');
  await expect(page.getByTestId('pass-chip-90')).toContainText('Стіл 5');
  await expect(page.getByTestId('pass-round-state-7')).toContainText('готово');
  await expect(page.getByTestId('pass-dish-22')).toContainText('без цукру');

  await page.getByTestId('pass-dish-21').click();
  await expect(page.getByTestId('carry-sheet')).toContainText('Несете на стіл 5?');
  await expect(page.getByTestId('carry-qty-2')).toContainText('Усі 2');
  await page.getByTestId('carry-yes').click();

  await expect(page.getByTestId('pass-dish-21')).toHaveCount(0);
  await expect(page.getByTestId('pass-toast')).toContainText('Борщ ×2 винесено');
  expect(sent[0].body).toMatchObject({ items: [{ bill_item_id: 21, quantity: 2 }], client_uuid: expect.any(String) });

  await page.getByTestId('pass-toast-undo').click();
  await expect.poll(() => sent.filter((s) => s.path === '/undo').length).toBe(1);
  expect(sent.find((s) => s.path === '/undo')?.body).toEqual({ event_ids: [501] });
  await expect(page.getByTestId('pass-dish-21')).toBeVisible();
});

test('the server’s refusal is read out, and the plate stays on the list', async ({ page }) => {
  await signIn(page, { tables: TABLES_REMOTE, pass: PASS_REMOTE });
  await mockServing(page, { refuse: '«Борщ» уже винесено — Петро о 19:42' });

  await page.goto('/pass');
  await page.getByTestId('pass-dish-21').click();
  await page.getByTestId('carry-yes').click();
  await expect(page.getByTestId('pass-banner')).toContainText('«Борщ» уже винесено — Петро о 19:42');
  await expect(page.getByTestId('pass-dish-21')).toBeVisible();
});

test('a store without «Столи» is told so', async ({ page }) => {
  await signIn(page, { pass: PASS_REMOTE });
  await mockServing(page);
  await page.goto('/pass');
  await expect(page.getByTestId('pass-needs-tables')).toContainText('Потрібен модуль «Столи»');
});
