// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Task B PoC — build `src/modules/returns` as a standalone ESM remote.
// react / react-dom / react-router-dom / zustand / @pos/platform are left
// external; the host supplies them via an import map (see TechDocs/
// POS_MODULE_REMOTE_POC.md). Output: dist-remotes/returns/remote-entry.js
//
//   npx vite build --config vite.returns-remote.config.ts

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';
import { moduleCss } from './scripts/module-tailwind.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  css: moduleCss('returns'),
  define: {
    'process.env.NODE_ENV': '"production"',
    // This remote's own build version — see roadmap #6.
    __POS_APP_VERSION__: JSON.stringify(posAppVersion()),
  },
  resolve: {
    alias: {
      // `@pos/platform/ui` re-exports `Nav`, which reads the full module
      // registry (every manifest's lazy pages, including this module's own)
      // — bundling it locally here avoids a circular external reference back
      // into this same build. Not shared as a singleton, and doesn't need to
      // be: components aren't state, they just read the (externally shared)
      // stores from `@pos/platform` below.
      '@pos/platform/ui': path.resolve(dir, 'src/platform/ui.ts'),
    },
  },
  build: {
    outDir: 'dist-remotes/returns',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/returns/remote-entry.ts'),
      formats: ['es'],
      fileName: () => 'remote-entry.js',
    },
    rollupOptions: {
      // CSS from remote-styles.css lands at a deterministic path the signed
      // manifest + loader expect (roadmap #4).
      output: { assetFileNames: 'style.css' },
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react-router-dom',
        'zustand',
        '@pos/platform',
      ],
      // No `inlineDynamicImports`: `@pos/platform/ui`'s `Nav` pulls in every
      // module's lazily-loaded pages via the registry, so forcing that into
      // one file would balloon this from ~kB to the whole app. Left as
      // normal async chunks alongside remote-entry.js (only fetched if a
      // route actually renders one) — serve the whole `dist-remotes/returns`
      // directory, not just the one file.
    },
  },
});
