// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Third module-remote build — `products`. Same mechanism as
// vite.stock-remote.config.ts (see TechDocs/POS_MODULE_REMOTE_POC.md):
// react / react-dom / react-router-dom / zustand / @pos/platform are left
// external; the host supplies them via an import map. Output:
// dist-remotes/products/remote-entry.js
//
//   npx vite build --config vite.products-remote.config.ts

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: {
    alias: {
      // Bundled locally rather than left external — see the matching comment
      // in vite.stock-remote.config.ts: `Nav` (re-exported from
      // `@pos/platform/ui`) reads the full module registry, so leaving the
      // whole barrel external would create a circular reference back into
      // this build. `products` uses `ProductPhotoField` + `useDragScroll`
      // from it; both bundle locally, they just read the (external) stores.
      '@pos/platform/ui': path.resolve(dir, 'src/platform/ui.ts'),
    },
  },
  build: {
    outDir: 'dist-remotes/products',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/products/remote-entry.ts'),
      formats: ['es'],
      fileName: () => 'remote-entry.js',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react-router-dom',
        'zustand',
        '@pos/platform',
      ],
      // No `inlineDynamicImports`: left as normal async chunks so each page is
      // only fetched when its route actually renders — serve the whole
      // `dist-remotes/products` directory, not just the one file.
    },
  },
});
