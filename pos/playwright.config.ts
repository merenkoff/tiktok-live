import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // A machine whose Playwright is newer than its browsers can point at the
    // Chromium it has (`PW_CHROMIUM=/path/to/chrome`); CI installs the matching one.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    // `VITE_REMOTE_ALLOW_DEV_KEY=1`: e2e/remotes.spec.ts signs a throwaway
    // module remote with the deterministic dev key, which a production build
    // does not trust otherwise (POS_MODULE_REMOTE_SIGNING.md).
    // `build:stocktake-remote` is an online-only remote that stays open, so it is
    // always present. The private online-only remotes the e2e suite serves
    // (vertical-flowers, vertical-cafe, vertical-grocery, tables, debts,
    // fiscal-cashalot, fiscal-checkbox, tiktok-live) are built by
    // `scripts/build-private-remotes.mjs` — but only where their source is
    // present, so a stripped public checkout builds none and the ten specs
    // that serve them skip (e2e/_private.ts) instead of failing the whole job
    // on a missing build script (open-core, POS_OPENCORE.md §5, O-2).
    command:
      'VITE_REMOTE_ALLOW_DEV_KEY=1 npm run build && npm run build:stocktake-remote && node scripts/build-private-remotes.mjs && npm run preview -- --host localhost --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
