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

// Track ДК, ДК4 (TechDocs/POS_DUAL_REGISTER.md §4.3, Д4): a bottle sold whole
// goes out only with its excise stamp — «Оплатити» asks for it first, and the
// sale carries it.
test('a bottle sold whole asks for its stamp before payment, and the sale carries it', async ({ page }) => {
  const BOTTLE = { ...catalog[0], product_name: 'Горілка 0,5 л', fiscal_excise: true, excise_per_unit: true };
  const sent: Array<Record<string, unknown>> = [];
  await mockPosApi(page);
  await page.route('**/api/pos/catalog**', (route) => route.fulfill({ json: [BOTTLE, catalog[1]] }));
  await page.route('**/api/pos/sales/complete', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        id: 301,
        receipt_number: 'R-301',
        status: 'completed',
        subtotal_cents: BOTTLE.price_cents,
        total_cents: BOTTLE.price_cents,
        rounding_cents: 0,
        cart_discount_cents: 0,
        created_at: '2026-11-03T20:00:00.000Z',
        staff_name: 'Олена',
        items: [],
        payments: [{ id: 1, method: 'card', amount_cents: BOTTLE.price_cents }],
        refunds: [],
        fiscal: null,
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(BOTTLE.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();

  const sheet = page.getByTestId('excise-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('excise-current')).toContainText('Скануйте марку 1 з 1');
  await expect(sheet.getByTestId('excise-done')).toBeDisabled();
  await sheet.getByTestId('excise-input').fill('aate508932 0000412168');
  await sheet.getByRole('button', { name: 'Додати' }).click();
  await expect(sheet.getByText('Усі марки відскановано')).toBeVisible();
  await sheet.getByTestId('excise-done').click();

  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Картка' }).click();
  await dialog.getByRole('button', { name: /Оплата карткою пройшла/ }).click();
  await expect(page.getByTestId('sale-success')).toBeVisible();
  expect((sent[0].items as Array<Record<string, unknown>>)[0]).toMatchObject({
    excise_labels: ['AATE508932 0000412168'],
  });
});

// Track ДК, ДК5 (TechDocs/POS_DUAL_REGISTER.md §4.4, Д4): a pour that would
// open a bottle the till sent no stamp for is refused with the bottle named;
// the till asks for the new bottle's stamp on the same sheet and pays again
// with `open_bottles`.
test('a pour that opens a new bottle asks for its stamp, then pays with it', async ({ page }) => {
  const SHOT = { ...catalog[0], product_name: 'Горілка 50', fiscal_excise: false };
  const sent: Array<Record<string, unknown>> = [];
  await mockPosApi(page);
  await page.route('**/api/pos/catalog**', (route) => route.fulfill({ json: [SHOT, catalog[1]] }));
  await page.route('**/api/pos/sales/complete', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    if (!body.open_bottles) {
      await route.fulfill({
        status: 409,
        json: {
          error: 'bottle_needed',
          message: 'Відкрийте нову пляшку: «Горілка Хортиця · 500 мл» — скануйте її акцизну марку',
          bottles: [{ variant_id: 77, product_name: 'Горілка Хортиця · 500 мл', count: 1 }],
        },
      });
      return;
    }
    await route.fulfill({
      status: 201,
      json: {
        id: 302,
        receipt_number: 'R-302',
        status: 'completed',
        subtotal_cents: SHOT.price_cents,
        total_cents: SHOT.price_cents,
        rounding_cents: 0,
        cart_discount_cents: 0,
        created_at: '2026-11-05T20:00:00.000Z',
        staff_name: 'Олена',
        items: [],
        payments: [{ id: 1, method: 'card', amount_cents: SHOT.price_cents }],
        refunds: [],
        fiscal: null,
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(SHOT.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  let dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Картка' }).click();
  await dialog.getByRole('button', { name: /Оплата карткою пройшла/ }).click();

  const sheet = page.getByTestId('excise-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('excise-error')).toContainText('Відкрийте нову пляшку');
  await expect(sheet.getByTestId('excise-current')).toContainText('Нова пляшка: Горілка Хортиця · 500 мл');
  await sheet.getByTestId('excise-input').fill('ANFC015604');
  await sheet.getByRole('button', { name: 'Додати' }).click();
  await sheet.getByTestId('excise-done').click();

  dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Картка' }).click();
  await dialog.getByRole('button', { name: /Оплата карткою пройшла/ }).click();
  await expect(page.getByTestId('sale-success')).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1].open_bottles).toEqual([{ variant_id: 77, excise_label: 'ANFC015604' }]);
  // The stamp belongs to the bottle, not to the line.
  expect((sent[1].items as Array<Record<string, unknown>>)[0].excise_labels).toBeUndefined();
});

// The same, asked BEFORE the payment screen: in a store that pours from
// stamped bottles the till asks the server first, so the cashier never runs
// a card on the terminal and only then hears «відкрийте нову пляшку».
test('a pour that opens a new bottle asks for its stamp before the payment screen', async ({ page }) => {
  const SHOT = { ...catalog[0], product_name: 'Горілка 50' };
  const checks: Array<Record<string, unknown>> = [];
  const sales: Array<Record<string, unknown>> = [];
  await mockPosApi(page, undefined, { store: { bottles: true } });
  await page.route('**/api/pos/catalog**', (route) => route.fulfill({ json: [SHOT, catalog[1]] }));
  await page.route('**/api/pos/bottles/check', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    checks.push(body);
    await route.fulfill({
      json: {
        bottles: body.open_bottles ? [] : [{ variant_id: 77, product_name: 'Горілка Хортиця · 500 мл', count: 1 }],
      },
    });
  });
  await page.route('**/api/pos/sales/complete', async (route) => {
    sales.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        id: 303,
        receipt_number: 'R-303',
        status: 'completed',
        subtotal_cents: SHOT.price_cents,
        total_cents: SHOT.price_cents,
        rounding_cents: 0,
        cart_discount_cents: 0,
        created_at: '2026-11-06T20:00:00.000Z',
        staff_name: 'Олена',
        items: [],
        payments: [{ id: 1, method: 'card', amount_cents: SHOT.price_cents }],
        refunds: [],
        fiscal: null,
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(SHOT.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();

  // The stamps first — no payment screen, no card on the terminal yet.
  const sheet = page.getByTestId('excise-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Оплата' })).toHaveCount(0);
  await expect(sheet.getByTestId('excise-error')).toContainText('Відкрийте нову пляшку');
  await sheet.getByTestId('excise-input').fill('ANFC015604');
  await sheet.getByRole('button', { name: 'Додати' }).click();
  await sheet.getByTestId('excise-done').click();

  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Картка' }).click();
  await dialog.getByRole('button', { name: /Оплата карткою пройшла/ }).click();
  await expect(page.getByTestId('sale-success')).toBeVisible();
  expect(sales).toHaveLength(1);
  expect(sales[0].open_bottles).toEqual([{ variant_id: 77, excise_label: 'ANFC015604' }]);
  expect(checks[1].open_bottles).toEqual([{ variant_id: 77, excise_label: 'ANFC015604' }]);
});

test('on a phone the receipt is a QR to scan and a share sheet, not paper', async ({ page }) => {
  // TechDocs/POS_PHONE_TILL.md, Т1: a phone has no thermal printer, so the
  // success screen shows the tax office's QR large enough to scan off the
  // seller's screen and hands the receipt over through the share sheet.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const shared: unknown[] = [];
    (window as unknown as { __shared: unknown[] }).__shared = shared;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: unknown) => {
        shared.push(data);
      },
    });
  });
  await mockPosApi(page);
  const taxUrl = 'https://cabinet.tax.gov.ua/cashregs/check?id=TEST-77&fn=4000123456';
  await page.route('**/api/pos/sales/complete', async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        id: 7,
        receipt_number: 'R-00007',
        status: 'completed',
        subtotal_cents: catalog[0].price_cents,
        total_cents: catalog[0].price_cents,
        cart_discount_cents: 0,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [
          {
            id: 1,
            variant_id: catalog[0].variant_id,
            product_name: catalog[0].product_name,
            variant_label: catalog[0].label,
            unit: 'шт',
            quantity: 1,
            unit_price_cents: catalog[0].price_cents,
            line_total_cents: catalog[0].price_cents,
            refunded_quantity: 0,
          },
        ],
        payments: [{ id: 1, method: 'cash', amount_cents: catalog[0].price_cents }],
        refunds: [],
        fiscal_status: 'done',
        fiscal: {
          status: 'done',
          mode: 'online',
          fiscal_code: 'TEST-77',
          fiscal_date: '2026-11-12T09:05:00.000Z',
          control_number: null,
          tax_url: taxUrl,
          qr_payload: null,
          receipt_text: null,
          error_code: null,
          error_message: null,
        },
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(catalog[0].product_name).first().click();
  // A phone shows the cart as a bar whose «Сплатити» opens the payment straight away.
  await page.getByRole('button', { name: 'Сплатити' }).click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();

  const panel = page.getByTestId('receipt-share');
  const qr = panel.getByRole('img', { name: 'QR-код фіскального чека' });
  await expect(qr).toBeVisible();
  // Large enough to scan off the screen: most of a phone's width.
  expect((await qr.boundingBox())!.width).toBeGreaterThanOrEqual(280);

  await panel.getByRole('button', { name: /Лише посилання/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))
    .toEqual([{ title: 'Чек R-00007', text: expect.stringContaining(`Перевірити в Податковій: ${taxUrl}`) }]);
});
