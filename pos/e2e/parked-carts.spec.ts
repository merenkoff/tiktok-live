import { expect, test, type Page } from '@playwright/test';
import { catalog, loginAsOwner, mockPosApi } from './helpers';

/**
 * Putting a cart aside at one till and picking it up at another
 * (`TechDocs/POS_FLORIST_BENCH.md` §9, phase B4).
 *
 * The server holds the stock behind a parked cart, so what is worth testing
 * here is the till's half: that the button is reachable on an empty cart (the
 * state a cashier picking one up is actually in), that parking clears the
 * screen, and that picking one up puts back exactly what was parked — a
 * bouquet included, whose price is the assembled one and not the card's.
 */

const WAITING = {
  id: 77,
  label: 'Оксана, троянди',
  note: 'Забере після 17:00',
  status: 'open' as const,
  staff_id: 1,
  staff_name: 'Олена',
  customer_id: null,
  customer_name: null,
  cart_discount: null,
  expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  items: [
    {
      id: 1,
      variant_id: catalog[0].variant_id,
      quantity: 2,
      components: null,
      product_name: catalog[0].product_name,
      label: catalog[0].label,
      unit: catalog[0].unit,
      price_cents: catalog[0].price_cents,
      line_price_cents: catalog[0].price_cents,
      image_url: null,
    },
  ],
  total_cents: catalog[0].price_cents * 2,
};

/** Serve one waiting cart, and record what the till asks of the server. */
async function withWaitingCart(page: Page, cart = WAITING) {
  const calls: string[] = [];
  await page.route('**/api/pos/parked-carts**', async (route) => {
    const { pathname } = new URL(route.request().url());
    calls.push(`${route.request().method()} ${pathname.replace(/^.*\/api\/pos/, '')}`);
    if (pathname.endsWith('/pick-up')) {
      await route.fulfill({ json: { ...cart, status: 'picked' } });
      return;
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: cart });
      return;
    }
    await route.fulfill({ json: { carts: [cart] } });
  });
  return calls;
}

test('an empty cart offers what is waiting instead of a dead button', async ({ page }) => {
  // The regression this guards: the button used to read «Зберегти кошик» and
  // sit disabled on an empty cart — which is the exact state a cashier is in
  // when they walk up to take someone else's bouquet.
  await mockPosApi(page);
  await withWaitingCart(page);
  await loginAsOwner(page);
  await page.goto('/register');

  const open = page.getByTestId('open-parked').first();
  await expect(open).toBeEnabled();
  await expect(open).toContainText('Відкладені');
  // The badge is the whole reason it is loaded on mount: a cashier has to be
  // able to SEE there is a bouquet waiting without knowing to look.
  await expect(open).toContainText('1');
});

test('picking a cart up puts it back on the screen', async ({ page }) => {
  await mockPosApi(page);
  const calls = await withWaitingCart(page);
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByTestId('open-parked').first().click();
  const sheet = page.getByTestId('parked-carts-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Оксана, троянди')).toBeVisible();
  await expect(sheet.getByText(/Олена/)).toBeVisible();
  await expect(sheet.getByText(/ще \d+ год/)).toBeVisible();

  await sheet.getByTestId('parked-pick-up').first().click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText(catalog[0].product_name).first()).toBeVisible();
  expect(calls).toContain('POST /parked-carts/77/pick-up');
  // Two of them at 450 each, exactly as parked.
  await expect(page.getByRole('button', { name: /^Сплатити/ }).first()).toContainText('900');
});

test('a cart with something in it parks under a name', async ({ page }) => {
  await mockPosApi(page);
  const calls = await withWaitingCart(page);
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByText(catalog[0].product_name).first().click();
  await page.getByTestId('park-cart').first().click();

  const sheet = page.getByTestId('park-cart-sheet');
  await expect(sheet).toBeVisible();
  // Nothing is parked nameless: the other till reads this list out loud.
  await expect(sheet.getByTestId('park-submit')).toBeDisabled();

  await sheet.getByTestId('park-label').fill('Ірина');
  await expect(sheet.getByTestId('park-submit')).toBeEnabled();
  await sheet.getByTestId('park-submit').click();

  await expect(sheet).toBeHidden();
  expect(calls).toContain('POST /parked-carts');
  // The screen is clear and back to offering what is waiting.
  await expect(page.getByTestId('open-parked').first()).toBeVisible();
});

test('putting a cart back asks first', async ({ page }) => {
  // Nothing is lost, but the bouquet is un-promised and its flowers go back on
  // the shelf — a mis-tap on a crowded counter should not do that silently.
  await mockPosApi(page);
  await withWaitingCart(page);
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByTestId('open-parked').first().click();
  const sheet = page.getByTestId('parked-carts-sheet');
  await sheet.getByTestId('parked-release').first().click();

  await expect(sheet.getByTestId('parked-release-confirm')).toBeVisible();
  await sheet.getByTestId('parked-release-confirm').click();
  await expect(sheet.getByTestId('parked-cart-row')).toHaveCount(0);
});

test('a cart the other till already took says so', async ({ page }) => {
  await mockPosApi(page);
  await page.route('**/api/pos/parked-carts**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/pick-up')) {
      await route.fulfill({ status: 409, json: { error: 'Кошик уже забрали' } });
      return;
    }
    await route.fulfill({ json: { carts: [WAITING] } });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByTestId('open-parked').first().click();
  await page.getByTestId('parked-pick-up').first().click();

  await expect(page.getByTestId('parked-error')).toContainText('забрали');
});

test('a parked bouquet comes back at its assembled price', async ({ page }) => {
  // The rule the bench rests on: the price never lies. A bouquet's line is
  // priced from its stems plus the shop's assembly charge, which has nothing
  // to do with the catalogue card it was rung on — so the card's price must
  // not be what comes back.
  const bouquetCard = catalog[0];
  await mockPosApi(page);
  await withWaitingCart(page, {
    ...WAITING,
    items: [
      {
        ...WAITING.items[0],
        variant_id: bouquetCard.variant_id,
        quantity: 1,
        price_cents: 120000,
        line_price_cents: 181875,
        components: [
          {
            component_variant_id: 999,
            quantity: 9,
            product_name: 'Троянда',
            label: 'Червона',
            unit: 'шт',
            unit_price_cents: 9000,
          },
        ],
      },
    ],
    total_cents: 181875,
  } as typeof WAITING);
  await loginAsOwner(page);
  await page.goto('/register');

  await page.getByTestId('open-parked').first().click();
  await page.getByTestId('parked-pick-up').first().click();

  await expect(page.getByRole('button', { name: /^Сплатити/ }).first()).toContainText('1818,75');
});
