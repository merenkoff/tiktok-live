import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Default for clone + `tauri:dev` / `tauri:build`. Override with VITE_API_BASE or pos/.env. */
const DEFAULT_POS_API = 'https://the-live.shop';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;
const distCashier = path.resolve(__dirname, 'dist-cashier');

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

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '');
  if (!process.env.VITE_API_BASE) {
    process.env.VITE_API_BASE = fileEnv.VITE_API_BASE || DEFAULT_POS_API;
  }

  return {
    plugins: [react(), cashierAsIndex()],
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
      },
    },
  };
});
