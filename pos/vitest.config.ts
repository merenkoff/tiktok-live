import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Longest specifier first: '@pos/platform' would otherwise swallow
      // '@pos/platform/ui'. The bundled clothing catalog imports it, and the
      // registry imports that, so every module test now resolves it.
      '@pos/platform/ui': path.resolve(rootDir, 'src/platform/ui.ts'),
      '@pos/platform': path.resolve(rootDir, 'src/platform/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // `pos/.env` points VITE_API_BASE at the local API; tests want the relative
    // `/api/pos` base so MSW can intercept against http://localhost.
    env: { VITE_API_BASE: '' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Deliberately narrow: the module-platform logic and the pure helpers the
      // till depends on. Screens (including the ones inside `src/modules/returns`)
      // are covered by render/e2e tests, not by this gate. The registry and the
      // manifests are declarative data — `registry.test.ts` asserts them instead.
      include: [
        'src/modules/constants.ts',
        'src/modules/renderRoutes.tsx',
        'src/modules/navOverrides.ts',
        'src/modules/selectNav.ts',
        'src/modules/shells.ts',
        'src/modules/useEnabledModules.ts',
        'src/modules/products/data/techCards.ts',
        'src/modules/vertical-flowers/bench/useBench.ts',
        'src/modules/vertical-cafe/kitchen/lib/kitchen.ts',
        'src/modules/vertical-cafe/lib/stopList.ts',
        'src/modules/tables/lib/hallMap.ts',
        'src/modules/tables/lib/bill.ts',
        'src/modules/tables/lib/menu.ts',
        'src/modules/tables/lib/pay.ts',
        'src/modules/tables/lib/precheck.ts',
        'src/modules/tables/lib/layout.ts',
        'src/lib/bouquet.ts',
        'src/lib/pack.ts',
        'src/lib/kitchenPrinters.ts',
        'src/lib/kitchenTicket.ts',
        'src/lib/localOrderNo.ts',
        'src/lib/modifiers.ts',
        'src/lib/money.ts',
        'src/lib/priceTagLayout.ts',
        'src/lib/receipt.ts',
        'src/lib/taxUrl.ts',
        'src/lib/urls.ts',
        'src/hooks/useCart.ts',
        'src/offline/catalog-filter.ts',
        'src/offline/cashierApi.ts',
        'src/offline/enabled.ts',
        'src/offline/lease.ts',
      ],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
