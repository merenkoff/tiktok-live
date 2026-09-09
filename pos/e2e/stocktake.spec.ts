import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';

/**
 * The first module with its own offline data (roadmap #12 track 3), end to end
 * in the web shell: the REAL signed `stocktake` bundle (built by the webServer
 * command into `dist-remotes/stocktake`) is served from a fake CDN, the store
 * names it in `module_remotes`, the host imports it, a count sheet is scanned
 * and finished, and the module submits it as one idempotent request.
 *
 * The desktop path (offline queue drained by the shell's sync tick) is covered
 * by the module's unit tests on fake-indexeddb and the manual checklist.
 */

const CDN = 'https://cdn.e2e.test/stocktake';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes/stocktake');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

async function serveBuiltRemote(page: Page) {
  await page.route(`${CDN}/**`, async (route) => {
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

test('a seller counts on the till and the sheet is submitted as one idempotent request', async ({
  page,
}) => {
  await serveBuiltRemote(page);
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: {
      stocktake: {
        url: `${CDN}/remote-entry.js`,
        title: 'Інвентаризація',
        routePath: '/stocktake',
        nav: [{ label: 'Інвентаризація', location: 'cashier-primary', order: 70 }],
        icon: 'ClipboardCheck',
      },
    },
  });

  const submissions: Array<Record<string, unknown>> = [];
  // Registered after mockPosApi, so it wins over the catch-all for this path.
  await page.route('**/api/pos/stock/counts', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    submissions.push(body);
    await route.fulfill({
      status: 201,
      json: {
        id: 77,
        store_id: 1,
        type: 'inventory',
        status: 'draft',
        doc_number: 'ІН-000077',
        client_uuid: body.client_uuid,
        lines: [],
      },
    });
  });

  await loginAsOwner(page);
  // First login only records the store's module list; the module applies on the next boot.
  await page.reload();
  await page.waitForURL(/\/admin$/);

  await page.goto('/stocktake');
  await page.getByRole('button', { name: 'Новий підрахунок' }).click();
  await expect(page).toHaveURL(/\/stocktake\/[0-9a-f-]{36}$/);

  const scan = page.getByLabel('Штрихкод');
  await scan.fill('4820000000001');
  await scan.press('Enter');
  await expect(page.getByText('Футболка базова · M · Синій')).toBeVisible();
  await scan.fill('4820000000001');
  await scan.press('Enter');
  await expect(page.getByLabel('Кількість: Футболка базова · M · Синій')).toHaveValue('2');

  await scan.fill('0000000000000');
  await scan.press('Enter');
  await expect(page.getByText('не знайдено в каталозі')).toBeVisible();

  await page.getByRole('button', { name: 'Завершити і відправити' }).click();
  await expect(page.getByText('Надіслано · ІН-000077')).toBeVisible();

  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    note: null,
    lines: [{ variant_id: 1, counted_qty: 2 }],
  });
  expect(String(submissions[0].client_uuid)).toMatch(/^[0-9a-f-]{36}$/);
});
