import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';

/** Default for clone + `tauri:dev` / `tauri:build`. Override with VITE_API_BASE or pos/.env. */
const DEFAULT_POS_API = 'https://the-live.shop';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;
const distCashier = path.resolve(__dirname, 'dist-cashier');

/**
 * Shared singletons the built cashier resolves through the import map injected
 * into `dist-cashier/{index,cashier}.html` by `scripts/assemble-cashier-dist.mjs`
 * — self-hosted INSIDE the app from `dist-cashier/assets/{vendor,platform}/`.
 * Same idea as `vite.config.ts` for the web build (#7/#8); this is roadmap #13
 * Part A, groundwork for online-only module remotes on the desktop. `dexie` is
 * shared too — `@pos/platform` `new Dexie()`s on import, and two instances would
 * mean two IndexedDB connections. Build-only: `dev:cashier` / `tauri:dev` keep
 * the `resolve.alias` below and bundle everything.
 */
const SHARED_EXTERNALS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react-router-dom',
  'zustand',
  'dexie',
  '@pos/platform',
];

function cashierAsIndex() {
  return {
    name: 'cashier-as-index',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, _res: unknown, next: () => void) => void) => void } }) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          req.url = '/cashier.html';
        }
        next();
      });
    },
    closeBundle() {
      const from = path.join(distCashier, 'cashier.html');
      const to = path.join(distCashier, 'index.html');
      if (existsSync(from)) copyFileSync(from, to);
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  if (!process.env.VITE_API_BASE) {
    process.env.VITE_API_BASE = fileEnv.VITE_API_BASE || DEFAULT_POS_API;
  }

  return {
    plugins: [react(), cashierAsIndex()],
    // Build version of this bundle, read from package.json — see roadmap #6.
    define: { __POS_APP_VERSION__: JSON.stringify(posAppVersion()) },
    resolve: {
      alias: {
        '@pos/platform/ui': path.resolve(__dirname, 'src/platform/ui.ts'),
        '@pos/platform': path.resolve(__dirname, 'src/platform/index.ts'),
      },
    },
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    server: {
      port: 3003,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
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
      outDir: 'dist-cashier',
      emptyOutDir: true,
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      rollupOptions: {
        input: path.resolve(__dirname, 'cashier.html'),
        // On `build`: react / router / zustand / dexie / @pos/platform resolve
        // via the import map (assemble-cashier-dist.mjs). On `serve`: bundled
        // normally via `resolve.alias`. (Dexie is external on build, so the old
        // manualChunks split is gone.)
        external: command === 'build' ? SHARED_EXTERNALS : [],
      },
    },
  };
});
