// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Build `src/modules/tiktok-live` as a standalone ESM remote — the first
// **online-only** module (roadmap #13): the shell ships none of this code, so
// this build is the only copy of it. Output: dist-remotes/tiktok-live/
//
//   npm run build:tiktok-live-remote     # build + sign
//   npm run serve:tiktok-live-remote     # serve it on :5004 for local testing
//
// Run from `pos/`: `moduleCss`'s content glob is relative to the cwd, and a
// build started elsewhere silently produces an empty (but still signed)
// style.css. `npm run check:tiktok-live-css-coverage` catches that.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';
import { moduleCss } from './scripts/module-tailwind.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  css: moduleCss('tiktok-live'),
  define: {
    'process.env.NODE_ENV': '"production"',
    // This remote's own build version — see roadmap #6.
    __POS_APP_VERSION__: JSON.stringify(posAppVersion()),
  },
  // No `@pos/platform/ui` alias here (unlike the `returns` build): this module
  // imports nothing from that entry point, so there is no self-referential
  // external to break.
  build: {
    outDir: 'dist-remotes/tiktok-live',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/tiktok-live/remote-entry.ts'),
      formats: ['es'],
      fileName: () => 'remote-entry.js',
    },
    rollupOptions: {
      // CSS from remote-styles.css lands at the deterministic path the signed
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
      // `LiveDeskPage` stays a normal async chunk next to remote-entry.js, so
      // serve the whole `dist-remotes/tiktok-live` directory, not just the one
      // file. (Async chunks are not covered by the signed manifest — same as
      // the other remotes; see TechDocs/POS_MODULE_REMOTE_SIGNING.md.)
    },
  },
});
