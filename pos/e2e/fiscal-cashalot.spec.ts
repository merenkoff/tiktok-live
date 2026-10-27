import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, catalog, loginAsOwner, mockPosApi } from './helpers';

/**
 * Cashalot end to end in the web shell (ПРРО track CA, after phase CA6): the
 * REAL signed `fiscal-cashalot` bundle served from a fake CDN, a store that
 * names it in `module_remotes`, and a ПРРО «server» that is one object of
 * state in this file —
 *
 *   ключі → таблиця ставок + тестовий режим → проба → зміна → продаж
 *
 * What it holds: the bundle's two screens light up inside the host (the
 * sidebar entry, `/admin/fiscal`, `/fiscal`), the three credentials go out as
 * one `secrets` patch, the table, the mode and the default code go out as ONE
 * patch with the code as the letter's ASCII, the host card hides the print
 * source for a provider that renders no receipt text, the till shows the test
 * banner and registers a sale — and with the CDN down the till sells exactly
 * as a store without the bundle does. This is the run that was done by hand
 * against `src/__tests__/helpers/fake-cashalot-server.ts` on 2026-10-27.
 */

const CDN = 'https://cdn.e2e.test/fiscal-cashalot';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes/fiscal-cashalot');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const CASHALOT_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Фіскалізація (Cashalot)',
  routePath: '/fiscal',
  icon: 'ShieldCheck',
  nav: [{ label: 'Зміна', location: 'cashier-primary', order: 90, icon: 'ShieldCheck', match: '/fiscal' }],
};

const NUM_FISCAL = '4000000004';

const REQUISITES = {
  organization: { name: 'ТОВ «Тест»', edrpou: '12345678', tax_number: '123456789012', is_vat: true },
  point: { name: 'Кав’ярня', address: 'вул. Тестова, 1' },
  register: { fiscal_number: NUM_FISCAL, title: null, address: null },
  taxes: [{ code: 'A', symbol: 'А', label: 'ПДВ 20 %', rate: 20, no_vat: false, is_default: true }],
};

const TABLE = { taxes: [{ letter: 'А', name: 'ПДВ', rate: 20, type: 0 }] };

// The first catalogue item, «Футболка базова» at 450 ₴.
const SHIRT = catalog[0];

type Sent = { path: string; body: Record<string, unknown> };

/**
 * A ПРРО backend of one object: what `/fiscal/settings` stores, whether a
 * shift is open, what a sale answers. Registered AFTER `mockPosApi` — Playwright
 * matches routes in reverse registration order, so its catch-all would
 * otherwise answer every one of these with an empty array (and its own fixed
 * `/fiscal/settings` with a view that has no `receipt_text_capable`).
 */
