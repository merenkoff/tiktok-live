// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Rasterises the tablet PWA's icons from one inline SVG with the Chromium that
// Playwright already installs for the e2e suite — no image library added for
// four PNGs. Run once and COMMIT the output (`public/icons/`): the Docker build
// runs `npm ci` with no browser, so generating at build time is not an option.
//
//   node scripts/gen-pwa-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(out, { recursive: true });

/**
 * A receipt on the shop's blue. `pad` is the maskable safe zone: Android may
 * clip a maskable icon to a circle inscribed in the 80% centre, so the glyph
 * of that variant sits well inside it.
 */
function svg(size, pad) {
  const inner = size * (1 - 2 * pad);
  const x = size * pad;
  const r = inner * 0.18;
  const rw = inner * 0.44;
  const rh = inner * 0.6;
  const rx = x + (inner - rw) / 2;
  const ry = x + (inner - rh) / 2;
  const line = (i) =>
    `<rect x="${rx + rw * 0.18}" y="${ry + rh * (0.22 + i * 0.16)}" width="${rw * (i === 3 ? 0.4 : 0.64)}" height="${rh * 0.06}" rx="${rh * 0.03}" fill="#006aff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#006aff"/>
  <rect x="${x}" y="${x}" width="${inner}" height="${inner}" rx="${r}" fill="#006aff"/>
  <path d="M${rx} ${ry} h${rw} v${rh * 0.9} l${-rw * 0.1} ${rh * 0.1} l${-rw * 0.1} ${-rh * 0.1} l${-rw * 0.1} ${rh * 0.1} l${-rw * 0.1} ${-rh * 0.1} l${-rw * 0.1} ${rh * 0.1} l${-rw * 0.1} ${-rh * 0.1} l${-rw * 0.1} ${rh * 0.1} l${-rw * 0.1} ${-rh * 0.1} l${-rw * 0.1} ${rh * 0.1} l${-rw * 0.1} ${-rh * 0.1} Z" fill="#ffffff"/>
  ${[0, 1, 2, 3].map(line).join('\n  ')}
</svg>`;
}

const ICONS = [
  ['tablet-192.png', 192, 0.08],
  ['tablet-512.png', 512, 0.08],
  ['tablet-180.png', 180, 0.08],
  ['tablet-maskable-512.png', 512, 0.2],
];

// A checkout whose Playwright is newer than the browsers on the machine can
// point at any Chromium it has (`PW_CHROMIUM=/path/to/chrome`).
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
try {
  for (const [name, size, pad] of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0">${svg(size, pad)}</body></html>`);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
    writeFileSync(path.join(out, name), png);
    console.log(`[gen-pwa-icons] ${name} (${png.length} bytes)`);
    await page.close();
  }
} finally {
  await browser.close();
}
