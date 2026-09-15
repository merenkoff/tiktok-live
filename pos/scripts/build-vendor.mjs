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
//
// Deliberately Rollup, not `vite.build()`. The whole job here is CJS→ESM
// repackaging where the *other* vendors stay external, and React 18 ships no
// ESM build — so react-dom's CJS body contains a bare `require("react")` that
// something has to rewrite into an import of the external. Only
// @rollup/plugin-commonjs does that. Vite used to give it to us for free by
// bundling with Rollup; Vite 8 bundles with Rolldown, which instead emits a
// runtime `require()` shim that throws in the browser ("Calling `require` for
// \"react-dom\" in an environment that doesn't support it") and left the built
// app dead on boot. esbuild has the same gap. Owning the bundler here keeps
// these chunks independent of whatever Vite ships next.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { transform } from 'esbuild';

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

for (const v of VENDORS) {
  const bundle = await rollup({
    input: path.join(stubs, v.entry),
    external: v.external,
    // React's dev/prod split is a `process.env.NODE_ENV` check inside the CJS
    // body; without this the chunk carries the development build.
    plugins: [
      replace({
        preventAssignment: true,
        values: { 'process.env.NODE_ENV': '"production"' },
      }),
      nodeResolve({
        browser: true,
        exportConditions: ['production', 'browser', 'module', 'import', 'default'],
      }),
      commonjs(),
      {
        name: 'esbuild-minify',
        async renderChunk(code) {
          const out = await transform(code, { minify: true, target: 'es2020' });
          return { code: out.code, map: null };
        },
      },
    ],
    // Rollup has no minifier of its own; the previous vite lib build used
    // `minify: 'esbuild'`, so keep that exact tool and target.
    onwarn(warning, warn) {
      // The stubs deliberately re-export a CJS default; that mixed-export
      // warning is the expected shape here, not a problem to fix.
      if (warning.code === 'MIXED_EXPORTS') return;
      // react-router 7 marks its modules "use client"; that directive is for
      // RSC bundlers and carries nothing we need in a plain browser chunk.
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
      warn(warning);
    },
  });

  await bundle.write({
    file: path.join(outDir, `${v.name}.js`),
    format: 'es',
    exports: 'named',
  });
  await bundle.close();

  // eslint-disable-next-line no-console
  console.log(`[vendor] built ${v.name}.js`);
}
