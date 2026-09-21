// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Builds `src/modules/tables` as a standalone ESM remote (café phase К4e,
// TechDocs/POS_TABLES.md §4.11). react / react-router-dom / zustand / dexie /
// @pos/platform are external — the host supplies them via its import map, and
// `dexie` is already listed because К4j gives this module its own read mirror
// on the host's Dexie. Output: dist-remotes/tables/remote-entry.js
//
//   npm run build:tables-remote

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';
import { moduleCss } from './scripts/module-tailwind.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // The host cashier component this bundle renders inline — without its
  // classes in the glob too, `style.css` would build fine (signed, present,
  // deterministic path) and every chip of the modifier sheet would come out
  // unstyled at runtime. See scripts/module-tailwind.mjs for the lesson.
  css: moduleCss('tables', ['./src/components/cashier/ModifierSheet.tsx']),
  define: {
    'process.env.NODE_ENV': '"production"',
    // This remote's own build version — see roadmap #6.
    __POS_APP_VERSION__: JSON.stringify(posAppVersion()),
  },
  resolve: {
    alias: {
      // Bundled locally, like every other remote: `@pos/platform/ui` re-exports
      // components, not singletons. The stores they read come from the shared,
      // externalised `@pos/platform` below.
      '@pos/platform/ui': path.resolve(dir, 'src/platform/ui.ts'),
    },
  },
  build: {
    outDir: 'dist-remotes/tables',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/tables/remote-entry.ts'),
      formats: ['es'],
      fileName: () => 'remote-entry.js',
    },
    rollupOptions: {
      output: { assetFileNames: 'style.css' },
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react-router-dom',
        'zustand',
        'dexie',
        '@pos/platform',
      ],
    },
  },
});
