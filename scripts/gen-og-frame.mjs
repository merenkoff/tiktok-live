#!/usr/bin/env node
// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-og-frame.mjs — the brand frame of a guest menu's Open Graph
// picture (TechDocs/POS_QR_MENU_FEEDBACK.md §12, phase F15): 1200×630, the
// POS-blue panel with the «LiveShop» mark and the «QR-МЕНЮ» eyebrow on the
// left — the look of the site's `public/og/*.png` — and an empty light half
// on the right, where the server puts the place's logo at request time.
//
// Rendered HERE, on a machine with fonts, and committed as
// `public/menu-assets/og-frame.png`: the production image (`node:20-alpine`)
// has no fonts, so `sharp` there composes pictures only and never draws text
// (decision Д37). Re-run after changing the SVG below:
//
//   node scripts/gen-og-frame.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'public', 'menu-assets', 'og-frame.png');

const FONT = "Inter, 'Inter Variable', 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="460" height="630" fill="#0A6CFF"/>
  <rect x="460" width="740" height="630" fill="#F2F5F7"/>
  <circle cx="64" cy="219" r="7" fill="#FFFFFF"/>
  <text x="84" y="229" font-family="${FONT}" font-weight="700" font-size="26" fill="#FFFFFF">LiveShop</text>
  <text x="58" y="278" font-family="${FONT}" font-weight="700" font-size="15" letter-spacing="2.5" fill="#BFD6FF">QR-МЕНЮ</text>
  <text x="58" y="330" font-family="${FONT}" font-weight="700" font-size="40" fill="#FFFFFF">Меню, ціни</text>
  <text x="58" y="378" font-family="${FONT}" font-weight="700" font-size="40" fill="#FFFFFF">й стоп-лист</text>
  <text x="58" y="426" font-family="${FONT}" font-weight="700" font-size="40" fill="#FFFFFF">наживо.</text>
</svg>`;

await sharp(Buffer.from(svg), { density: 144 }).resize(1200, 630).png({ compressionLevel: 9 }).toFile(OUT);
const meta = await sharp(OUT).metadata();
console.log(`${path.relative(process.cwd(), OUT)}: ${meta.format} ${meta.width}×${meta.height}`);
