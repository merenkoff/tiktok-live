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

// --- inject the import map into dist/index.html ---
const htmlPath = path.join(dist, 'index.html');
let html = readFileSync(htmlPath, 'utf-8');
if (html.includes('type="importmap"')) die('dist/index.html already has an import map');

const mapTag =
  `    <script type="importmap">\n` +
  `${JSON.stringify({ imports, integrity }, null, 2)}\n` +
  `    </script>\n`;

const anchor = html.indexOf('<script type="module"');
if (anchor === -1) die('no <script type="module"> entry found in dist/index.html');
html = html.slice(0, anchor) + mapTag + '  ' + html.slice(anchor);
writeFileSync(htmlPath, html);

writeFileSync(path.join(dist, '.importmap.json'), JSON.stringify({ imports, integrity }, null, 2));

console.log('[assemble-web-dist] import map injected:');
for (const [k, v] of Object.entries(imports)) console.log(`  ${k.padEnd(20)} -> ${v}`);
