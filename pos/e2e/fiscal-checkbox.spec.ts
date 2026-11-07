import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, catalog, loginAsOwner, mockPosApi } from './helpers';
import { hasPrivateModule } from './_private';

// `fiscal-checkbox` is an online-only module whose source moves to a private
// repo (POS_OPENCORE.md §5, O-2); run this spec only where that source is present.
test.skip(() => !hasPrivateModule('fiscal-checkbox'), 'fiscal-checkbox: private module (POS_OPENCORE §5)');

/**
 * Checkbox end to end in the web shell: the REAL signed `fiscal-checkbox`
 * bundle served from a fake CDN, a store that names it in `module_remotes`,
 * and a ПРРО «server» that is one object of state in this file — the same
 * shape as `fiscal-cashalot.spec.ts`, for the provider most stores use.
 *
 * What it holds: the bundle's two screens light up inside the host (the
 * sidebar entry, `/admin/fiscal`, `/fiscal`); the licence key and the PIN go
 * out as one `secrets` patch and are never echoed back; the connection probe
 * answers; the host card offers the print source, because Checkbox renders its
 * own receipt text; the till opens a shift, shows the offline reserve of a
 * store that sells offline, and registers a sale; and with the CDN down the
 * till sells exactly as a store without the bundle does.
 */

const CDN = 'https://cdn.e2e.test/fiscal-checkbox';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes/fiscal-checkbox');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const CHECKBOX_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Фіскалізація (Checkbox)',
  routePath: '/fiscal',
  icon: 'ShieldCheck',
  nav: [{ label: 'Зміна', location: 'cashier-primary', order: 90, icon: 'ShieldCheck', match: '/fiscal' }],
};

const FISCAL_NUMBER = '4000123456';

const REQUISITES = {
  organization: { name: 'ФОП Тест', edrpou: '1234567890', tax_number: null, is_vat: false },
  point: { name: 'Магазин', address: 'вул. Тестова, 1' },
  register: { fiscal_number: FISCAL_NUMBER, title: null, address: null },
  taxes: [{ code: 'Б', symbol: 'Б', label: 'Без ПДВ', rate: 0, no_vat: true, is_default: true }],
};

// The first catalogue item, «Футболка базова» at 450 ₴.
const SHIRT = catalog[0];

type Sent = { path: string; body: Record<string, unknown> };

/**
 * A Checkbox backend of one object. Registered AFTER `mockPosApi` — Playwright
 * matches routes in reverse registration order, so its catch-all would
 * otherwise answer every one of these.
 */
