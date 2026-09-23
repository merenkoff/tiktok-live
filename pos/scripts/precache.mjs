// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the tablet's service worker precaches (TechDocs/POS_PWA.md §4), as a
// pure function of the build outputs so `src/lib/precache.test.ts` can pin it.
//
//   - the closure of the `tablet.html` entry in Vite's `.vite/manifest.json`:
//     its own chunk, every static and dynamic import, every stylesheet;
//   - every file under `assets/vendor/` and `assets/platform/`: the import-map
//     chunks `assemble-web-dist.mjs` places there, PLUS the platform's lazy
//     page chunks, which are copied verbatim and are invisible to the host
//     manifest (they belong to a different Rollup run);
//   - the navigation target `/tablet/`, the web manifest and the icons.
//
// Deliberately NOT `index.html` or its chunks: the owner's admin has no
// service worker, and caching it would only inflate the install.

import { createHash } from 'node:crypto';

/**
 * @param {Record<string, {file: string, css?: string[], imports?: string[], dynamicImports?: string[]}>} manifest
 * @param {string} entry  key of the entry in the manifest, e.g. 'tablet.html'
 * @returns {string[]} files of that entry's closure, relative to dist
 */
export function entryClosure(manifest, entry) {
  const out = new Set();
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    out.add(chunk.file);
    for (const css of chunk.css ?? []) out.add(css);
    for (const dep of chunk.imports ?? []) visit(dep);
    for (const dep of chunk.dynamicImports ?? []) visit(dep);
  };
  visit(entry);
  return [...out].sort();
}

/**
 * @param {object} args
 * @param {Record<string, any>} args.manifest  Vite's `.vite/manifest.json`
 * @param {string[]} args.sharedFiles  paths under dist of `assets/vendor/**` + `assets/platform/**`
 * @param {string[]} args.extra  other files under dist to include (manifest, icons)
 * @param {string} [args.base]  Vite `base`, '/' by default
 * @returns {{ urls: string[], buildId: string }}
 */
export function buildPrecache({ manifest, sharedFiles, extra, base = '/' }) {
  const files = new Set([
    ...entryClosure(manifest, 'tablet.html'),
    ...sharedFiles,
    ...extra,
  ]);
  const urls = [`${base}tablet/`, ...[...files].sort().map((f) => `${base}${f}`)];
  // The id has to move whenever the list does, or a redeploy with the same
  // chunk names (a pure `public/` change) would never reach a tablet.
  const buildId = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);
  return { urls, buildId };
}
