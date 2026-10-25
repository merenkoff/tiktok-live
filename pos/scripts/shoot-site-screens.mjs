// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/scripts/shoot-site-screens.mjs — screenshots of the demo stores for the
// marketing site (site/src/assets/screenshots/).
//
// Logs into the POS web as each demo store's owner (the public demo
// credentials every demo migration documents), waits for the store's remote
// module to render, and saves fixed-viewport PNGs. Not part of CI: run it by
// hand after a demo catalogue or a screen changes, then commit the images.
//
//   node pos/scripts/shoot-site-screens.mjs [--base https://pos.the-live.shop]
//                                            [--out site/src/assets/screenshots]
//                                            [--only cafe,flowers]
//
// Every wait is generous because the vertical modules stream from a CDN, and
// the sell screen check fails loudly if the bundled clothing catalogue
// rendered instead of the store's own — that would mean the remote did not
// load and the picture would be of the wrong till.
//
// The one step that could write to production data — opening a table's bill —
// only clicks a table that already has one (`data-tone != free`); a free tile
// would seat a party.
import { chromium } from '@playwright/test';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]);
    return acc;
  }, [])
);
const BASE = args.base ?? 'https://pos.the-live.shop';
const OUT = path.resolve(args.out ?? 'site/src/assets/screenshots');
const ONLY = args.only ? String(args.only).split(',') : null;
mkdirSync(OUT, { recursive: true });

const TILL = { width: 1366, height: 768 };
const TABLET = { width: 1024, height: 768 };
const WAIT = { timeout: 30_000 };

