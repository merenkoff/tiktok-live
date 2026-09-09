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
  },
  webServer: {
    // `VITE_REMOTE_ALLOW_DEV_KEY=1`: e2e/remotes.spec.ts signs a throwaway
    // module remote with the deterministic dev key, which a production build
    // does not trust otherwise (POS_MODULE_REMOTE_SIGNING.md).
    command: 'VITE_REMOTE_ALLOW_DEV_KEY=1 npm run build && npm run preview -- --host localhost --port 4173',
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
