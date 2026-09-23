// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Runs after the default `vite build`. Takes the self-hosted shared chunks
// (`scripts/build-vendor.mjs` + `vite.platform-remote.config.ts`), content-
// hashes them, copies them into `dist/assets/{vendor,platform}/`, and injects
// the `<script type="importmap">` into `dist/index.html` that resolves the
// bare `react` / `react-dom` / `react-router-dom` / `zustand` / `@pos/platform`
// imports left external by `vite.config.ts`. SRI hashes go in the map too.
//
// Everything is same-origin and part of this one deploy — see
// TechDocs/POS_MODULE_REMOTE_POC.md for why a missing chunk here is the same
// failure class as a missing entry chunk (accepted; retry/telemetry is a
// separate roadmap item).
//
//   node scripts/assemble-web-dist.mjs

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrecache } from './precache.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pos = path.resolve(dir, '..');
const dist = path.join(pos, 'dist');
const vendorSrc = path.join(pos, 'dist-remotes/vendor');
const platformSrc = path.join(pos, 'dist-remotes/platform');

const BASE = '/'; // keep in sync with vite `base` (default '/')

function die(msg) {
  console.error(`[assemble-web-dist] ${msg}`);
  process.exit(1);
}

if (!existsSync(path.join(dist, 'index.html'))) die('dist/index.html missing — run `vite build` first.');
if (!existsSync(vendorSrc)) die('dist-remotes/vendor missing — run `node scripts/build-vendor.mjs` first.');
if (!existsSync(path.join(platformSrc, 'platform.js'))) {
  die('dist-remotes/platform/platform.js missing — run `vite build --config vite.platform-remote.config.ts` first.');
}

const short = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const sri = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;

const imports = {};
const integrity = {};

/** Copy `file` to `destDir` renamed with a content hash; register it in the map under `specifier`. */
function placeHashed(srcFile, destDir, publicDir, specifier) {
  const buf = readFileSync(srcFile);
  const ext = path.extname(srcFile);
  const name = `${path.basename(srcFile, ext)}-${short(buf)}${ext}`;
  mkdirSync(destDir, { recursive: true });
  writeFileSync(path.join(destDir, name), buf);
  const url = `${BASE}assets/${publicDir}/${name}`;
  imports[specifier] = url;
  integrity[url] = sri(buf);
  return name;
}

// --- vendors: one file per bare specifier ---
const VENDOR_SPECIFIER = {
  'react.js': 'react',
  'react-dom.js': 'react-dom',
  'react-dom-client.js': 'react-dom/client',
  'react-jsx-runtime.js': 'react/jsx-runtime',
  'react-router-dom.js': 'react-router-dom',
  'zustand.js': 'zustand',
  // Web loads Dexie too (offline-disabled, but `platform.js` `new Dexie()`s on
  // import) — mapping it here shares the one copy instead of two dead ones.
  'dexie.js': 'dexie',
};
const vendorDest = path.join(dist, 'assets/vendor');
rmSync(vendorDest, { recursive: true, force: true });
for (const [file, specifier] of Object.entries(VENDOR_SPECIFIER)) {
  const src = path.join(vendorSrc, file);
  if (!existsSync(src)) die(`expected vendor chunk ${file} not found`);
  placeHashed(src, vendorDest, 'vendor', specifier);
}

// --- @pos/platform: hash the entry, copy its sibling async chunks ---
// A sibling that reaches back into the entry (`offline-*.js` does, for the
// stores `useAuth`'s lazy `import('../offline')` shares with it) names it as
// Rollup emitted it, `./platform.js`. Once the entry is renamed that import is
// a 404 — which is what every login on the tablet, and every offline login on
// the desktop, ran into. So the siblings are copied with the reference
// rewritten to the hashed name.
const platformDest = path.join(dist, 'assets/platform');
rmSync(platformDest, { recursive: true, force: true });
mkdirSync(platformDest, { recursive: true });
const platformName = placeHashed(path.join(platformSrc, 'platform.js'), platformDest, 'platform', '@pos/platform');
for (const entry of readdirSync(platformSrc)) {
  if (entry === 'platform.js') continue;
  const src = path.join(platformSrc, entry);
  if (entry.endsWith('.js')) {
    const text = readFileSync(src, 'utf-8').replaceAll('./platform.js', `./${platformName}`);
    writeFileSync(path.join(platformDest, entry), text);
  } else {
    cpSync(src, path.join(platformDest, entry));
  }
}

// --- inject the import map into dist/index.html AND dist/tablet.html ---
const mapTag =
  `    <script type="importmap">\n` +
  `${JSON.stringify({ imports, integrity }, null, 2)}\n` +
  `    </script>\n`;

for (const file of ['index.html', 'tablet.html']) {
  const htmlPath = path.join(dist, file);
  if (!existsSync(htmlPath)) die(`dist/${file} missing — run \`vite build\` first.`);
  let html = readFileSync(htmlPath, 'utf-8');
  if (html.includes('type="importmap"')) die(`dist/${file} already has an import map`);
  const anchor = html.indexOf('<script type="module"');
  if (anchor === -1) die(`no <script type="module"> entry found in dist/${file}`);
  html = html.slice(0, anchor) + mapTag + '  ' + html.slice(anchor);
  writeFileSync(htmlPath, html);
}

writeFileSync(path.join(dist, '.importmap.json'), JSON.stringify({ imports, integrity }, null, 2));

console.log('[assemble-web-dist] import map injected:');
for (const [k, v] of Object.entries(imports)) console.log(`  ${k.padEnd(20)} -> ${v}`);

// --- the tablet PWA: service worker with the precache list, and serve.json ---
// (TechDocs/POS_PWA.md §3–4). The worker is a template under `sw/`; the list
// is computed from what this script just laid out plus Vite's manifest.
const viteManifestPath = path.join(dist, '.vite/manifest.json');
if (!existsSync(viteManifestPath)) die('dist/.vite/manifest.json missing — vite.config.ts must set build.manifest.');
const viteManifest = JSON.parse(readFileSync(viteManifestPath, 'utf-8'));

function filesUnder(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]
  );
}

const { urls: precache, buildId } = buildPrecache({
  manifest: viteManifest,
  sharedFiles: [
    ...filesUnder(vendorDest, 'assets/vendor/'),
    ...filesUnder(platformDest, 'assets/platform/'),
  ],
  extra: ['tablet.webmanifest', ...filesUnder(path.join(dist, 'icons'), 'icons/')],
  base: BASE,
});
for (const url of precache) {
  if (url === `${BASE}tablet/`) continue;
  if (!existsSync(path.join(dist, url.slice(BASE.length)))) die(`precache names a file that is not in dist: ${url}`);
}

const swTemplate = readFileSync(path.join(pos, 'sw/tablet-sw.js'), 'utf-8');
const sw = swTemplate
  .replace("'__BUILD_ID__'", JSON.stringify(buildId))
  .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
if (sw.includes('__BUILD_ID__') || sw.includes('__PRECACHE__')) die('sw/tablet-sw.js placeholders not replaced');
writeFileSync(path.join(dist, 'tablet-sw.js'), sw);

cpSync(path.join(pos, 'serve.json'), path.join(dist, 'serve.json'));

console.log(`[assemble-web-dist] tablet-sw.js: build ${buildId}, ${precache.length} precached URLs`);