/** @type {Record<string, { store: string, login: string, shots: (page: import('@playwright/test').Page, shoot: Function) => Promise<void> }>} */
const STORES = {
  clothing: {
    store: 'demo-clothing',
    login: 'owner@clothing.shop',
    async shots(page, shoot) {
      await page.goto('/register');
      // The bundled catalogue is the right one here — the clothing vertical
      // ships inside the host and has no remote to wait for.
      await page.getByRole('button', { name: 'Усі товари' }).waitFor(WAIT);
      await page.waitForTimeout(800);
      await shoot('clothing-register');
      await page.goto('/admin/products');
      await page.waitForTimeout(1500);
      await shoot('clothing-products');
      // Price tags on stickers: opening the dialog and picking a size writes
      // nothing (the size is the station's, in localStorage); only its
      // «Згенерувати» button would, and it is never pressed here.
      const pick = page.locator('input[type=checkbox][aria-label^="Обрати «"]');
      for (let i = 0; i < 4; i++) await pick.nth(i).check();
      await page.getByRole('button', { name: 'Друк цінників' }).click();
      const tags = page.getByRole('dialog', { name: 'Друк цінників' });
      await tags.waitFor(WAIT);
      await tags.getByRole('button', { name: 'Наліпки', exact: true }).click();
      await tags.getByRole('group', { name: 'Готові розміри' }).getByRole('button', { name: '58×40' }).click();
      await page.waitForTimeout(800);
      await shoot('clothing-price-tags');
      await page.keyboard.press('Escape');
      // The rows the SEO pass of 2026-10-26 added to /pos/odyah
      // (TechDocs/CLOTHING_SEO_AEO.md). Each opens a dialog and writes
      // nothing: the markdown dialog only previews until «Уцінити» is
      // pressed, the variants dialog until «Додати варіанти», the refund
      // dialog until «Повернути» — none of which is pressed here.
      await optional('clothing-markdowns', async () => {
        await page.goto('/admin/products');
        await page.getByRole('button', { name: /Обрати всі показані/ }).waitFor(WAIT);
        await page.getByRole('button', { name: /Обрати всі показані/ }).click();
        await page.getByRole('button', { name: 'Уцінити', exact: true }).click();
        const markdown = page.getByRole('dialog', { name: 'Уцінити' });
        await markdown.waitFor(WAIT);
        await markdown.getByLabel(/Відсоток/).fill('30');
        await page.waitForTimeout(1200);
        await shoot('clothing-markdowns');
        await page.keyboard.press('Escape');
      }, page);
      await optional('clothing-matrix', async () => {
        await page.goto('/admin/products');
        // The first product card: the name in a row is the link to it.
        await page.locator('main a[href^="/admin/products/"]').first().click();
        await page.getByRole('button', { name: /Додати варіанти/ }).waitFor(WAIT);
        await page.getByRole('button', { name: /Додати варіанти/ }).click();
        await page.getByRole('dialog', { name: 'Додати варіанти' }).waitFor(WAIT);
        await page.waitForTimeout(800);
        await shoot('clothing-matrix');
        await page.keyboard.press('Escape');
      }, page);
      await optional('clothing-returns', async () => {
        await page.goto('/admin/sales');
        await page.getByPlaceholder(/Номер чека/).waitFor(WAIT);
        // Open the newest receipt and the refund dialog over it.
        await page.locator('main li button, main tr button').first().click();
        await page.getByRole('button', { name: 'Повернення', exact: true }).click();
        await page.getByRole('dialog').first().waitFor(WAIT);
        await page.waitForTimeout(800);
        await shoot('clothing-returns');
        await page.keyboard.press('Escape');
      }, page);
    },
  },
  flowers: {
    store: 'demo-flowers',
    login: 'owner@flowers.shop',
    async shots(page, shoot) {
      await page.goto('/register');
      await expectCatalog(page, 'flowers-catalog');
      await shoot('flowers-register');
      await page.getByTestId('start-bouquet').click();
      // A store with several blank bouquet cards is asked which one first —
      // production's demo has a few left over from testing.
      const bench = page.getByTestId('florist-bench');
      const pickerRow = page.locator('ul li button:has-text("₴")').first();
      await Promise.race([bench.waitFor(WAIT), pickerRow.waitFor(WAIT)]);
      if (!(await bench.isVisible())) {
        await pickerRow.click();
        await bench.waitFor(WAIT);
      }
      // A bouquet with a few stems in it reads better than an empty bench.
      const tiles = page.locator('[data-testid=bench-grid] button');
      for (const [i, n] of [[1, 1], [3, 1], [5, 1]]) {
        const tile = tiles.nth(i);
        if (await tile.count()) for (let k = 0; k < n; k++) await tile.click();
      }
      await page.waitForTimeout(600);
      await shoot('flowers-bench');
      await page.getByRole('button', { name: 'Закрити' }).first().click();
      await page.goto('/orders');
      await page.getByTestId('preorders-page').waitFor(WAIT);
      await page.waitForTimeout(400);
      await shoot('flowers-orders');
      await optional('flowers-showcase', async () => {
        await page.goto('/flowers');
        await page.getByTestId('showcase-list').waitFor(WAIT);
        await page.waitForTimeout(600);
        await shoot('flowers-showcase');
      }, page);
      await optional('flowers-dashboard', async () => {
        await page.goto('/admin');
        await page.getByTestId('flower-panels').waitFor(WAIT);
        await pickRange(page);
        await shoot('flowers-dashboard');
      }, page);
      await optional('flowers-analytics', async () => {
        await page.goto('/admin/flowers');
        await page.getByTestId('flower-analytics').waitFor(WAIT);
        await pickRange(page);
        await shoot('flowers-analytics');
      }, page);
    },
  },
  cafe: {
    store: 'demo-cafe',
    login: 'owner@cafe.shop',
    async shots(page, shoot) {
      await page.goto('/register');
      await expectCatalog(page, 'cafe-catalog');
      await shoot('cafe-register');
      await page.getByTestId('tile-more').first().click();
      await page.getByTestId('modifier-sheet').waitFor(WAIT);
      await page.waitForTimeout(400);
      await shoot('cafe-modifiers');
      await page.getByTestId('modifier-close').click();
      await page.goto('/kitchen');
      await page.getByTestId('kitchen-board').waitFor(WAIT);
      await page.waitForTimeout(600);
      await shoot('cafe-kitchen');
      // Owner screens that a store's pinned module release may not carry yet.
      await optional('cafe-analytics', async () => {
        await page.goto('/admin/cafe');
        await page.getByTestId('cafe-analytics').waitFor(WAIT);
        await pickRange(page);
        await shoot('cafe-analytics');
      }, page);
      await optional('cafe-dashboard', async () => {
        await page.goto('/admin');
        await page.getByTestId('cafe-panels').waitFor(WAIT);
        await pickRange(page);
        await shoot('cafe-dashboard');
      }, page);
      await optional('cafe-tech-cards', async () => {
        await page.goto('/admin/tech-cards');
        await page.getByRole('heading', { name: /Техкарти/ }).waitFor(WAIT);
        await page.waitForTimeout(800);
        await shoot('cafe-tech-cards');
      }, page);
    },
  },
  grocery: {
    store: 'demo-grocery',
    login: 'owner@grocery.shop',
    async shots(page, shoot) {
      await page.goto('/register');
      await expectCatalog(page, 'grocery-catalog');
      // The receipt a corner shop rings all day: potatoes and cheese by
      // weight, a loaf and a carton by the piece. The cart is the till's own
      // state — nothing reaches the server before «Оплатити», never pressed.
      const catalog = page.getByTestId('grocery-catalog');
      await catalog.getByRole('button', { name: /Картопля/ }).click();
      await weigh(page, '1,5');
      await catalog.getByRole('button', { name: /Сир твердий/ }).click();
      await page.getByRole('button', { name: /Гауда/ }).first().click();
      await weigh(page, '0,35');
      await catalog.getByRole('button', { name: /Батон нарізний/ }).click();
      await catalog.getByRole('button', { name: /Молоко «Ферма»/ }).click();
      await page.getByRole('button', { name: /2,5 %/ }).first().click();
      await page.waitForTimeout(800);
      await shoot('grocery-register');
      // The weight pad over that receipt: the weight typed, its sum on the button.
      await catalog.getByRole('button', { name: /Яблука/ }).click();
      await page.getByRole('button', { name: /Гала/ }).first().click();
      await weigh(page, '1,2', { confirm: false });
      await page.waitForTimeout(400);
      await shoot('grocery-weight-pad');
      await page.getByTestId('weight-pad').getByRole('button', { name: 'Закрити' }).click();
      // Price tags of weighed goods, per kilogram and per 100 g. As in the
      // clothing shot, opening the dialog and picking a size writes nothing.
      await page.goto('/admin/products');
      for (const name of ['Сир твердий', 'Картопля', 'Яблука', 'Ковбаса варена «Лікарська»']) {
        await page.getByRole('checkbox', { name: `Обрати «${name}»`, exact: true }).check();
      }
      await page.getByRole('button', { name: 'Друк цінників' }).click();
      const tags = page.getByRole('dialog', { name: 'Друк цінників' });
      await tags.waitFor(WAIT);
      await tags.getByRole('button', { name: 'Наліпки', exact: true }).click();
      await tags.getByRole('group', { name: 'Готові розміри' }).getByRole('button', { name: '58×40' }).click();
      await page.waitForTimeout(800);
      await shoot('grocery-price-tags');
    },
  },
  restaurant: {
    store: 'demo-restaurant',
    login: 'owner@restaurant.shop',
    viewport: TABLET,
    async shots(page, shoot) {
      await page.goto('/tables');
      await page.getByTestId('hall-map').waitFor(WAIT);
      await page.waitForTimeout(600);
      await shoot('restaurant-tables');
      const busy = page.locator('[data-testid^=table-tile-]:not([data-tone=free])').first();
      if (await busy.count()) {
        await busy.click();
        await page.getByTestId('bill-page').waitFor(WAIT);
        await page.waitForTimeout(600);
        await shoot('restaurant-bill');
      } else {
        console.warn('restaurant: no open bill on the map — skipping restaurant-bill');
      }
      await page.goto('/admin/tables');
      await page.getByTestId('hall-editor').waitFor(WAIT);
      await page.waitForTimeout(600);
      await shoot('restaurant-hall-editor');
      // The restaurant shares the café vertical, so its module release may
      // carry the café analytics before the café demo's does.
      await optional('restaurant-analytics', async () => {
        await page.goto('/admin/cafe');
        await page.getByTestId('cafe-analytics').waitFor(WAIT);
        await pickRange(page);
        await shoot('restaurant-analytics');
      }, page);
    },
  },
};

