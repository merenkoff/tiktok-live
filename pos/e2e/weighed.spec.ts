import { expect, test } from '@playwright/test';
import { catalog, loginAsOwner, mockPosApi } from './helpers';

// Weighed goods at the till (TechDocs/grocery/G4_WEIGHED.md): a variant priced
// per kilogram is rung through the weight pad, reads «0,350 кг × 189,90 ₴/кг»
// in the cart at the server's own sum, and goes to checkout with its grams and
// how they were weighed. No vertical weighs yet (groceries come in PR4), so
// the fallback catalog is what rings it here — which is also the case it has
// to survive: a grocery store whose own catalog module failed.

const cheese = {
  variant_id: 3,
  product_id: 3,
  product_name: 'Сир твердий',
  attributes: {},
  label: 'Гауда',
  unit: 'г',
  sku: null,
  barcode: '2900000000032',
  price_cents: 18990,
  price_per: 1000,
  quantity: 0,
  image_url: null,
  tag_ids: [],
};

test('a weighing goes from the pad into the cart and to checkout with its grams', async ({ page }) => {
  await mockPosApi(page);
  await page.route('**/api/pos/catalog**', async (route) => {
    await route.fulfill({ json: [...catalog, cheese] });
  });
  let sent: { items?: unknown[]; payments?: unknown[] } | null = null;
  await page.route('**/api/pos/sales/complete', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: 41,
        receipt_number: 'ЧК-000041',
        status: 'completed',
        subtotal_cents: 6647,
        total_cents: 6647,
        cart_discount_cents: 0,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [
          {
            id: 1,
            variant_id: 3,
            product_name: 'Сир твердий',
            variant_label: 'Гауда',
            unit: 'г',
            quantity: 350,
            unit_price_cents: 18990,
            line_total_cents: 6647,
            refunded_quantity: 0,
            price_per: 1000,
            weight_source: 'manual',
          },
        ],
        payments: [{ id: 1, method: 'cash', amount_cents: 10000 }],
        refunds: [],
      },
    });
  });
  await loginAsOwner(page);
  await page.goto('/register');

  // The tile names what its price is for and stays sellable with nothing on the books.
  const tile = page.getByRole('button', { name: /Сир твердий/ });
  await expect(tile).toContainText('189,90 ₴/кг');
  await expect(tile).toBeEnabled();
  await tile.click();

  const pad = page.getByTestId('weight-pad');
  await expect(pad).toBeVisible();
  for (const key of ['0', 'comma', '3', '5']) await pad.getByTestId(`weight-pad-key-${key}`).click();
  await expect(pad.getByTestId('weight-pad-sum')).toContainText('66,47 ₴');
  await pad.getByTestId('weight-pad-confirm').click();
  await expect(pad).toBeHidden();

  const receipt = page.getByTestId('sale-sidebar');
  await expect(receipt.getByText('Гауда · 0,350 кг × 189,90 ₴/кг')).toBeVisible();
  await expect(receipt.getByTestId('cart-line-manual')).toHaveText('вагу введено вручну');

  await page.getByRole('button', { name: 'Оплатити 66,47 ₴' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();

  await expect.poll(() => sent).not.toBeNull();
  expect(sent!.items).toEqual([{ variant_id: 3, quantity: 350, weight_source: 'manual' }]);
});
