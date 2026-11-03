import { expect, test } from '@playwright/test';
import { catalog, loginAsOwner, mockPosApi } from './helpers';

test('the till renders the catalog it is served', async ({ page }) => {
  await mockPosApi(page);
  await loginAsOwner(page);

  await page.goto('/register');

  for (const item of catalog) {
    await expect(page.getByText(item.product_name).first()).toBeVisible();
  }
});

test('a ПРРО outage is readable on top of the payment screen, and the cart survives', async ({
  page,
}) => {
  // The regression this guards: the payment modal is an opaque full-screen
  // overlay, and the checkout error used to be written to a banner *behind* it
  // — so a cashier saw the button label change and nothing else. A 503 also
  // means the server wrote nothing at all, which is why retrying is safe and
  // the cart must still be there to retry with.
  await mockPosApi(page);
  await page.route('**/api/pos/sales/complete', async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        error: 'fiscal_unavailable',
        code: 'unavailable',
        message: 'Немає звʼязку з ПРРО — спробуйте ще раз',
        support_code: 'FS-UNAVAILABLE-503',
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(catalog[0].product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();

  const dialogEarly = page.getByRole('dialog', { name: 'Оплата' });
  await dialogEarly.getByRole('button', { name: 'Готівка' }).click();
  await dialogEarly.getByRole('button', { name: /^Прийняти/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Немає звʼязку з ПРРО');
  await expect(dialog.getByRole('alert')).toContainText('FS-UNAVAILABLE-503');
});

test('a long category row scrolls instead of pushing the receipt off the screen', async ({ page }) => {
  // The regression this guards: the catalog column was `1fr`, which never
  // shrinks below its content, so a shop with nine tags in the category row
  // (the clothing demo) pushed the receipt past the right edge on a 1366 px
  // till — «Оплатити» was a sliver at the border.
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockPosApi(page);
  const names = ['Футболки', 'Худі та светри', 'Джинси й штани', 'Сорочки', 'Сукні та спідниці',
    'Верхній одяг', 'Взуття', 'Аксесуари', 'Нижня білизна'];
  await page.route('**/api/pos/tags', async (route) => {
    await route.fulfill({
      json: names.map((name, i) => ({
        id: 100 + i,
        store_id: 1,
        parent_id: null,
        name,
        sort_order: i,
        color: null,
        show_in_catalog_bar: true,
        children: [],
      })),
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Нижня білизна' })).toBeAttached();

  const pay = page.getByRole('button', { name: /^Оплатити/ }).first();
  const box = await pay.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1366);
  const receipt = await page.getByTestId('sale-sidebar').boundingBox();
  expect(receipt!.x + receipt!.width).toBeLessThanOrEqual(1366);
});

// Track ДК (TechDocs/POS_DUAL_REGISTER.md): a cart of two ФОП rings as two
// receipts — the sums from the server's quote, a card through each terminal
// in turn, one request, and the receipts listed with their own ФОП.
test.describe('a cart for two registers', () => {
  const BAR_LINE = { ...catalog[1], fiscal_register: 2 };
  const quote = {
    parts: [
      { register_no: 1, label: null, item_indexes: [0], total_cents: 45000, rounding_cents: 0, due_cents: 45000 },
      { register_no: 2, label: 'Бар', item_indexes: [1], total_cents: 189000, rounding_cents: 0, due_cents: 189000 },
    ],
    due_cents: 234000,
  };
  const saleOf = (id: number, register: number, item: (typeof catalog)[number], method: string) => ({
    id,
    receipt_number: `R-${id}`,
    fiscal_register: register,
    status: 'completed',
    subtotal_cents: item.price_cents,
    total_cents: item.price_cents,
    rounding_cents: 0,
    cart_discount_cents: 0,
    created_at: '2026-11-03T18:00:00.000Z',
    staff_name: 'Олена',
    customer_name: null,
    items: [
      {
        id: id * 10,
        variant_id: item.variant_id,
        product_name: item.product_name,
        variant_label: item.label,
        quantity: 1,
        unit_price_cents: item.price_cents,
        line_total_cents: item.price_cents,
        refunded_quantity: 0,
      },
    ],
    payments: [{ id: id, method, amount_cents: item.price_cents }],
    refunds: [],
    fiscal: null,
  });

  async function setUp(page: import('@playwright/test').Page) {
    await mockPosApi(page, undefined, {
      store: {
        fiscal: {
          enabled: true,
          provider: 'cashalot',
          registers: [
            { register_no: 2, label: 'Бар', register_fiscal_number: '4000000099', default_tax_code: null, requisites: null },
          ],
        },
      },
    });
    await page.route('**/api/pos/catalog**', (route) => route.fulfill({ json: [catalog[0], BAR_LINE] }));
    await page.route('**/api/pos/sales/split-quote', (route) => route.fulfill({ json: quote }));
    await loginAsOwner(page);
    await page.goto('/register');
    await page.getByText(catalog[0].product_name).first().click();
    await page.getByText(BAR_LINE.product_name).first().click();
    await page.getByRole('button', { name: /^Оплатити/ }).first().click();
    return page.getByRole('dialog', { name: 'Оплата' });
  }

  test('a card goes through each terminal, then one request makes two receipts', async ({ page }) => {
    const sent: Array<Record<string, unknown>> = [];
    const dialog = await setUp(page);
    await page.route('**/api/pos/sales/complete', async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({
        status: 201,
        json: {
          split: true,
          warning: null,
          parts: [
            { register_no: 1, sale: saleOf(101, 1, catalog[0], 'card') },
            { register_no: 2, sale: saleOf(102, 2, catalog[1], 'card') },
          ],
        },
      });
    });

    await dialog.getByRole('button', { name: 'Картка' }).click();
    await expect(dialog.getByTestId('checkout-split-2')).toContainText('Каса 2 · Бар · 1');
    await dialog.getByTestId('checkout-terminal-done').click();
    expect(sent).toHaveLength(0);
    await expect(dialog.getByTestId('checkout-terminal-done')).toContainText('«Каса 2 · Бар»');
    await dialog.getByTestId('checkout-terminal-done').click();

    await expect(page.getByTestId('sale-split-receipts')).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      split_registers: true,
      payments: [{ method: 'card', amount_cents: 234000 }],
    });
    await expect(page.getByTestId('sale-split-1')).toContainText('R-101');
    await expect(page.getByTestId('sale-split-2')).toContainText('Каса 2 · Бар');
    await expect(page.getByTestId('sale-split-2')).toContainText('R-102');
  });

  test('when the bar receipt fails, the food receipt stands and only the alcohol stays in the cart', async ({
    page,
  }) => {
    const dialog = await setUp(page);
    await page.route('**/api/pos/sales/complete', (route) =>
      route.fulfill({
        status: 502,
        json: {
          error: 'split_part_failed',
          stage: 'document',
          code: 'rejected',
          message: 'ПРРО відхилило чек. Чек каси 2 не пробито — поверніть гостю 1 890,00 ₴.',
          support_code: 'FS-REJECTED',
          register_no: 2,
          sale_id: 102,
          sale_voided: true,
          parts: [{ register_no: 1, sale: saleOf(101, 1, catalog[0], 'cash') }],
          sale_ids: [101],
          not_taken_cents: 189000,
          not_taken_items: [1],
        },
      })
    );

    await dialog.getByRole('button', { name: 'Готівка' }).click();
    await expect(dialog.getByTestId('checkout-split-1')).toBeVisible();
    await dialog.getByTestId('checkout-cash-submit').click();

    await expect(page.getByTestId('sale-split-notice')).toContainText('поверніть гостю 1 890,00 ₴');
    await expect(page.getByTestId('sale-success')).toContainText('R-101');
    await page.getByRole('button', { name: 'Новий продаж' }).click();
    await expect(page.getByText(BAR_LINE.product_name).last()).toBeVisible();
    // Only the alcohol is left to pay: the food receipt took its line.
    await expect(page.getByRole('button', { name: /^Оплатити 1 890,00/ }).first()).toBeVisible();
  });
});