async function mockFiscal(page: Page, { offline = false } = {}) {
  const sent: Sent[] = [];
  const state = { secretsSet: [] as string[], shiftOpen: false };
  const settingsView = () => ({
    enabled: true,
    provider: 'checkbox',
    config: {},
    secrets_set: [...state.secretsSet].sort(),
    default_tax_code: 'Б',
    auto_open_shift: true,
    fail_mode: 'block',
    receipt_source: 'provider',
    receipt_width: 32,
    offline_mode: offline,
    offline_codes_target: 200,
    offline_capable: true,
    receipt_text_capable: true,
    requisites: REQUISITES,
    requisites_fetched_at: '2026-11-07T09:00:00.000Z',
    updated_at: '2026-11-07T09:00:00.000Z',
    secrets_key_configured: true,
    adapter_available: true,
  });
  const shift = () =>
    state.shiftOpen
      ? { status: 'open', provider_shift_id: 'sh-1', opened_at: '2026-11-07T09:00:00.000Z', auto_close_due_at: null }
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
    }
    await route.fulfill({ json: settingsView() });
  });
  await page.route('**/api/pos/fiscal/status', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        provider: 'checkbox',
        configured: true,
        auto_open_shift: true,
        shift: shift(),
        testing: false,
        error: null,
        holder: null,
        offline: offline
          ? {
              capable: true,
              enabled: true,
              codes_target: 200,
              codes: { free: 180, leased: 20, used: 0, leased_to_me: 20 },
              session: null,
              month: { month_start: '2026-11-01', measured_at: '2026-11-07T09:00:00.000Z', used_ms: 2 * 3_600_000, limit_ms: 168 * 3_600_000 },
            }
          : { capable: true, enabled: false, codes_target: 200, codes: null, session: null },
      },
    })
  );
  await page.route('**/api/pos/fiscal/test-connection', (route) => {
    sent.push({ path: '/fiscal/test-connection', body: {} });
    return route.fulfill({
      json: {
        ok: true,
        cashierName: 'Олена',
        cashRegister: `Каса ${FISCAL_NUMBER}`,
        shiftOpen: state.shiftOpen,
        message: null,
      },
    });
  });
  await page.route('**/api/pos/fiscal/shift/open', (route) => {
    state.shiftOpen = true;
    sent.push({ path: '/fiscal/shift/open', body: {} });
    return route.fulfill({
      json: { shift: { providerShiftId: 'sh-1', status: 'open', openedAt: '2026-11-07T09:00:00.000Z', autoCloseAt: null } },
    });
  });
  await page.route('**/api/pos/fiscal/attention', (route) => route.fulfill({ json: { documents: [], sessions: [] } }));
  await page.route('**/api/pos/sales/complete', async (route) => {
    sent.push({ path: '/sales/complete', body: route.request().postDataJSON() as Record<string, unknown> });
    await route.fulfill({
      status: 201,
      json: {
        id: 7,
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
          fiscal_code: 'TEST-77',
          fiscal_date: '2026-11-07T09:05:00.000Z',
          control_number: null,
          tax_url: `https://cabinet.tax.gov.ua/cashregs/check?id=TEST-77&fn=${FISCAL_NUMBER}`,
          qr_payload: null,
          receipt_text: 'ФІСКАЛЬНИЙ ЧЕК\nCHECKBOX',
          vat_cents: 0,
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

async function signIn(page: Page, opts: { down?: boolean; offline?: boolean } = {}) {
  await serveBuiltRemote(page, { down: opts.down ?? false });
  await mockPosApi(page, ALL_MODULES, {
    moduleRemotes: { 'fiscal-checkbox': CHECKBOX_REMOTE },
    store: {
      fiscal: {
        enabled: true,
        provider: 'checkbox',
        register_fiscal_number: FISCAL_NUMBER,
        default_tax_code: 'Б',
        requisites: REQUISITES,
      },
    },
  });
  const sent = await mockFiscal(page, { offline: opts.offline ?? false });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
  return sent;
}

test('the bundle loads; the licence key and the PIN go out as one patch and are never echoed', async ({ page }) => {
  const sent = await signIn(page);

  await page.getByRole('link', { name: 'Фіскалізація' }).first().click();
  await page.waitForURL(/\/admin\/fiscal$/);
  await expect(page.getByRole('heading', { name: 'Фіскалізація — Checkbox' })).toBeVisible();

  await page.getByLabel(/Ліцензійний ключ/).fill('licence-test-1');
  await page.getByLabel(/PIN-код касира/).fill('1234');
  await page.getByRole('button', { name: 'Зберегти дані доступу' }).click();

  await expect(page.getByText('Значення збережено — залиште порожнім, щоб не змінювати.')).toHaveCount(2);
  expect(sent.find((s) => s.path === '/fiscal/settings')?.body).toEqual({
    secrets: { licenceKey: 'licence-test-1', cashierPin: '1234' },
  });
  // Nothing typed comes back onto the page.
  await expect(page.getByLabel(/Ліцензійний ключ/)).toHaveValue('');
  await expect(page.getByLabel(/PIN-код касира/)).toHaveValue('');
});

test('the probe answers, and the host card offers the print source Checkbox renders', async ({ page }) => {
  const sent = await signIn(page);
  await page.goto('/admin/fiscal');
  await expect(page.getByRole('heading', { name: 'Фіскалізація — Checkbox' })).toBeVisible();

  await page.getByRole('button', { name: "Перевірити з'єднання" }).click();
  await expect(page.getByText("З'єднання успішне")).toBeVisible();
  await expect(page.getByText(`Каса: Каса ${FISCAL_NUMBER}`)).toBeVisible();
  expect(sent.some((s) => s.path === '/fiscal/test-connection')).toBe(true);

  await page.goto('/admin/settings');
  // By role: «Чек від провайдера» in the print-source options also matches a
  // bare getByLabel('Провайдер').
  await expect(page.getByRole('combobox', { name: /^Провайдер/ })).toHaveValue('checkbox');
  await expect(page.getByRole('combobox', { name: /^Джерело чека/ })).toBeVisible();
});

test('the till: the offline reserve, the shift, a registered sale', async ({ page }) => {
  const sent = await signIn(page, { offline: true });

  await page.goto('/fiscal');
  await expect(page.getByRole('heading', { name: 'Зміна ПРРО' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Офлайн-режим ПРРО' })).toBeVisible();
  await expect(page.getByText('Запас фіскальних кодів: 180')).toBeVisible();
  await expect(page.getByText('Із них на цій касі: 20')).toBeVisible();

  await page.getByRole('button', { name: 'Відкрити зміну' }).click();
  await expect(page.getByText('Відкрита', { exact: true })).toBeVisible();
  expect(sent.some((s) => s.path === '/fiscal/shift/open')).toBe(true);

  await page.goto('/register');
  await page.getByText(SHIRT.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();

  await expect(page.getByText('Фіскальний чек № TEST-77 зареєстровано')).toBeVisible();
  expect(sent.some((s) => s.path === '/sales/complete')).toBe(true);
});

test('with the module CDN down there is no ПРРО screen, and the till still sells', async ({ page }) => {
  await signIn(page, { down: true });

  // An online-only module that failed to load leaves nothing behind on the web.
  await expect(page.getByRole('link', { name: 'Фіскалізація' })).toHaveCount(0);

  await page.goto('/register');
  await expect(page.getByRole('link', { name: 'Зміна' })).toHaveCount(0);
  await page.getByText(SHIRT.product_name).first().click();
  await page.getByRole('button', { name: /^Оплатити/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Оплата' });
  await dialog.getByRole('button', { name: 'Готівка' }).click();
  await dialog.getByRole('button', { name: /^Прийняти/ }).click();
  await expect(page.getByText('Фіскальний чек № TEST-77 зареєстровано')).toBeVisible();
});
