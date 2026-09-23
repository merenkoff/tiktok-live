// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-demo-clothing.mjs — regenerates public/demo-clothing/*.svg.
//
// The demo clothing catalogue (migration 055) needs a picture per product, the
// same way the flowers, café and restaurant demos do: flat vector garments,
// nothing to license, shipped inside the image under public/ (already mounted
// at '/'), editable text instead of base64 in a migration.
//
// One file per PRODUCT, not per variant: the picture hangs on
// `pos_products.image_url`, and colour lives on the variant. Each garment is
// drawn in its first variant's colour so the tile and the caption agree.
//
//   node scripts/gen-demo-clothing.mjs public/demo-clothing
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/gen-demo-clothing.mjs <out-dir>');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const BG = '#F7F5F1';
const INK = '#2B2B2B';

// [base, shade, edge?] — the shade is the fold/seam colour that gives a flat
// garment its silhouette without a stroke; `edge` is what keeps a white shirt
// visible on a cream card (the same trick the white roses use).
const C = {
  black: ['#2B2B2B', '#171717'],
  white: ['#FBFAF7', '#DED9CF', '#B9AE9C'],
  beige: ['#D9C4A5', '#B89E7A'],
  graphite: ['#5A5D63', '#3E4146'],
  grey: ['#9A9CA0', '#75777B'],
  milk: ['#F1E9DC', '#D3C7B3'],
  blue: ['#4C6C9C', '#33507A'],
  lightblue: ['#8FB0D8', '#6A8FBF'],
  khaki: ['#8B8A5E', '#66653F'],
  skyblue: ['#B7D1EA', '#8FB3D6'],
  terracotta: ['#C0654A', '#95472F'],
  brown: ['#7A4E2D', '#573418'],
  olive: ['#6F7A4C', '#525B35'],
};

/** Stroke attributes for a palette with an `edge`, empty otherwise. */
const st = ([, , edge]) => (edge ? ` stroke="${edge}" stroke-width="2"` : '');

function card(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img"><rect width="240" height="240" rx="18" fill="${BG}"/>${inner}</svg>\n`;
}

/** Crew-neck tee; `long` gives it sleeves to the wrist (a sweatshirt), `hood` a hood. */
function top([base, shade], { long = false, hood = false, oversize = false, pocket = false } = {}) {
  const w = oversize ? 8 : 0;
  const sleeveEnd = long ? 196 : 118;
  const sleeveX = long ? 30 : 26;
  let out = '';
  // sleeves
  out += `<path d="M${72 - w} 62 L${sleeveX} 92 L${sleeveX + 18} ${sleeveEnd} L${74 - w} ${long ? 176 : 104} Z" fill="${shade}"/>`;
  out += `<path d="M${168 + w} 62 L${210 - sleeveX + 26} 92 L${210 - sleeveX + 8} ${sleeveEnd} L${166 + w} ${long ? 176 : 104} Z" fill="${shade}"/>`;
  // body
  out += `<path d="M${72 - w} 62 L102 50 Q120 66 138 50 L${168 + w} 62 L${162 + w} 206 L${78 - w} 206 Z" fill="${base}"/>`;
  // collar
  if (hood) {
    out += `<path d="M96 52 Q120 20 144 52 Q120 74 96 52 Z" fill="${shade}"/>`;
    out += `<path d="M112 70 L110 108 M128 70 L130 108" stroke="${shade}" stroke-width="4" stroke-linecap="round"/>`;
  } else {
    out += `<path d="M102 50 Q120 68 138 50 Q120 60 102 50 Z" fill="${shade}"/>`;
  }
  if (pocket) out += `<path d="M90 156 L150 156 L144 190 L96 190 Z" fill="${shade}"/>`;
  if (long) out += `<rect x="${78 - w}" y="196" width="${84 + 2 * w}" height="12" rx="4" fill="${shade}"/>`;
  return card(out);
}

