// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Runs after `vite build --config vite.cashier.config.ts`. Cashier sibling of
// `assemble-web-dist.mjs` (roadmap #13 Part A): the self-hosted shared chunks
// (`scripts/build-vendor.mjs` + `vite.platform-remote.config.ts`) are content-
// hashed into `dist-cashier/assets/{vendor,platform}/` and an import map is
// injected into `dist-cashier/{index,cashier}.html` so the bare `react` /
// `react-dom` / `react-router-dom` / `zustand` / `dexie` / `@pos/platform`
// imports left external by `vite.cashier.config.ts` resolve — all INSIDE the
// app (Tauri `script-src 'self'`), no CDN. `es-module-shims` is bundled as a
// polyfill so an old WebKitGTK still resolves the map.
//
// Kept a standalone copy (not a refactor of assemble-web-dist.mjs) to leave the
// merged web path at zero regression risk.
//
//   node scripts/assemble-cashier-dist.mjs

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

const dir = path.dirname(fileURLToPath(import.meta.url));
const pos = path.resolve(dir, '..');
const dist = path.join(pos, 'dist-cashier');
const vendorSrc = path.join(pos, 'dist-remotes/vendor');
const platformSrc = path.join(pos, 'dist-remotes/platform');
const shimsSrc = path.join(pos, 'node_modules/es-module-shims/dist/es-module-shims.js');

const BASE = '/'; // Tauri serves dist-cashier from the app root

function die(msg) {
  console.error(`[assemble-cashier-dist] ${msg}`);
  process.exit(1);
}

if (!existsSync(path.join(dist, 'index.html'))) die('dist-cashier/index.html missing — run `vite build --config vite.cashier.config.ts` first.');
if (!existsSync(vendorSrc)) die('dist-remotes/vendor missing — run `node scripts/build-vendor.mjs` first.');
if (!existsSync(path.join(platformSrc, 'platform.js'))) {
  die('dist-remotes/platform/platform.js missing — run `vite build --config vite.platform-remote.config.ts` first.');
}
if (!existsSync(shimsSrc)) die('es-module-shims not installed — `npm i -D es-module-shims`.');

const short = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
const sri = (buf) => `sha384-${createHash('sha384').update(buf).digest('base64')}`;

const imports = {};
const integrity = {};

/** Copy `srcFile` to `destDir` renamed with a content hash; register it under `specifier`. */
function placeHashed(srcFile, destDir, publicDir, specifier) {
  const buf = readFileSync(srcFile);
  const ext = path.extname(srcFile);
  const name = `${path.basename(srcFile, ext)}-${short(buf)}${ext}`;
  mkdirSync(destDir, { recursive: true });
  writeFileSync(path.join(destDir, name), buf);
  const url = `${BASE}assets/${publicDir}/${name}`;
  imports[specifier] = url;
  integrity[url] = sri(buf);
  return url;
}

// --- vendors: one file per bare specifier ---
const VENDOR_SPECIFIER = {
  'react.js': 'react',
  'react-dom.js': 'react-dom',
  'react-dom-client.js': 'react-dom/client',
  'react-jsx-runtime.js': 'react/jsx-runtime',
  'react-router-dom.js': 'react-router-dom',
  'zustand.js': 'zustand',
  'dexie.js': 'dexie',
};
const vendorDest = path.join(dist, 'assets/vendor');
rmSync(vendorDest, { recursive: true, force: true });
for (const [file, specifier] of Object.entries(VENDOR_SPECIFIER)) {
  const src = path.join(vendorSrc, file);
  if (!existsSync(src)) die(`expected vendor chunk ${file} not found`);
  placeHashed(src, vendorDest, 'vendor', specifier);
}

// --- @pos/platform: hash the entry, copy its sibling async chunks verbatim ---
const platformDest = path.join(dist, 'assets/platform');
rmSync(platformDest, { recursive: true, force: true });
mkdirSync(platformDest, { recursive: true });
for (const entry of readdirSync(platformSrc)) {
  if (entry === 'platform.js') continue;
  cpSync(path.join(platformSrc, entry), path.join(platformDest, entry));
}
placeHashed(path.join(platformSrc, 'platform.js'), platformDest, 'platform', '@pos/platform');

// --- es-module-shims: polyfill for a webview without native import maps ---
const shimsBuf = readFileSync(shimsSrc);
const shimsName = `es-module-shims-${short(shimsBuf)}.js`;
writeFileSync(path.join(dist, 'assets', shimsName), shimsBuf);
const shimsUrl = `${BASE}assets/${shimsName}`;

// --- inject into dist-cashier/index.html AND cashier.html ---
const mapTag =
  `    <script async src="${shimsUrl}"></script>\n` +
  `    <script type="importmap">\n` +
  `${JSON.stringify({ imports, integrity }, null, 2)}\n` +
  `    </script>\n`;

for (const file of ['index.html', 'cashier.html']) {
  const htmlPath = path.join(dist, file);
  if (!existsSync(htmlPath)) continue;
  let html = readFileSync(htmlPath, 'utf-8');
  if (html.includes('type="importmap"')) die(`${file} already has an import map`);
  const anchor = html.indexOf('<script type="module"');
  if (anchor === -1) die(`no <script type="module"> entry in dist-cashier/${file}`);
  html = html.slice(0, anchor) + mapTag + '  ' + html.slice(anchor);
  writeFileSync(htmlPath, html);
}

writeFileSync(path.join(dist, '.importmap.json'), JSON.stringify({ imports, integrity }, null, 2));

console.log('[assemble-cashier-dist] import map injected:');
for (const [k, v] of Object.entries(imports)) console.log(`  ${k.padEnd(20)} -> ${v}`);
