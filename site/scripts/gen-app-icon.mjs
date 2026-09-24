// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// site/scripts/gen-app-icon.mjs — renders design/app-icon/app-icon.svg into the
// favicon set the site templates link: public/favicon.svg, public/favicon.ico
// and public/icons/{favicon-16x16,favicon-32x32,apple-touch-icon}.png.
//
// Lives under site/ because it borrows the site's sharp; run by hand when the
// icon changes (the outputs are committed, like the demo pictures):
//
//   cd site && node scripts/gen-app-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(REPO, 'design/app-icon/app-icon.svg');
const PUBLIC = path.join(REPO, 'public');

const svg = readFileSync(SRC);
// iOS rounds the apple-touch-icon itself; a pre-rounded one gets dark corners, so it is drawn full-bleed.
const square = Buffer.from(svg.toString().replace('<rect width="100" height="100" rx="22.5"', '<rect width="100" height="100"'));
const png = (size, src = svg) => sharp(src).resize(size, size).png().toBuffer();

// The SVG favicon is the source itself, minus its comment.
writeFileSync(path.join(PUBLIC, 'favicon.svg'), svg.toString().replace(/<!--[\s\S]*?-->\s*/g, ''));

const sizes = { 'icons/favicon-16x16.png': 16, 'icons/favicon-32x32.png': 32 };
for (const [file, size] of Object.entries(sizes)) writeFileSync(path.join(PUBLIC, file), await png(size));
writeFileSync(path.join(PUBLIC, 'icons/apple-touch-icon.png'), await png(180, square));

// favicon.ico: an ICO directory whose entries are plain PNGs (valid since Vista).
const icoSizes = [16, 32, 48];
const images = await Promise.all(icoSizes.map((s) => png(s)));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(icoSizes[i], e);
  header.writeUInt8(icoSizes[i], e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync(path.join(PUBLIC, 'favicon.ico'), Buffer.concat([header, ...images]));

console.log('wrote favicon.svg, favicon.ico, apple-touch-icon.png and', Object.keys(sizes).join(', '));