function shirt(colors) {
  const [base, shade] = colors;
  let out = '';
  out += `<path d="M72 60 L32 86 L44 120 L74 110 Z" fill="${shade}"/>`;
  out += `<path d="M168 60 L208 86 L196 120 L166 110 Z" fill="${shade}"/>`;
  out += `<path d="M72 60 L104 48 L120 70 L136 48 L168 60 L160 208 L80 208 Z" fill="${base}"${st(colors)}/>`;
  out += `<path d="M104 48 L120 70 L110 64 Z M136 48 L120 70 L130 64 Z" fill="${shade}"/>`;
  out += `<path d="M120 70 L120 208" stroke="${shade}" stroke-width="2.5"/>`;
  for (const y of [92, 116, 140, 164, 188]) out += `<circle cx="120" cy="${y}" r="2.6" fill="${INK}" opacity="0.7"/>`;
  out += `<path d="M86 66 L106 66 L104 84 L88 84 Z" fill="${shade}" opacity="0.7"/>`;
  return card(out);
}

function jeans([base, shade], { wide = false } = {}) {
  const flare = wide ? 10 : 0;
  let out = '';
  out += `<path d="M76 44 L164 44 L172 208 L${130 + flare} 208 L120 106 L${110 - flare} 208 L68 208 Z" fill="${base}"/>`;
  out += `<rect x="76" y="44" width="88" height="12" fill="${shade}"/>`;
  out += `<path d="M120 56 L120 106" stroke="${shade}" stroke-width="3"/>`;
  out += `<path d="M84 60 Q100 66 108 62 M156 60 Q140 66 132 62" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  out += `<path d="M112 58 Q120 64 118 84" stroke="${shade}" stroke-width="2.5" fill="none"/>`;
  return card(out);
}

function cargo([base, shade]) {
  let out = jeans([base, shade], { wide: true }).replace(/<\/svg>\n$/, '');
  out += `<rect x="78" y="130" width="24" height="26" rx="3" fill="${shade}"/>`;
  out += `<rect x="138" y="130" width="24" height="26" rx="3" fill="${shade}"/>`;
  return out + '</svg>\n';
}

function dress([base, shade]) {
  let out = '';
  out += `<path d="M88 48 L108 44 Q120 60 132 44 L152 48 L158 96 L146 104 L172 212 L68 212 L94 104 L82 96 Z" fill="${base}"/>`;
  out += `<path d="M108 44 Q120 60 132 44 Q120 54 108 44 Z" fill="${shade}"/>`;
  out += `<path d="M94 104 L146 104" stroke="${shade}" stroke-width="4"/>`;
  out += `<path d="M110 110 L102 212 M130 110 L138 212" stroke="${shade}" stroke-width="2" opacity="0.6"/>`;
  return card(out);
}

function skirt([base, shade]) {
  let out = '';
  out += `<path d="M84 66 L156 66 L182 206 L58 206 Z" fill="${base}"/>`;
  out += `<rect x="84" y="60" width="72" height="12" rx="3" fill="${shade}"/>`;
  for (const x of [72, 88, 104, 120, 136, 152, 168]) {
    out += `<path d="M${120 + (x - 120) * 0.45} 72 L${x} 206" stroke="${shade}" stroke-width="2" opacity="0.7"/>`;
  }
  return card(out);
}

function jacket([base, shade]) {
  let out = '';
  out += `<path d="M70 66 L28 96 L40 172 L72 164 Z" fill="${shade}"/>`;
  out += `<path d="M170 66 L212 96 L200 172 L168 164 Z" fill="${shade}"/>`;
  out += `<path d="M70 66 L100 54 L120 62 L140 54 L170 66 L164 200 L76 200 Z" fill="${base}"/>`;
  out += `<rect x="76" y="190" width="88" height="14" rx="5" fill="${shade}"/>`;
  out += `<path d="M100 54 Q120 46 140 54 Q120 70 100 54 Z" fill="${shade}"/>`;
  out += `<path d="M120 62 L120 190" stroke="${shade}" stroke-width="6"/>`;
  out += `<rect x="86" y="128" width="22" height="30" rx="4" fill="${shade}" opacity="0.7"/>`;
  out += `<rect x="132" y="128" width="22" height="30" rx="4" fill="${shade}" opacity="0.7"/>`;
  return card(out);
}

function sneakers(colors) {
  const [base, shade] = colors;
  let out = '';
  out += `<path d="M36 150 Q40 128 66 120 L112 96 Q126 100 140 118 L190 140 Q212 150 210 168 L36 168 Z" fill="${base}"${st(colors)}/>`;
  out += `<path d="M34 168 L212 168 Q214 186 196 188 L48 188 Q30 186 34 168 Z" fill="${shade}"/>`;
  out += `<path d="M66 120 Q104 116 140 118" stroke="${shade}" stroke-width="3" fill="none"/>`;
  out += `<path d="M96 106 L118 138 M110 100 L132 132 M124 96 L142 124" stroke="${shade}" stroke-width="3" stroke-linecap="round"/>`;
  out += `<path d="M150 124 Q176 128 190 140" stroke="${INK}" stroke-width="4" fill="none" opacity="0.5"/>`;
  return card(out);
}

function cap([base, shade]) {
  let out = '';
  out += `<path d="M60 128 Q60 66 120 66 Q180 66 180 128 Z" fill="${base}"/>`;
  out += `<path d="M120 66 L120 128" stroke="${shade}" stroke-width="3"/>`;
  out += `<path d="M90 76 L104 128 M150 76 L136 128" stroke="${shade}" stroke-width="2.5"/>`;
  out += `<path d="M52 128 L188 128 Q194 142 186 146 L60 146 Q46 142 52 128 Z" fill="${shade}"/>`;
  out += `<path d="M60 146 L20 154 Q16 140 50 128" fill="${shade}"/>`;
  out += `<circle cx="120" cy="64" r="5" fill="${shade}"/>`;
  return card(out);
}

function socks(colors) {
  const [base, shade] = colors;
  const sock = (dx) =>
    `<g transform="translate(${dx} 0)"><path d="M84 46 L124 46 L124 128 Q150 136 154 166 Q152 190 128 194 L104 194 Q84 190 84 168 Z" fill="${base}"${st(colors)}/>` +
    `<rect x="84" y="40" width="40" height="14" rx="4" fill="${shade}"/>` +
    `<path d="M84 168 Q104 178 128 194" stroke="${shade}" stroke-width="4" fill="none"/></g>`;
  return card(sock(-30) + sock(30));
}

function belt([base, shade]) {
  let out = '';
  out += `<path d="M40 100 Q120 60 200 100 Q210 130 200 160 Q120 200 40 160 Q30 130 40 100 Z" fill="${base}"/>`;
  out += `<path d="M40 100 Q120 60 200 100 Q120 78 40 100 Z" fill="${shade}"/>`;
  out += `<rect x="150" y="104" width="34" height="48" rx="8" fill="none" stroke="#C9A24A" stroke-width="7"/>`;
  out += `<path d="M167 108 L167 148" stroke="#C9A24A" stroke-width="5" stroke-linecap="round"/>`;
  for (const x of [66, 84, 102, 120]) out += `<circle cx="${x}" cy="128" r="3.5" fill="${shade}"/>`;
  return card(out);
}

function bag([base, shade]) {
  let out = '';
  out += `<path d="M80 96 Q80 40 120 40 Q160 40 160 96" stroke="${shade}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  out += `<path d="M56 96 L184 96 L176 208 L64 208 Z" fill="${base}"/>`;
  out += `<path d="M56 96 L184 96 L182 112 L58 112 Z" fill="${shade}"/>`;
  out += `<path d="M96 150 L144 150" stroke="${shade}" stroke-width="4" stroke-linecap="round"/>`;
  return card(out);
}

