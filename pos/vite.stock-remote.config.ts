// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Second module-remote build — `stock`. Same mechanism as
// vite.returns-remote.config.ts (see TechDocs/POS_MODULE_REMOTE_POC.md):
// react / react-dom / react-router-dom / zustand / @pos/platform are left
// external; the host supplies them via an import map. Output:
// dist-remotes/stock/remote-entry.js
//
//   npx vite build --config vite.stock-remote.config.ts

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
      // in vite.returns-remote.config.ts: `Nav` (re-exported from
      // `@pos/platform/ui`) reads the full module registry, so leaving the
      // whole barrel external would create a circular reference back into
      // this build. `stock` only actually uses `useDragScroll` from it, but
      // the alias always resolves to the same local file as the other
      // remote configs for consistency.
      '@pos/platform/ui': path.resolve(dir, 'src/platform/ui.ts'),
    },
  },
  build: {
    outDir: 'dist-remotes/stock',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/stock/remote-entry.ts'),
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
      // No `inlineDynamicImports`: left as normal async chunks so each stock
      // page is only fetched when its route actually renders — serve the
      // whole `dist-remotes/stock` directory, not just the one file.
    },
  },
});
