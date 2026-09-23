// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Build `src/modules/vertical-flowers` as a standalone signed ESM remote — the
// first sales vertical that reaches a store over the wire.
// Output: dist-remotes/vertical-flowers/{remote-entry.js,style.css}
//
//   npm run build:vertical-flowers-remote     (build + sign)
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
  // `public/` is the tablet PWA's manifest and icons — the web host's, never a remote's.
  publicDir: false,
  // The catalog is built from the host's cashier components, which this bundle
  // renders inline — without their classes in the glob, `style.css` would build
  // fine and every tile would come out unstyled at runtime (the `fiscal-core`
  // lesson, see scripts/module-tailwind.mjs).
  css: moduleCss('vertical-flowers', [
    './src/components/cashier/{ProductTile,TagFolderTile,VariantPicker,CatalogTagBar,ScanWedge}.tsx',
    './src/components/BarcodeScanner.tsx',
  ]),
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
    outDir: 'dist-remotes/vertical-flowers',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/vertical-flowers/remote-entry.ts'),
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