const FILES = {
  'tee-basic.svg': top(C.black),
  'tee-oversize.svg': top(C.beige, { oversize: true }),
  'hoodie.svg': top(C.grey, { long: true, hood: true, pocket: true }),
  'sweatshirt.svg': top(C.milk, { long: true }),
  'jeans-slim.svg': jeans(C.blue),
  'jeans-wide.svg': jeans(C.lightblue, { wide: true }),
  'cargo.svg': cargo(C.khaki),
  'shirt-linen.svg': shirt(C.white),
  'dress-midi.svg': dress(C.terracotta),
  'skirt-pleated.svg': skirt(C.beige),
  'jacket-bomber.svg': jacket(C.olive),
  'sneakers.svg': sneakers(C.white),
  'cap.svg': cap(C.black),
  'socks.svg': socks(C.white),
  'belt.svg': belt(C.brown),
  'bag-tote.svg': bag(C.beige),
};

let total = 0;
for (const [name, svg] of Object.entries(FILES)) {
  writeFileSync(path.join(OUT, name), svg);
  total += svg.length;
  console.log(`${name.padEnd(24)} ${String(svg.length).padStart(6)} B`);
}
console.log(`\n${Object.keys(FILES).length} files, ${(total / 1024).toFixed(1)} KB total`);
