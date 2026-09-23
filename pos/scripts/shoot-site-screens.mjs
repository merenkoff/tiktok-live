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

/** @type {Record<string, { login: string, shots: (page: import('@playwright/test').Page, shoot: Function) => Promise<void> }>} */
const STORES = {
  clothing: {
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
    },
  },
  flowers: {
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
  restaurant: {
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

async function expectCatalog(page, testId) {
  await page.getByTestId(testId).waitFor(WAIT);
  await page.waitForTimeout(1200);
}

async function login(page, email) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Власник' }).click();
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
    await login(page, store.login);
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
