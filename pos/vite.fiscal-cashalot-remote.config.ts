// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Build `src/modules/fiscal-cashalot` (+ the shared `fiscal-core`) as a
// standalone ESM remote — Cashalot's own ПРРО UI (track CA, phase CA6), an
// **online-only** module of the same shape as `fiscal-checkbox`. Output:
// dist-remotes/fiscal-cashalot/
//
//   npm run build:fiscal-cashalot-remote     # build + sign
//   npm run serve:fiscal-cashalot-remote     # serve it on :5012 for local testing
//
// Run from `pos/`: `moduleCss`'s content globs are relative to the cwd, and a
// build started elsewhere silently produces an empty (but still signed)
// style.css. `npm run check:fiscal-cashalot-css-coverage` catches that — it
// checks BOTH `fiscal-cashalot` and `fiscal-core`, since this bundle renders
// components from both. Everything the Checkbox config says about chunks and
// signing holds here unchanged.

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
  css: moduleCss('fiscal-cashalot', ['./src/modules/fiscal-core/**/*.{ts,tsx}']),
  define: {
    'process.env.NODE_ENV': '"production"',
    // This remote's own build version — see roadmap #6.
    __POS_APP_VERSION__: JSON.stringify(posAppVersion()),
    // Which bundle `fiscal-core`'s diagnostics are speaking for.
    __POS_FISCAL_MODULE__: JSON.stringify('fiscal-cashalot'),
  },
  build: {
    outDir: 'dist-remotes/fiscal-cashalot',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/fiscal-cashalot/remote-entry.ts'),
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
    },
  },
});
