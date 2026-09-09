// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Build `src/modules/fiscal-checkbox` (+ the shared `fiscal-core`) as a
// standalone ESM remote — Checkbox's own ПРРО UI, another **online-only**
// module (roadmap #13, same shape as `tiktok-live`). Output:
// dist-remotes/fiscal-checkbox/
//
//   npm run build:fiscal-checkbox-remote     # build + sign
//   npm run serve:fiscal-checkbox-remote     # serve it on :5005 for local testing
//
// Run from `pos/`: `moduleCss`'s content globs are relative to the cwd, and a
// build started elsewhere silently produces an empty (but still signed)
// style.css. `npm run check:fiscal-checkbox-css-coverage` catches that — it
// checks BOTH `fiscal-checkbox` and `fiscal-core`, since this bundle renders
// components from both.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { posAppVersion } from './scripts/pkg-version.mjs';
import { moduleCss } from './scripts/module-tailwind.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  css: moduleCss('fiscal-checkbox', ['./src/modules/fiscal-core/**/*.{ts,tsx}']),
  define: {
    'process.env.NODE_ENV': '"production"',
    // This remote's own build version — see roadmap #6.
    __POS_APP_VERSION__: JSON.stringify(posAppVersion()),
  },
  build: {
    outDir: 'dist-remotes/fiscal-checkbox',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/fiscal-checkbox/remote-entry.ts'),
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
      // `CheckboxTillPage` / `CheckboxAdminPage` stay normal async chunks next
      // to remote-entry.js, so serve the whole `dist-remotes/fiscal-checkbox`
      // directory, not just the one file. Both pages import `fiscal-core`
      // (`ShiftPanel`, `SecretsForm`, …), so Rollup will likely hoist a THIRD,
      // shared async chunk for it — that is fine, not the regression the
      // signing docs warn about: `sign-remote.mjs` hashes every `.js`/`.css`
      // it finds in this directory, so that chunk is still in `manifest.json`
      // and still verified by the desktop cashier. On WEB, only `remote-
      // entry.js` + `style.css` are hash-checked before `import()` — any async
      // chunk, shared or not, loads unverified there, which is the same
      // posture `tiktok-live`'s own two lazy pages already have. The actual
      // regression this comment's sibling in `tiktok-live`'s config warns
      // about is `fiscal-core` leaking into the SYNC entry graph (i.e.
      // `remote-entry.ts` itself importing it) — it does not here; only the
      // two page modules do.
    },
  },
});
