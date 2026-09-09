import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';
import { devPrivateKey, keyIdOfPrivateKey, signManifestJson } from '../scripts/sign-remote.mjs';
import { platformVersion } from '../scripts/platform-version.mjs';

/**
 * The host↔module version contract, end to end on the web path (roadmap #12
 * track 2, TechDocs/POS_MODULE_PLATFORM_VERSION.md).
 *
 * A store points `module_remotes.returns` at a signed remote served from a
 * fake CDN (Playwright routes). The remote is a real ES module the browser
 * imports; its manifest is signed in-test with the deterministic dev key the
 * e2e build trusts (`VITE_REMOTE_ALLOW_DEV_KEY=1` in playwright.config.ts).
 * `minHostPlatform` decides whether the host imports it or keeps the bundled
 * `returns`. The desktop path (Rust) is unit-tested in `module_remotes.rs` and
 * checked by hand — a browser cannot serve `liveshopmodule://`.
 */

const CDN = 'https://cdn.e2e.test/returns';
const ENTRY_URL = `${CDN}/remote-entry.js`;

// No imports on purpose: a descriptor the host renders needs nothing from
// `@pos/platform`, and `routes: []` keeps `/admin/sales` on the bundled index.
const ENTRY_JS = `export const manifest = {
  id: 'returns',
  title: 'Чеки та повернення (remote)',
  version: '9.9.9',
  defaultEnabled: true,
  shells: ['web', 'cashier'],
  routes: [],
  nav: [{ to: '/admin/sales', label: 'Продажі (remote)', location: 'admin-sidebar', order: 50 }],
};
`;

/** Serve a signed `returns` remote from the fake CDN with the given host requirement. */
async function serveSignedRemote(page: Page, minHostPlatform: number) {
  const key = devPrivateKey();
  const manifest = {
    schema: 1,
    moduleId: 'returns',
    version: '9.9.9',
    minHostPlatform,
    entry: 'remote-entry.js',
    keyId: keyIdOfPrivateKey(key),
    builtAt: '2026-09-09T00:00:00.000Z',
    files: { 'remote-entry.js': `sha384-${createHash('sha384').update(ENTRY_JS).digest('base64')}` },
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const sig = signManifestJson(manifestJson, key);

  await page.route(`${CDN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const cors = { 'access-control-allow-origin': '*' };
    if (pathname.endsWith('/manifest.json')) {
      await route.fulfill({ body: manifestJson, contentType: 'application/json', headers: cors });
    } else if (pathname.endsWith('/manifest.json.sig')) {
      await route.fulfill({ body: sig, contentType: 'text/plain', headers: cors });
    } else if (pathname.endsWith('/remote-entry.js')) {
      await route.fulfill({ body: ENTRY_JS, contentType: 'text/javascript', headers: cors });
    } else {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

test('a remote built for this host platform replaces the bundled module on the next boot', async ({ page }) => {
  await serveSignedRemote(page, platformVersion());
  await mockPosApi(page, ALL_MODULES, { moduleRemotes: { returns: ENTRY_URL } });
  await loginAsOwner(page);

  // First login: the store's list differs from the (empty) one applied at boot.
  await expect(page.getByText('Джерело модулів магазину змінилося.')).toBeVisible();
  await page.reload();
  await page.waitForURL(/\/admin$/);

  await expect(page.getByRole('link', { name: 'Продажі (remote)' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Продажі', exact: true })).toHaveCount(0);
});

test('a remote that needs a newer host platform is refused and the bundled module stays', async ({ page }) => {
  await serveSignedRemote(page, platformVersion() + 1);
  await mockPosApi(page, ALL_MODULES, { moduleRemotes: { returns: ENTRY_URL } });
  await loginAsOwner(page);
  await page.reload();
  await page.waitForURL(/\/admin$/);

  await expect(page.getByRole('link', { name: 'Продажі', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Продажі (remote)' })).toHaveCount(0);
});