/** A screen the store's pinned module release may not have yet: warn, don't fail. */
async function optional(name, fn, page) {
  try {
    await fn();
  } catch (error) {
    console.warn(`${name}: skipped — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    if (page) await page.screenshot({ path: path.join(OUT, `_skipped-${name}.png`) }).catch(() => {});
  }
}

/** The owner's date presets: the demo's sales are spread over weeks, so «Сьогодні» reads empty. */
async function pickRange(page, label = '30 днів') {
  const btn = page.getByRole('button', { name: label });
  if (await btn.count()) {
    await btn.first().click();
    await page.waitForTimeout(1200);
  }
}

/** Types a weight («1,5» kg) on the weight pad, key by key as a cashier does, and adds the line. */
async function weigh(page, kg, { confirm = true } = {}) {
  const pad = page.getByTestId('weight-pad');
  await pad.waitFor(WAIT);
  for (const ch of kg) await pad.getByTestId(`weight-pad-key-${ch === ',' ? 'comma' : ch}`).click();
  if (confirm) {
    await pad.getByTestId('weight-pad-confirm').click();
    await pad.waitFor({ state: 'hidden', ...WAIT });
  }
}

async function expectCatalog(page, testId) {
  await page.getByTestId(testId).waitFor(WAIT);
  await page.waitForTimeout(1200);
}

async function login(page, store, email) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Власник' }).click();
  // The login form asks the owner for the store's code as well.
  await page.getByLabel('Код магазину').fill(store);
  await page.getByLabel('Email / логін').fill(email);
  await page.getByLabel('Пароль').fill('owner123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await page.waitForURL(/\/admin$/, WAIT);
}

const browser = await chromium.launch();
let failed = false;
for (const [key, store] of Object.entries(STORES)) {
  if (ONLY && !ONLY.includes(key)) continue;
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: store.viewport ?? TILL,
    deviceScaleFactor: 1,
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
  });
  const page = await context.newPage();
  const shoot = async (name) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`${name.padEnd(28)} ${(statSync(file).size / 1024).toFixed(0).padStart(5)} KB`);
  };
  try {
    await login(page, store.store, store.login);
    await store.shots(page, shoot);
  } catch (error) {
    failed = true;
    console.error(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    await page.screenshot({ path: path.join(OUT, `_failed-${key}.png`) }).catch(() => {});
  } finally {
    await context.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
