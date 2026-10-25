import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, catalog, loginAsOwner, mockPosApi } from './helpers';

/**
 * «Під запис» end to end in the web shell (phase Г3, PR2): the REAL signed
 * `debts` bundle served from a fake CDN, a store that names it in
 * `module_remotes`, and one customer's tab —
 *
 *   кошик → покупець з лімітом → «Під запис» → «Борги» → виписка → оплата
 *
 * What it holds: the module's slots light up inside the host (the button
 * beside «Оплатити», the strip under the customer, the tiles on «Сьогодні»), a
 * finished handover empties the cart through the host's `onCompleted`, a
 * repayment names its lines one by one, and with the CDN down the till sells
 * exactly as it did before the notebook existed.
 */

const CDN = 'https://cdn.e2e.test/debts';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes/debts');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const DEBTS_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Борги',
  routePath: '/debts',
  icon: 'Wallet',
  nav: [{ label: 'Борги', location: 'cashier-primary', order: 55, icon: 'Wallet', match: '/debts' }],
};

const CUSTOMER = {
  id: 7,
  store_id: 1,
  name: 'Оксана',
  phone: '+380671234567',
  email: null,
  children_birthdays: [],
  discount_percent: 0,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

const LIMIT = 300000;
// The first catalogue item, «Футболка базова» at 450 ₴.
const SHIRT = catalog[0];

function credit(balance: number) {
  return {
    customer_id: 7,
    limit_cents: LIMIT,
    locked: false,
    balance_cents: balance,
    available_cents: LIMIT - balance,
    set_at: '2026-10-20T10:00:00.000Z',
    set_by_name: 'Олена',
  };
}

/** `partial`: a backend with 078, whose lines say how much of them is paid. */
function owedLine(partial = false, prepaid = 0) {
  return {
    ...(partial ? { paid_quantity: 0, prepaid_cents: prepaid } : {}),
    id: 1,
    entry_id: 1,
    created_at: '2026-10-24T09:00:00.000Z',
    product_name: SHIRT.product_name,
    variant_label: SHIRT.label,
    unit: 'шт',
    quantity: 1,
    returned_quantity: 0,
    remaining_quantity: 1,
    unit_price_cents: SHIRT.price_cents,
    line_discount_cents: 0,
    line_total_cents: SHIRT.price_cents,
    owed_cents: SHIRT.price_cents - prepaid,
    status: 'open',
    sale_id: null,
    receipt_number: null,
    note: '',
  };
}

function entry(id: number, kind: string, amount: number) {
  return {
    id,
    kind,
    amount_cents: amount,
    created_at: '2026-10-24T09:00:00.000Z',
    staff_name: 'Олена',
    reason: null,
    sale_id: kind === 'payment' ? 55 : null,
    receipt_number: kind === 'payment' ? 'R-0000055' : null,
  };
}

/**
 * The tab as a tiny state machine over the debts endpoints.
 *
 * Registered AFTER `mockPosApi`: Playwright matches routes in reverse
 * registration order, so its catch-all would otherwise answer every one of
 * these with an empty array.
 */
async function mockDebts(page: Page, { balance = 0, partial = false } = {}) {
  const sent: Array<{ path: string; body: unknown }> = [];
  let owed = balance;
  let prepaid = 0;
  const entries: ReturnType<typeof entry>[] = balance > 0 ? [entry(1, 'issue', balance)] : [];

  const statement = () => ({
    customer: { id: 7, name: CUSTOMER.name, phone: CUSTOMER.phone },
    credit: credit(owed),
    open_lines: owed > 0 ? [owedLine(partial, prepaid)] : [],
    entries: [...entries].reverse(),
    oldest_open_at: owed > 0 ? '2026-10-24T09:00:00.000Z' : null,
  });

  await page.route(/\/api\/pos\/customers(\?.*)?$/, async (route) => route.fulfill({ json: [CUSTOMER] }));
  await page.route('**/api/pos/debts/customers/7/balance', async (route) => route.fulfill({ json: credit(owed) }));
  await page.route('**/api/pos/debts/customers/7', async (route) => route.fulfill({ json: statement() }));
  await page.route(/\/api\/pos\/debts(\?.*)?$/, async (route) =>
    route.fulfill({
      json: {
        debtors:
          owed > 0
            ? [
                {
                  customer_id: 7,
                  name: CUSTOMER.name,
                  phone: CUSTOMER.phone,
                  balance_cents: owed,
                  limit_cents: LIMIT,
                  locked: false,
                  open_lines: 1,
                  oldest_open_at: '2026-10-24T09:00:00.000Z',
                },
              ]
            : [],
      },
    })
  );
  await page.route(/\/api\/pos\/debts\/summary(\?.*)?$/, async (route) =>
    route.fulfill({
      json: {
        from: '2026-10-24',
        to: '2026-10-24',
        issued_cents: SHIRT.price_cents,
        repaid_cents: 0,
        returned_cents: 0,
        written_off_cents: 0,
        balance_end_cents: SHIRT.price_cents,
        debtors_end: 1,
      },
    })
  );
  await page.route('**/api/pos/debts/issue', async (route) => {
    sent.push({ path: '/debts/issue', body: route.request().postDataJSON() });
    owed += SHIRT.price_cents;
    entries.push(entry(entries.length + 1, 'issue', SHIRT.price_cents));
    await route.fulfill({
      status: 201,
      json: { entry: entries[entries.length - 1], lines: [owedLine()], credit: credit(owed), open_lines: [owedLine()], replay: false },
    });
  });
  await page.route('**/api/pos/debts/customers/7/pay', async (route) => {
    const body = route.request().postDataJSON();
    sent.push({ path: '/pay', body });
    // Only a «внесок» (078): money toward the line, no receipt, the line still owed.
    if (body.part?.amount_cents && body.payments.length === 0) {
      prepaid += body.part.amount_cents;
      owed -= body.part.amount_cents;
      entries.push({
        ...entry(entries.length + 1, 'payment', -body.part.amount_cents),
        sale_id: 56,
        receipt_number: 'R-0000056',
        prepayment: true,
        prepay_line_id: 1,
      } as ReturnType<typeof entry>);
      const sale = {
        id: 56,
        receipt_number: 'R-0000056',
        status: 'completed',
        subtotal_cents: body.part.amount_cents,
        total_cents: body.part.amount_cents,
        rounding_cents: 0,
        items: [],
        payments: [{ method: 'cash', amount_cents: body.part.amount_cents }],
        refunds: [],
        created_at: new Date().toISOString(),
        staff_name: 'Олена',
        fiscal_status: 'none',
        fiscal: null,
        repays_debt: true,
        debt_prepayment: { line_id: 1, product_name: SHIRT.product_name, variant_label: SHIRT.label, amount_cents: body.part.amount_cents },
      };
      await route.fulfill({
        json: { sale, prepayment: sale, fiscal: null, warning: null, credit: credit(owed), open_lines: [owedLine(true, prepaid)] },
      });
      return;
    }
    owed = 0;
    entries.push(entry(entries.length + 1, 'payment', -SHIRT.price_cents));
    await route.fulfill({
      json: {
        sale: {
          id: 55,
          receipt_number: 'R-0000055',
          status: 'completed',
          subtotal_cents: SHIRT.price_cents,
          total_cents: SHIRT.price_cents,
          rounding_cents: 0,
          items: [],
          payments: [{ method: 'cash', amount_cents: SHIRT.price_cents }],
          refunds: [],
          created_at: new Date().toISOString(),
          staff_name: 'Олена',
          fiscal_status: 'none',
          fiscal: null,
          repays_debt: true,
        },
        fiscal: null,
        warning: null,
        credit: credit(0),
        open_lines: [],
      },
    });
  });
  return sent;
}

async function serveBuiltRemote(page: Page, { down = false } = {}) {
  await page.route(`${CDN}/**`, async (route) => {
    if (down) return route.fulfill({ status: 404, body: 'not found' });
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

async function signIn(page: Page, { down = false } = {}) {
  await serveBuiltRemote(page, { down });
  await mockPosApi(page, ALL_MODULES, { moduleRemotes: { debts: DEBTS_REMOTE } });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
}

test('a cart goes on the tab: the button beside «Оплатити», then an empty cart', async ({ page }) => {
  await signIn(page);
  const sent = await mockDebts(page);

  await page.goto('/register');
  await page.getByText(SHIRT.product_name).first().click();
  // A debt is written to a person: without one the button says so.
  await expect(page.getByTestId('debts-checkout-hint')).toContainText('Оберіть покупця');

  await page.getByRole('button', { name: 'Клієнт не вибраний — вибрати' }).click();
  await page.getByRole('dialog', { name: 'Клієнт чека' }).getByRole('button', { name: /Оксана/ }).first().click();
  await expect(page.getByTestId('debts-customer-strip')).toContainText('Боргу немає');

  await page.getByRole('button', { name: /Під запис/ }).click();
  await page.getByRole('button', { name: /Записати/ }).click();
  await expect(page.getByTestId('debts-issue-after')).toContainText('Борг 450');
  await page.getByRole('button', { name: 'Готово' }).click();

  // The module said it was finished; the host emptied the cart.
  await expect(page.getByText('Додайте товар з каталогу')).toBeVisible();
  expect(sent.find((s) => s.path === '/debts/issue')?.body).toMatchObject({
    customer_id: 7,
    items: [{ variant_id: SHIRT.variant_id, quantity: 1 }],
  });
});

test('the notebook: who owes, the statement, and a repayment that names its lines', async ({ page }) => {
  await signIn(page);
  const sent = await mockDebts(page, { balance: SHIRT.price_cents });

  await page.goto('/debts');
  await expect(page.getByTestId('debts-total')).toContainText('1 покупець');
  await page.getByTestId('debtors').getByRole('link', { name: /Оксана/ }).click();
  await expect(page.getByRole('heading', { name: 'Оксана' })).toBeVisible();
  await expect(page.getByTestId('debts-open-lines')).toContainText(SHIRT.product_name);

  await page.getByRole('button', { name: 'Прийняти оплату' }).click();
  await page.getByRole('button', { name: /^Прийняти 450/ }).click();
  await expect(page.getByTestId('debts-pay-done')).toContainText('R-0000055');
  expect(sent.find((s) => s.path === '/pay')?.body).toMatchObject({
    line_ids: [1],
    payments: [{ method: 'cash', amount_cents: SHIRT.price_cents }],
    cash_rounding: 0,
  });
});

test('a sum short of the oldest goods goes toward them as a «внесок» (Д4 revised)', async ({ page }) => {
  await signIn(page);
  const sent = await mockDebts(page, { balance: SHIRT.price_cents, partial: true });

  await page.goto('/debts/7');
  await page.getByRole('button', { name: 'Прийняти оплату' }).click();
  await page.getByPlaceholder('Наприклад: 500').fill('300');
  await expect(page.getByTestId('debts-pay-offer')).toContainText(/Внесок 300,00\s₴ на «Футболка базова/);
  await expect(page.getByTestId('debts-pay-due')).toContainText(/300,00/);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/debts-pay-prepay.png` });
  await page.getByRole('button', { name: /^Прийняти 300/ }).click();

  await expect(page.getByTestId('debts-pay-done-text')).toContainText('як внесок на «Футболка базова');
  expect(sent.find((s) => s.path === '/pay')?.body).toMatchObject({
    part: { line_id: 1, amount_cents: 30000, method: 'cash' },
    payments: [],
  });
  await page.getByRole('button', { name: 'Готово' }).click();
  // The statement says what was brought toward the shirt, and the journal names it.
  await expect(page.getByTestId('debts-open-lines')).toContainText(/внесено 300,00/);
  await expect(page.getByTestId('debts-journal')).toContainText('Внесок · № R-0000056');
  await expect(page.getByTestId('debts-journal').getByRole('button', { name: 'Скасувати' })).toBeVisible();
});

test('the owner’s «Сьогодні» carries the notebook’s three figures', async ({ page }) => {
  await signIn(page);
  await mockDebts(page);

  await page.goto('/admin');
  await expect(page.getByTestId('panel-debt-issued')).toContainText('450');
  await expect(page.getByTestId('panel-debt-balance')).toContainText('1 покупець');
  await expect(page.getByRole('link', { name: 'Борги' }).first()).toBeVisible();
});

test('with the module CDN down there is no «Під запис», and the till still sells', async ({ page }) => {
  await signIn(page, { down: true });
  await mockDebts(page);

  await page.goto('/register');
  await page.getByText(SHIRT.product_name).first().click();
  await expect(page.getByRole('button', { name: /^Оплатити/ }).first()).toBeEnabled();
  await expect(page.getByTestId('debts-checkout-action')).toHaveCount(0);
  // An online-only module that failed to load leaves nothing behind on the web.
  await expect(page.getByRole('link', { name: 'Борги' })).toHaveCount(0);
});
