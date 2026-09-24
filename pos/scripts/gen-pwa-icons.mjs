// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Rasterises the app icon — `design/app-icon/app-icon.svg`, concept A «Чек»,
// the same drawing the site's favicon comes from — into the tablet PWA's icons
// and the desktop cashier's Tauri icons, with the Chromium that Playwright
// already installs for the e2e suite: no image library added. Run once and
// COMMIT the output: the Docker build runs `npm ci` with no browser, and the
// Tauri build only reads `src-tauri/icons/`.
//
//   node scripts/gen-pwa-icons.mjs           # PWA icons only
//   node scripts/gen-pwa-icons.mjs --tauri   # and the Tauri set (runs `tauri icon`)
//
// Three shapes of the one drawing:
//   - squircle — the icon as drawn, transparent corners: Android «any», Windows, Linux;
//   - square   — the blue to the edges: iOS masks it itself (apple-touch-icon),
//                and Android's `maskable`, whose content must sit inside the
//                80 % safe circle, so the receipt is scaled down there;
//   - mac      — the squircle on Big Sur's grid: 824 of 1024 with room for the
//                system's shadow, or the Dock shows it a size bigger than its
//                neighbours.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const pos = path.resolve(here, '..');
const source = readFileSync(path.resolve(pos, '../design/app-icon/app-icon.svg'), 'utf8').replace(
  /<!--[\s\S]*?-->\s*/g,
  ''
);
const inner = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>'));

const BG = '<rect width="100" height="100" rx="22.5" fill="url(#bg)"/>';
const GLOSS = /<rect x="1" y="1" width="98" height="50" rx="21\.5" fill="url\(#gloss\)"\/>/;

/** The drawing inside a 100-unit box: as drawn, squared, or shrunk around its centre. */
function svg({ square = false, scale = 1 } = {}) {
  let body = square ? inner.replace(BG, BG.replace(' rx="22.5"', '')) : inner;
  if (scale !== 1 && square) {
    // Maskable: the blue stays full-bleed and only the receipt shrinks into
    // the safe circle — a scaled backdrop would leave a seam where its
    // gradient restarts. The gloss belongs to the squircle's shape, not here.
    const backdrop = BG.replace(' rx="22.5"', '');
    const art = body.replace(backdrop, '').replace(GLOSS, '');
    const shift = (100 - 100 * scale) / 2;
    body = `${backdrop}<g transform="translate(${shift} ${shift}) scale(${scale})">${art}</g>`;
  } else if (scale !== 1) {
    const shift = (100 - 100 * scale) / 2;
    body = `<g transform="translate(${shift} ${shift}) scale(${scale})">${body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
}

const pwa = path.join(pos, 'public/icons');
mkdirSync(pwa, { recursive: true });

const ICONS = [
  // [file, px, drawing]
  ['tablet-192.png', 192, svg()],
  ['tablet-512.png', 512, svg()],
  ['tablet-180.png', 180, svg({ square: true })],
  ['tablet-maskable-512.png', 512, svg({ square: true, scale: 0.8 })],
];

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pos-icons-'));
const TAURI_SOURCES = [
  ['tauri-1024.png', 1024, svg()],
  ['mac-1024.png', 1024, svg({ scale: 824 / 1024 })],
];

// A checkout whose Playwright is newer than the browsers on the machine can
// point at any Chromium it has (`PW_CHROMIUM=/path/to/chrome`).
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
async function render(size, drawing) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${drawing.replace(
      '<svg ',
      `<svg width="${size}" height="${size}" `
    )}</body></html>`
  );
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  await page.close();
  return png;
}
try {
  for (const [name, size, drawing] of ICONS) {
    const png = await render(size, drawing);
    writeFileSync(path.join(pwa, name), png);
    console.log(`[gen-pwa-icons] ${name} (${png.length} bytes)`);
  }
  if (process.argv.includes('--tauri')) {
    for (const [name, size, drawing] of TAURI_SOURCES) writeFileSync(path.join(tmp, name), await render(size, drawing));
  }
} finally {
  await browser.close();
}

if (process.argv.includes('--tauri')) {
  // `tauri icon` writes a whole platform set; the bundle config lists five,
  // so only those are copied — the rest would be files nobody reads.
  const icons = path.join(pos, 'src-tauri/icons');
  const run = (input, out) =>
    execFileSync(path.join(pos, 'node_modules/.bin/tauri'), ['icon', input, '-o', out], { cwd: pos, stdio: 'ignore' });
  const flat = path.join(tmp, 'flat');
  const mac = path.join(tmp, 'mac');
  run(path.join(tmp, 'tauri-1024.png'), flat);
  run(path.join(tmp, 'mac-1024.png'), mac);
  for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.ico']) {
    copyFileSync(path.join(flat, name), path.join(icons, name));
  }
  copyFileSync(path.join(mac, 'icon.icns'), path.join(icons, 'icon.icns'));
  console.log('[gen-pwa-icons] src-tauri/icons: 32x32.png 128x128.png 128x128@2x.png icon.ico icon.icns');
}
