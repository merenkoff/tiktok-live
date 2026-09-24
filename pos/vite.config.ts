import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
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

/**
 * The tablet PWA lives under `/tablet/` (TechDocs/POS_PWA.md §3): in production
 * `serve.json` rewrites that prefix to `tablet.html`, and this does the same
 * for `vite dev` and `vite preview`, whose SPA fallbacks would both answer
 * `index.html`. `/tablet` itself is sent to `/tablet/`, as production does —
 * the service worker's scope does not cover the slash-less form.
 */
function tabletUnderPrefix(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const url = req.url ?? '';
    // Same as production's `serve.json`: `/tablet`, `/tablet/` and everything
    // under it are `tablet.html`, with no redirect — serve-handler strips the
    // trailing slash before matching, so a `/tablet → /tablet/` redirect there
    // matched `/tablet/` too and looped (2.3.0; `scripts/check-serve-json.mjs`).
    if (url === '/tablet' || url.startsWith('/tablet?') || url.startsWith('/tablet/')) req.url = '/tablet.html';
    next();
  };
  return {
    name: 'tablet-under-prefix',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tabletUnderPrefix()],
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
    // `.vite/manifest.json` is what `assemble-web-dist.mjs` walks to list the
    // tablet entry's chunks for the service worker's precache.
    manifest: true,
    rollupOptions: {
      input: {
        index: path.resolve(rootDir, 'index.html'),
        tablet: path.resolve(rootDir, 'tablet.html'),
      },
      // On `build`: react / router / zustand / dexie / @pos/platform resolve via
      // the import map (assemble-web-dist.mjs). On `serve`: bundled via
      // `resolve.alias`. (Dexie is external on build — no manualChunks needed.)
      external: command === 'build' ? SHARED_EXTERNALS : [],
    },
  },
}));
