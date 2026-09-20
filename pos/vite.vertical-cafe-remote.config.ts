// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Build `src/modules/vertical-cafe` as a standalone signed ESM remote — the
// café's sell screen, delivered over the wire like `vertical-flowers`.
// Output: dist-remotes/vertical-cafe/{remote-entry.js,style.css}
//
//   npm run build:vertical-cafe-remote     (build + sign)
//
// Run it from `pos/`: `moduleCss`'s content globs are cwd-relative, and a build
// started elsewhere produces an empty — but still signed — style.css.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';
import { moduleCss } from './scripts/module-tailwind.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // The host's cashier components this bundle renders inline — the modifier
  // sheet included, or its chips would come out unstyled at runtime (see
  // scripts/module-tailwind.mjs for the lesson).
  css: moduleCss('vertical-cafe', [
    './src/components/cashier/{ProductTile,TagFolderTile,CatalogTagBar,ScanWedge,ModifierSheet}.tsx',
    './src/components/BarcodeScanner.tsx',
  ]),
  define: {
    'process.env.NODE_ENV': '"production"',
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
    outDir: 'dist-remotes/vertical-cafe',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/vertical-cafe/remote-entry.ts'),
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
        '@pos/platform',
      ],
    },
  },
});
