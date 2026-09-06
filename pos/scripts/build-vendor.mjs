// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Builds the self-hosted shared-vendor ESM chunks the default web build
// (vite.config.ts) resolves `react` / `react-dom` / `react-dom/client` /
// `react/jsx-runtime` / `react-router-dom` / `zustand` to via the import map
// injected into index.html. Each is bundled with the *other* vendors left
// external, so at runtime the import map wires them into a single shared graph
// — one React instance for the host, `@pos/platform`, and every module-remote.
//
// No network, no esm.sh: this repackages the installed CJS/ESM node_modules
// copies to plain ESM. Output: dist-remotes/vendor/<name>.js
//
//   node scripts/build-vendor.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const dir = path.dirname(fileURLToPath(import.meta.url));
const stubs = path.join(dir, 'vendor-stubs');
const outDir = path.resolve(dir, '..', 'dist-remotes/vendor');

/** Each vendor entry, with every *other* shared vendor marked external. */
const VENDORS = [
  { name: 'react', entry: 'react.js', external: [] },
  { name: 'react-dom', entry: 'react-dom.js', external: ['react'] },
  { name: 'react-dom-client', entry: 'react-dom-client.js', external: ['react', 'react-dom'] },
  { name: 'react-jsx-runtime', entry: 'react-jsx-runtime.js', external: ['react'] },
  { name: 'react-router-dom', entry: 'react-router-dom.js', external: ['react', 'react-dom'] },
  { name: 'zustand', entry: 'zustand.js', external: ['react'] },
  { name: 'dexie', entry: 'dexie.js', external: [] },
];

for (const [i, v] of VENDORS.entries()) {
  await build({
    configFile: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir,
      emptyOutDir: i === 0, // wipe once, before the first vendor
      target: 'es2020',
      minify: 'esbuild',
      lib: {
        entry: path.join(stubs, v.entry),
        formats: ['es'],
        fileName: () => `${v.name}.js`,
      },
      rollupOptions: {
        external: v.external,
        output: { entryFileNames: `${v.name}.js`, chunkFileNames: `${v.name}-[hash].js` },
      },
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[vendor] built ${v.name}.js`);
}
