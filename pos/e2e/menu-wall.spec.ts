import { expect, test, type Page } from '@playwright/test';

/**
 * `/super/wall` — the office television (TechDocs/POS_MENU_WALL.md): opened
 * with a read-only key, it ranks the places by today's QR-menu opens and
 * draws the floor plan of a place whose tables were scanned. The API is
 * mocked; what is under test is the page and its use of the key.
 */

const KEY = '0123456789abcdef0123456789abcdef';

const table = (id: number, name: string, x: number, y: number, w: number, h: number, today: number, shape: 'rect' | 'round' = 'rect') => ({
  id, name, pos_x: x, pos_y: y, width: w, height: h, shape, today, lastAt: today > 0 ? '2026-11-09T10:00:00Z' : null,
});
const zeros = () => Array.from({ length: 24 }, () => 0);
const snapshot = {
  now: '2026-11-09T12:00:00Z',
  day: '2026-11-09',
  total: 143,
  yesterdaySameTime: 118,
  hourly: zeros(),
  tableToday: 96,
  bestDay: { day: '2026-11-07', count: 171 },
  stores: [
    {
      id: 7, name: 'Шабля', slug: 'shablya', logoUrl: null, today: 86, lastHour: 9, last3h: 31, lastAt: '2026-11-09T11:58:00Z',
      hourly: zeros(), tableToday: 71, tablesScanned: 3, tablesTotal: 4,
      halls: [
        { id: 1, name: 'Головна зала', tables: [table(1, '1', 0, 0, 2, 2, 12), table(2, '2', 3, 0, 2, 2, 7), table(4, '4', 6, 0, 2, 2, 0)] },
        { id: 2, name: 'Тераса', tables: [table(21, '21', 0, 0, 2, 2, 2, 'round')] },
      ],
    },
    { id: 3, name: 'Demo Café', slug: 'demo-cafe', logoUrl: null, today: 19, lastHour: 0, last3h: 2, lastAt: '2026-11-09T09:40:00Z', hourly: zeros(), tableToday: 0, tablesScanned: 0, tablesTotal: 0, halls: null },
    { id: 4, name: 'Demo Restaurant', slug: 'demo-restaurant', logoUrl: null, today: 0, lastHour: 0, last3h: 0, lastAt: null, hourly: zeros(), tableToday: 0, tablesScanned: 0, tablesTotal: 10, halls: null },
  ],
  events: [],
  lastId: 500,
};

async function mockWall(page: Page) {
  const keys: string[] = [];
  await page.route('**/api/pos/super/menu-wall**', async (route) => {
    const url = new URL(route.request().url());
    keys.push(url.searchParams.get('key') ?? '');
    if (url.searchParams.get('key') !== KEY) {
      await route.fulfill({ status: 403, json: { error: 'Invalid wall key' } });
      return;
    }
    await route.fulfill({ json: snapshot });
  });
  return keys;
}

test('the television opens with its key, ranks the places and draws a floor plan', async ({ page }) => {
  const keys = await mockWall(page);
  await page.goto(`/super/wall?key=${KEY}`);
  await page.getByRole('button', { name: 'Почати' }).click();

  await expect(page.getByTestId('wall-total')).toHaveText('143');
  await expect(page.getByText('+25 до вчора на цю пору')).toBeVisible();
  // «Заклади»: the places ranked, the idle one at the bottom, dimmed.
  const rows = page.locator('.mw-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Шабля');
  await expect(rows.nth(0)).toContainText('столів 3 з 4');
  await expect(rows.nth(2)).toContainText('Demo Restaurant');
  await expect(rows.nth(2)).toHaveClass(/mw-row--idle/);
  // Only the place whose tables were scanned gets a tab of its own.
  await expect(page.getByRole('tab')).toHaveCount(2);

  await page.getByRole('tab', { name: 'Шабля' }).click();
  await expect(page.getByTestId('hall-plan')).toBeVisible();
  await expect(page.getByText('Головна зала')).toBeVisible();
  await expect(page.getByText('Тераса')).toBeVisible();
  await expect(page.getByTestId('plan-table-1')).toHaveAttribute('data-today', '12');
  await expect(page.getByTestId('plan-table-1')).toContainText('12');
  await expect(page.getByTestId('plan-table-4')).toHaveClass(/mw-table--idle/);
  await expect(page.getByTestId('plan-table-21')).toHaveClass(/mw-table--round/);
  await expect(page.getByText('без столу 15')).toBeVisible();

  // The key is remembered on the device: the bare address opens the same screen.
  await page.goto('/super/wall');
  await expect(page.getByTestId('wall-total')).toHaveText('143');
  expect(keys.every((k) => k === KEY)).toBe(true);
});

test('a key the server no longer accepts says where to get a new one', async ({ page }) => {
  await mockWall(page);
  await page.goto('/super/wall?key=00000000000000000000000000000000');
  await expect(page.getByText(/Посилання застаріло/)).toBeVisible();
});
