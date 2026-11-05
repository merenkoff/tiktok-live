import { expect, test } from '@playwright/test';
import { loginAsOwner, mockPosApi } from './helpers';

/**
 * «Пляшки» — the bar's open bottles (track ДК, ДК5, TechDocs/POS_DUAL_REGISTER.md
 * §4.4). The entry appears only where the login says something is poured
 * from a stamped bottle; the table waiting for a stamp comes first, and a
 * scan opens its bottle.
 */

const NOW = new Date().toISOString();
const STATE = {
  open: [
    { id: 5, variant_id: 7, product_name: 'Горілка «Хлібний дар» · 500 мл', label: 'ANFC015604', capacity_ml: 500, poured_ml: 350, opened_at: NOW },
  ],
  waiting: [{ variant_id: 9, product_name: 'Коньяк Шустов · 500 мл', ml: 40, bottle_ml: 500, tables: ['Стіл 3'] }],
  closed: [
    {
      id: 4, variant_id: 7, product_name: 'Горілка «Хлібний дар» · 500 мл', label: 'AICY275034', capacity_ml: 500,
      poured_ml: 500, opened_at: NOW, closed_at: NOW, close_reason: 'empty', discrepancy_ml: null, note: null,
    },
  ],
  drinks: [
    { variant_id: 7, product_name: 'Горілка «Хлібний дар» · 500 мл', bottle_ml: 500 },
    { variant_id: 9, product_name: 'Коньяк Шустов · 500 мл', bottle_ml: 500 },
    { variant_id: 11, product_name: 'Лікер кавовий · 700 мл', bottle_ml: 700 },
  ],
};

test('the bar sees the table waiting for a stamp and opens its bottle by a scan', async ({ page }) => {
  const opened: unknown[] = [];
  await mockPosApi(page, undefined, { store: { bottles: true } });
  await page.route('**/api/pos/bottles**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === 'POST' && pathname.endsWith('/bottles/open')) {
      opened.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { ...STATE, waiting: [], bottle_id: 6, replayed: false } });
      return;
    }
    await route.fulfill({ json: STATE });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByRole('link', { name: 'Пляшки' }).first().click();
  await expect(page.getByTestId('bottles-page')).toBeVisible();
  await expect(page.getByTestId('bottles-waiting-9')).toContainText('Стіл 3');
  await expect(page.getByTestId('bottle-5')).toContainText('залишилось 150 мл з 500 мл');
  await page.screenshot({ path: process.env.BOTTLES_SHOT ?? 'test-results/bottles.png', fullPage: true });

  await page.getByTestId('bottles-scan-9').click();
  const sheet = page.getByTestId('excise-sheet');
  await sheet.getByTestId('excise-input').fill('AATE508932');
  await sheet.getByRole('button', { name: 'Додати' }).click();
  await sheet.getByTestId('excise-done').click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('bottles-waiting-9')).toHaveCount(0);
  expect(opened).toEqual([{ variant_id: 9, excise_label: 'AATE508932' }]);
});

test('a store that pours from no stamped bottle has no «Пляшки»', async ({ page }) => {
  await mockPosApi(page);
  await loginAsOwner(page);
  await page.goto('/register');
  await expect(page.getByRole('link', { name: 'Замовлення' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Пляшки' })).toHaveCount(0);
});
