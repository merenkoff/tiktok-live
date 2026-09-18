import { expect, test, type Page } from '@playwright/test';
import { catalog, loginAsOwner, mockPosApi } from './helpers';

/**
 * Orders taken now for a day that has not happened yet
 * (`TechDocs/POS_FLORIST_BENCH.md` §14, phase B6).
 *
 * The till's half of the price lock is mostly about what it does NOT do: it
 * never sends a price, and once a promise is on the screen it stops being an
 * editable cart. Both are easier to break than to notice, so both are pinned.
 */

const DUE = new Date(Date.now() + 3 * 86_400_000).toISOString();

const ORDER = {
  id: 42,
  status: 'assembled' as const,
  staff_id: 1,
  staff_name: 'Олена',
  customer_id: null,
  customer_name: null,
  recipient_name: 'Оксана',
  recipient_phone: '+380671234567',
  fulfilment: 'delivery' as const,
  address: 'вул. Хрещатик, 1, кв. 5',
  due_at: DUE,
  due_window_minutes: null,
  card_message: 'З днем народження!',
  note: null,
  // Promised at 900.00 — the card says 450.00 today, and the till must show
  // the promise.
  quoted_total_cents: 90000,
  sale_id: null,
  created_at: new Date().toISOString(),
  items: [
    {
      id: 1,
      variant_id: catalog[0].variant_id,
      quantity: 2,
      unit_price_cents: 45000,
      components: null,
      product_name: catalog[0].product_name,
      label: catalog[0].label,
      unit: catalog[0].unit,
      image_url: null,
      // Stems went up since the quote — which is the whole point of the lock.
      current_unit_price_cents: 55000,
    },
  ],
  current_total_cents: 110000,
};

async function withOrders(page: Page, orders = [ORDER]) {
  const calls: Array<{ path: string; body: unknown }> = [];
  await page.route('**/api/pos/preorders**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.replace(/^.*\/api\/pos/, '');
    calls.push({ path, body: route.request().postDataJSON() });
    if (route.request().method() === 'POST' && path === '/preorders') {
      await route.fulfill({ status: 201, json: ORDER });
      return;
    }
    if (path.endsWith('/assembled')) {
      await route.fulfill({ json: { ...ORDER, status: 'assembled' } });
      return;
    }
    if (path.endsWith('/cancel')) {
      await route.fulfill({ json: { cancelled: true } });
      return;
    }
    await route.fulfill({ json: { preorders: orders } });
  });
  return calls;
}

test('the morning list reads as promises, not as a table', async ({ page }) => {
  await mockPosApi(page);
  await withOrders(page);
  await loginAsOwner(page);
  await page.goto('/orders');

  const row = page.getByTestId('preorder-row').first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Оксана');
  await expect(row).toContainText('вул. Хрещатик');
  // The customer's words, set apart because the florist copies them by hand.
  await expect(page.getByTestId('preorder-card-message')).toContainText('З днем народження!');
  // What the promise is, and — only because it differs — what it costs today.
  await expect(row).toContainText('900');
  await expect(page.getByTestId('preorder-drift')).toContainText('зафіксовано');
});

test('handing an order over puts the promised price on the till, not today’s', async ({ page }) => {
  await mockPosApi(page);
  await withOrders(page);
  await loginAsOwner(page);
  await page.goto('/orders');

  await page.getByTestId('preorder-hand-over').first().click();
  await page.waitForURL(/\/register$/);

  // 2 × 450.00 promised. The catalogue card says 450.00 each today, so the
  // number that proves the lock is the line price, not the total: see below.
  await expect(page.getByRole('button', { name: /^Сплатити/ }).first()).toContainText('900');
});

test('a promise on the till is not an editable cart', async ({ page }) => {
  // The rule that keeps the screen and the receipt in agreement: the server
  // rings the order's own lines from its own table, so an edit here would show
  // one thing and print another.
  await mockPosApi(page);
  await withOrders(page);
  await loginAsOwner(page);
  await page.goto('/orders');
  await page.getByTestId('preorder-hand-over').first().click();
  await page.waitForURL(/\/register$/);

  // Tapping the line offers no quantity controls and no delete.
  await page.getByText(catalog[0].product_name).first().click();
  await expect(page.getByRole('button', { name: 'Видалити' })).toHaveCount(0);
  // And the footer offers to put it back rather than to park or discount it.
  await expect(page.getByTestId('preorder-put-back')).toBeVisible();
  await expect(page.getByTestId('park-cart')).toHaveCount(0);
});

test('the sale names the order and never a price', async ({ page }) => {
  await mockPosApi(page);
  await withOrders(page);
  const completed: Array<Record<string, unknown>> = [];
  await page.route('**/api/pos/sales/complete', async (route) => {
    completed.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        id: 7,
        receipt_number: 'ЧК-000007',
        status: 'completed',
        subtotal_cents: 90000,
        total_cents: 90000,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [],
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/orders');
  await page.getByTestId('preorder-hand-over').first().click();
  await page.waitForURL(/\/register$/);

  await page.getByRole('button', { name: /^Сплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: 'Готово' }).click();

  await expect.poll(() => completed.length).toBeGreaterThan(0);
  const body = completed[0];
  expect(body.preorder_id).toBe(42);
  // Every line the till sent carries an id and a count and nothing else. A
  // price on the wire would be the hole §3.5 refuses.
  for (const item of (body.items ?? []) as Array<Record<string, unknown>>) {
    expect(Object.keys(item).sort()).not.toContain('unit_price_cents');
  }
});

test('taking an order asks for the day, and for a delivery asks where', async ({ page }) => {
  await mockPosApi(page);
  const calls = await withOrders(page);
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(catalog[0].product_name).first().click();
  await page.getByRole('button', { name: 'Меню чека' }).first().click();
  await page.getByTestId('take-preorder').click();

  const sheet = page.getByTestId('preorder-sheet');
  await expect(sheet).toBeVisible();
  // Pickup is the default and is ready to submit.
  await expect(sheet.getByTestId('preorder-submit')).toBeEnabled();

  // A delivery with nowhere to deliver to is refused before the request.
  await sheet.getByTestId('preorder-delivery').click();
  await expect(sheet.getByTestId('preorder-submit')).toBeDisabled();
  await expect(sheet.getByTestId('preorder-submit')).toContainText('Вкажіть адресу');

  await sheet.getByTestId('preorder-address').fill('вул. Хрещатик, 1');
  await sheet.getByTestId('preorder-recipient').fill('Оксана');
  await sheet.getByTestId('preorder-card').fill('Вітаю!');
  await sheet.getByTestId('preorder-submit').click();

  await expect(sheet).toBeHidden();
  const taken = calls.find((c) => c.path === '/preorders' && c.body);
  expect(taken).toBeTruthy();
  const body = taken!.body as Record<string, unknown>;
  expect(body.fulfilment).toBe('delivery');
  expect(body.card_message).toBe('Вітаю!');
  // The till quotes nothing: the server prices the order and locks it.
  expect(body).not.toHaveProperty('quoted_total_cents');
});