async function mockFiscal(page: Page, { testing = false, withTable = false } = {}) {
  const sent: Sent[] = [];
  const state = {
    secretsSet: [] as string[],
    config: (withTable ? { ...TABLE, testing } : { testing }) as Record<string, unknown>,
    defaultTaxCode: withTable ? 'A' : null,
    shiftOpen: false,
  };
  const settingsView = () => ({
    enabled: true,
    provider: 'cashalot',
    config: state.config,
    secrets_set: [...state.secretsSet].sort(),
    default_tax_code: state.defaultTaxCode,
    auto_open_shift: true,
    fail_mode: 'block',
    receipt_source: 'local',
    receipt_width: 32,
    offline_mode: false,
    offline_codes_target: 200,
    offline_capable: false,
    receipt_text_capable: false,
    requisites: REQUISITES,
    requisites_fetched_at: '2026-10-27T12:00:00.000Z',
    updated_at: '2026-10-27T12:00:00.000Z',
    secrets_key_configured: true,
    adapter_available: true,
  });
  const shift = () =>
    state.shiftOpen
      ? { status: 'open', provider_shift_id: '701', opened_at: '2026-10-27T09:00:00.000Z', auto_close_due_at: null }
      : null;

  await page.route('**/api/pos/fiscal/settings', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sent.push({ path: '/fiscal/settings', body });
      if (body.secrets && typeof body.secrets === 'object') {
        for (const [key, value] of Object.entries(body.secrets as Record<string, unknown>)) {
          if (value === null) state.secretsSet = state.secretsSet.filter((k) => k !== key);
          else if (value !== '' && !state.secretsSet.includes(key)) state.secretsSet.push(key);
        }
      }
      if (body.config && typeof body.config === 'object') state.config = body.config as Record<string, unknown>;
      if ('default_tax_code' in body) state.defaultTaxCode = (body.default_tax_code as string | null) ?? null;
    }
    await route.fulfill({ json: settingsView() });
  });
  await page.route('**/api/pos/fiscal/status', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        provider: 'cashalot',
        configured: true,
        auto_open_shift: true,
        shift: shift(),
        testing: state.config.testing === true,
        error: null,
        holder: null,
        offline: { capable: false, enabled: false, codes_target: 200, codes: null, session: null },
      },
    })
  );
  await page.route('**/api/pos/fiscal/test-connection', (route) => {
    sent.push({ path: '/fiscal/test-connection', body: {} });
    return route.fulfill({
      json: {
        ok: true,
        cashierName: null,
        cashRegister: `ПРРО ${NUM_FISCAL}`,
        shiftOpen: state.shiftOpen,
        message: 'Ліцензія до 2027-01-01',
      },
    });
  });
  await page.route('**/api/pos/fiscal/shift/open', (route) => {
    state.shiftOpen = true;
    sent.push({ path: '/fiscal/shift/open', body: {} });
    return route.fulfill({
      json: { shift: { providerShiftId: '701', status: 'open', openedAt: '2026-10-27T09:00:00.000Z', autoCloseAt: null } },
    });
  });
  await page.route('**/api/pos/fiscal/shift/close', (route) => {
    state.shiftOpen = false;
    return route.fulfill({
      json: { shift: { providerShiftId: '701', status: 'closed', openedAt: null, autoCloseAt: null }, z_report: null, z_report_text: 'Z-ЗВІТ' },
    });
  });
  await page.route('**/api/pos/fiscal/x-report', (route) => route.fulfill({ json: { text: 'X-ЗВІТ', raw: {} } }));
  await page.route('**/api/pos/fiscal/service', (route) =>
    route.fulfill({ json: { status: 'done', fiscal_code: '100003', fiscal_date: null, tax_url: null, qr_payload: null, receipt_text: null, error_code: null, message: null } })
  );
  await page.route('**/api/pos/fiscal/attention', (route) => route.fulfill({ json: { documents: [], sessions: [] } }));
  await page.route('**/api/pos/sales/complete', async (route) => {
    sent.push({ path: '/sales/complete', body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill({
      status: 201,
      json: {
        id: 6,
        receipt_number: 'R-00001',
        status: 'completed',
        subtotal_cents: SHIRT.price_cents,
        total_cents: SHIRT.price_cents,
        cart_discount_cents: 0,
        refunded_cents: 0,
        staff_name: 'Олена',
        created_at: new Date().toISOString(),
        items: [],
        payments: [{ id: 1, method: 'cash', amount_cents: SHIRT.price_cents }],
        refunds: [],
        fiscal_status: 'done',
        fiscal: {
          status: 'done',
          mode: 'online',
          fiscal_code: '100002',
          fiscal_date: '2026-10-27T12:05:00.000Z',
          control_number: null,
          tax_url: `https://cabinet.tax.gov.ua/cashregs/check?id=100002&fn=${NUM_FISCAL}`,
          qr_payload: null,
          receipt_text: null,
          vat_cents: 7500,
          error_code: null,
          message: null,
        },
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

async function signIn(page: Page, opts: { down?: boolean; testing?: boolean; withTable?: boolean } = {}) {
  await serveBuiltRemote(page, { down: opts.down ?? false });
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'fiscal-cashalot': CASHALOT_REMOTE },
    store: {
      fiscal: {
        enabled: true,
        provider: 'cashalot',
        register_fiscal_number: NUM_FISCAL,
        default_tax_code: 'A',
        requisites: REQUISITES,
      },
    },
  });
  const sent = await mockFiscal(page, { testing: opts.testing, withTable: opts.withTable });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
  return sent;
}

test('the bundle loads and the three credentials go out as one patch', async ({ page }) => {
  const sent = await signIn(page);

  await page.getByRole('link', { name: 'Фіскалізація' }).first().click();
  await page.waitForURL(/\/admin\/fiscal$/);
  await expect(page.getByRole('heading', { name: 'Фіскалізація — Cashalot' })).toBeVisible();

  await page.getByLabel(/Ідентифікатор ключа \(KeyGuid\)/).fill('guid-test-1');
  await page.getByLabel(/PIN касира/).fill('9911');
  await page.getByLabel(/Фіскальний номер ПРРО/).fill(NUM_FISCAL);
  await page.getByRole('button', { name: 'Зберегти дані доступу' }).click();

  await expect(page.getByText('Значення збережено — залиште порожнім, щоб не змінювати.')).toHaveCount(3);
  expect(sent.find((s) => s.path === '/fiscal/settings')?.body).toEqual({
    secrets: { keyGuid: 'guid-test-1', keyPin: '9911', numFiscal: NUM_FISCAL },
  });
});

test('the tax table, the mode and the default code are one patch; the host card follows', async ({ page }) => {
  const sent = await signIn(page);
  await page.goto('/admin/fiscal');
  await expect(page.getByRole('heading', { name: 'Фіскалізація — Cashalot' })).toBeVisible();
  await expect(page.getByText(/Таблиця порожня/)).toBeVisible();

  await page.getByRole('button', { name: '+ Додати ставку' }).click();
  await page.getByLabel('Назва ставки 1').fill('ПДВ');
  await page.getByLabel('Відсоток ставки 1').fill('20');
  await page.getByLabel('Ставка 1 за замовчуванням').check();
  await page.getByLabel('Тестовий режим').check();
  await page.getByRole('button', { name: 'Зберегти ставки й режим' }).click();

  await expect(page.getByText('Збережено')).toBeVisible();
  const patch = sent.find((s) => s.path === '/fiscal/settings')?.body;
  expect(patch).toEqual({
    config: { taxes: [{ letter: 'А', name: 'ПДВ', rate: 20 }], testing: true },
    default_tax_code: 'A',
  });
  // The store is already fiscalising: the save asked for the requisites again.
  expect(sent.some((s) => s.path === '/fiscal/test-connection')).toBe(true);
  await expect(page.getByRole('status')).toContainText('Тестовий режим.');

  await page.getByRole('button', { name: "Перевірити з'єднання" }).click();
  await expect(page.getByText("З'єднання успішне")).toBeVisible();
  await expect(page.getByText(`Каса: ПРРО ${NUM_FISCAL}`)).toBeVisible();
  await expect(page.getByText('Ліцензія до 2027-01-01')).toBeVisible();

  // The host card: Cashalot is chosen, the print source is not offered for a
  // provider that renders no receipt text, and the tax code points here.
  await page.goto('/admin/settings');
  await expect(page.getByLabel('Провайдер')).toHaveValue('cashalot');
  await expect(page.getByLabel('Джерело чека')).toHaveCount(0);
  await expect(page.getByText('Для Cashalot обирається з таблиці ставок на екрані «Фіскалізація».')).toBeVisible();
});

test('the till: the test banner, the shift, a registered sale', async ({ page }) => {
  const sent = await signIn(page, { testing: true, withTable: true });

  await page.goto('/fiscal');
  await expect(page.getByRole('heading', { name: 'Зміна ПРРО' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Тестова зміна — чеки без фіскальної сили.');
  await page.getByRole('button', { name: 'Відкрити зміну' }).click();
  await expect(page.getByText('Відкрита', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Провести чек' })).toBeVisible();
  expect(sent.some((s) => s.path === '/fiscal/shift/open')).toBe(true);

  await page.goto('/register');
  await page.getByText(SHIRT.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();

  await expect(page.getByText('Фіскальний чек № 100002 зареєстровано')).toBeVisible();
  expect(sent.some((s) => s.path === '/sales/complete')).toBe(true);
});

test('with the module CDN down there is no ПРРО screen, and the till still sells', async ({ page }) => {
  await signIn(page, { down: true, withTable: true });

  // An online-only module that failed to load leaves nothing behind on the web.
  await expect(page.getByRole('link', { name: 'Фіскалізація' })).toHaveCount(0);

  await page.goto('/register');
  await expect(page.getByRole('link', { name: 'Зміна' })).toHaveCount(0);
  await page.getByText(SHIRT.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();
  await expect(page.getByText('Фіскальний чек № 100002 зареєстровано')).toBeVisible();
});
