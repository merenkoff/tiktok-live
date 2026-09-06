import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared singletons the built web app resolves through the import map injected
 * into `dist/index.html` by `scripts/assemble-web-dist.mjs` — self-hosted from
 * `dist/assets/vendor/*` and `dist/assets/platform/*`. Externalising them here
 * is what makes `useAuthStore` / `useCartStore` / React / the Router context
 * ONE instance shared with a runtime-loaded module-remote (see
 * TechDocs/POS_MODULE_REMOTE_POC.md). Build-only: `npm run dev` keeps the
 * `resolve.alias` below and bundles everything normally.
 */
const SHARED_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react-router-dom',
  'zustand',
  // `@pos/platform` `new Dexie()`s on import (via `platform/offline.ts`), so
  // share the one instance rather than bundling a second, dead copy.
  'dexie',
  '@pos/platform',
];

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Build version of this bundle, read from package.json — see roadmap #6.
  define: { __POS_APP_VERSION__: JSON.stringify(posAppVersion()) },
  resolve: {
    alias: {
      // `@pos/platform/ui` is always bundled locally (components aren't
      // singletons). `@pos/platform` is aliased for dev; on `build` the
      // `external` entry below wins and it resolves via the import map.
      '@pos/platform/ui': path.resolve(rootDir, 'src/platform/ui.ts'),
      '@pos/platform': path.resolve(rootDir, 'src/platform/index.ts'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/pos-uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // On `build`: react / router / zustand / dexie / @pos/platform resolve via
      // the import map (assemble-web-dist.mjs). On `serve`: bundled via
      // `resolve.alias`. (Dexie is external on build — no manualChunks needed.)
      external: command === 'build' ? SHARED_EXTERNALS : [],
    },
  },
}));
