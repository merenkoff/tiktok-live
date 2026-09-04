import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
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
        'src/modules/selectNav.ts',
        'src/modules/useEnabledModules.ts',
        'src/lib/money.ts',
        'src/lib/receipt.ts',
        'src/lib/urls.ts',
        'src/hooks/useCart.ts',
        'src/offline/catalog-filter.ts',
        'src/offline/cashierApi.ts',
      ],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
