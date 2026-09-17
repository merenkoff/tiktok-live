// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-demo-flowers.mjs — regenerates public/demo-flowers/*.svg.
//
// The demo flowers catalogue (migration 039) needs a picture per product. Flat
// vector illustrations rather than photographs: nothing to license, they ship
// inside the image under public/ (already mounted at '/'), they stay editable
// text instead of base64 inside a migration, and they need no upload volume.
//
//   node scripts/gen-demo-flowers.mjs public/demo-flowers
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const BG = '#F7F5F1';
const STEM = '#4E7A46';
const STEM_DARK = '#3C6036';
const LEAF = '#5C8C52';

const R = (n, d = 2) => Number(n.toFixed(d));

// `edge` is what keeps a white rose visible on a cream card: without a stroke
// the pale palettes disappeared into the background entirely.
let EDGE = 'none';
function petalRing(cx, cy, count, rx, ry, dist, fill, rot = 0, opacity = 1) {
  let out = '';
  const st = EDGE === 'none' ? '' : ` stroke="${EDGE}" stroke-width="1.6"`;
  for (let i = 0; i < count; i++) {
    const a = rot + (360 / count) * i;
    const rad = (a * Math.PI) / 180;
    const x = R(cx + Math.cos(rad) * dist);
    const y = R(cy + Math.sin(rad) * dist);
    out += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"${st} opacity="${opacity}" transform="rotate(${R(a + 90)} ${x} ${y})"/>`;
  }
  return out;
}

function stem(x = 120, top = 118, bottom = 214, leaves = true) {
  let out = `<path d="M${x} ${top} C ${x - 6} ${top + 34}, ${x + 6} ${bottom - 34}, ${x} ${bottom}" stroke="${STEM}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if (leaves) {
    out += `<ellipse cx="${x - 22}" cy="${top + 52}" rx="20" ry="9" fill="${LEAF}" transform="rotate(-24 ${x - 22} ${top + 52})"/>`;
    out += `<ellipse cx="${x + 22}" cy="${top + 78}" rx="18" ry="8" fill="${STEM_DARK}" transform="rotate(24 ${x + 22} ${top + 78})"/>`;
  }
  return out;
}

const BLOOMS = {
  rose: (c, d, l) =>
    petalRing(120, 88, 7, 26, 20, 30, l) +
    petalRing(120, 88, 6, 20, 15, 20, c, 25) +
    petalRing(120, 88, 5, 13, 10, 11, d, 50) +
    `<circle cx="120" cy="88" r="8" fill="${d}"/>` +
    `<path d="M112 88 A8 8 0 1 1 128 88 A6 6 0 1 0 116 88" fill="none" stroke="${l}" stroke-width="2.5" stroke-linecap="round"/>`,

  spray: (c, d, l) => {
    let out = '';
    for (const [x, y, s] of [[92, 74, 1], [148, 78, 0.9], [118, 104, 0.95], [120, 58, 0.72]]) {
      out += `<g transform="translate(${R(x - 120 * s)} ${R(y - 88 * s)}) scale(${s})">`;
      out += petalRing(120, 88, 6, 15, 12, 17, l) + petalRing(120, 88, 5, 10, 8, 9, c, 30);
      out += `<circle cx="120" cy="88" r="5" fill="${d}"/></g>`;
    }
    return out;
  },

  tulip: (c, d, l) =>
    `<path d="M92 66 C92 118 100 130 120 130 C140 130 148 118 148 66 C140 86 132 74 120 92 C108 74 100 86 92 66 Z" fill="${c}" stroke="${EDGE}" stroke-width="1.6"/>` +
    `<path d="M92 66 C92 104 98 120 112 127 C104 112 102 88 104 68 Z" fill="${l}"/>` +
    `<path d="M148 66 C148 104 142 120 128 127 C136 112 138 88 136 68 Z" fill="${d}"/>`,

  chrys: (c, d, l) =>
    petalRing(120, 88, 16, 26, 6, 30, l) +
    petalRing(120, 88, 14, 20, 5.5, 21, c, 12) +
    petalRing(120, 88, 10, 13, 5, 11, l, 18) +
    `<circle cx="120" cy="88" r="7" fill="${d}"/>`,

  eustoma: (c, d, l) =>
    petalRing(120, 88, 5, 25, 21, 24, l, -90) +
    petalRing(120, 88, 5, 17, 14, 15, c, -54) +
    `<circle cx="120" cy="88" r="9" fill="${d}"/>` +
    `<circle cx="120" cy="88" r="4" fill="${l}"/>`,

  gyps: (c, d, l) => {
    let out = '';
    const pts = [[120, 60], [96, 74], [144, 74], [84, 96], [156, 96], [108, 90], [132, 90], [102, 112], [138, 112], [120, 100], [120, 128], [90, 126], [150, 126]];
    for (const [x, y] of pts) {
      out += `<circle cx="${x}" cy="${y}" r="10" fill="${l}" stroke="${d}" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="3.5" fill="${d}"/>`;
    }
    out += `<circle cx="120" cy="78" r="5" fill="${d}"/>`;
    return out;
  },

  alstro: (c, d, l) => {
    let out = petalRing(120, 88, 6, 24, 14, 24, l, -90);
    out += petalRing(120, 88, 3, 16, 10, 14, c, -90);
    for (const [x, y] of [[112, 80], [128, 80], [120, 96], [106, 94], [134, 94]]) {
      out += `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="5" fill="${d}"/>`;
    }
    out += `<circle cx="120" cy="88" r="6" fill="${d}"/>`;
    return out;
  },

  peony: (c, d, l) =>
    petalRing(120, 88, 9, 25, 22, 30, l) +
    petalRing(120, 88, 8, 20, 17, 21, c, 22) +
    petalRing(120, 88, 7, 14, 12, 12, l, 44) +
    petalRing(120, 88, 5, 10, 9, 6, d, 10) +
    `<circle cx="120" cy="88" r="5" fill="${d}"/>`,

  ranunculus: (c, d, l) => {
    let out = `<circle cx="120" cy="88" r="36" fill="${l}"/>`;
    for (const [r, f] of [[30, c], [24, l], [18, c], [12, l], [6, d]]) {
      out += `<circle cx="120" cy="88" r="${r}" fill="${f}"/>`;
    }
    out += petalRing(120, 88, 10, 9, 7, 31, c, 18);
    return out;
  },

  hydrangea: (c, d, l) => {
    let out = '';
    const pts = [[120, 62], [92, 80], [148, 80], [104, 108], [136, 108], [120, 88]];
    for (const [x, y] of pts) {
      out += petalRing(x, y, 4, 12, 10, 11, l, 45);
      out += `<circle cx="${x}" cy="${y}" r="4.5" fill="${d}"/>`;
    }
    out += petalRing(120, 88, 4, 12, 10, 11, c, 45);
    return out;
  },

  euca: () => {
    let out = `<path d="M120 216 C 120 170, 120 120, 120 54" stroke="${STEM}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    let y = 66;
    let side = -1;
    while (y < 200) {
      const x = 120 + side * 26;
      out += `<circle cx="${x}" cy="${y}" r="17" fill="${side < 0 ? '#8FB58A' : '#77A173'}"/>`;
      out += `<path d="M120 ${y + 6} L ${x} ${y}" stroke="${STEM_DARK}" stroke-width="3"/>`;
      y += 26;
      side *= -1;
    }
    out += `<circle cx="120" cy="50" r="13" fill="#9CC097"/>`;
    return out;
  },

  ruscus: () => {
    let out = `<path d="M120 216 C 118 160, 122 106, 120 44" stroke="${STEM_DARK}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    let y = 62;
    let side = -1;
    while (y < 198) {
      const x = 120 + side * 30;
      out += `<path d="M120 ${y + 16} Q ${x} ${y - 18}, ${120 + side * 12} ${y - 34} Q ${120 + side * 2} ${y - 4}, 120 ${y + 16} Z" fill="${side < 0 ? '#4F8049' : '#3F6B3B'}"/>`;
      y += 28;
      side *= -1;
    }
    out += `<path d="M120 60 Q 132 30, 120 18 Q 108 30, 120 60 Z" fill="#599152"/>`;
    return out;
  },

  statice: (c, d, l) => {
    let out = '';
    for (const [x, y, s] of [[120, 52, 1.5], [90, 76, 1.35], [150, 76, 1.35], [102, 106, 1.25], [138, 106, 1.25], [120, 88, 1.45]]) {
      for (let i = 0; i < 5; i++) {
        const a = (72 * i * Math.PI) / 180;
        out += `<path d="M${R(x + Math.cos(a) * 11 * s)} ${R(y + Math.sin(a) * 11 * s)} L${R(x + Math.cos(a + 0.5) * 4 * s)} ${R(y + Math.sin(a + 0.5) * 4 * s)} L${R(x + Math.cos(a - 0.5) * 4 * s)} ${R(y + Math.sin(a - 0.5) * 4 * s)} Z" fill="${i % 2 ? l : c}"/>`;
      }
      out += `<circle cx="${x}" cy="${y}" r="${R(3 * s)}" fill="${d}"/>`;
    }
    return out;
  },
};

function flower(bloom, colors, opts = {}) {
  const [c, d, l, e] = colors;
  EDGE = e ?? 'none';
  const body = BLOOMS[bloom](c, d, l);
  const withStem = opts.noStem ? body : stem(120, opts.stemTop ?? 118) + body;
  return wrap(withStem);
}

function wrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img">` +
    `<rect width="240" height="240" rx="18" fill="${BG}"/>` +
    inner +
    `</svg>\n`;
}

// ── consumables ───────────────────────────────────────────────────────────
const KRAFT = wrap(
  `<path d="M60 76 L180 76 L150 204 L90 204 Z" fill="#C8A87C"/>` +
  `<path d="M60 76 L120 76 L120 204 L90 204 Z" fill="#D9BD93"/>` +
  `<path d="M60 76 L180 76 L170 96 L70 96 Z" fill="#B08F63"/>` +
  `<path d="M120 96 L120 204" stroke="#A98861" stroke-width="2.5" stroke-dasharray="7 7"/>`
);
const RIBBON = wrap(
  `<path d="M120 120 C 78 78, 44 96, 62 126 C 78 152, 110 140, 120 120 Z" fill="#C46A8E"/>` +
  `<path d="M120 120 C 162 78, 196 96, 178 126 C 162 152, 130 140, 120 120 Z" fill="#B85A80"/>` +
  `<path d="M120 120 L 92 196 L 116 184 Z" fill="#C46A8E"/>` +
  `<path d="M120 120 L 148 196 L 124 184 Z" fill="#B85A80"/>` +
  `<circle cx="120" cy="120" r="14" fill="#9E4A6C"/>`
);
const FOAM = wrap(
  `<path d="M56 96 L120 66 L184 96 L184 160 L120 190 L56 160 Z" fill="#6E9A63"/>` +
  `<path d="M56 96 L120 126 L120 190 L56 160 Z" fill="#5C8553"/>` +
  `<path d="M120 126 L184 96 L184 160 L120 190 Z" fill="#7FAE73"/>`
);

// ── bouquets ──────────────────────────────────────────────────────────────
function bouquetMixed(palette, blooms) {
  let out = `<path d="M120 122 L 78 200 L 162 200 Z" fill="#C8A87C"/>`;
  out += `<path d="M120 122 L 78 200 L 120 200 Z" fill="#D9BD93"/>`;
  const spots = [[76, 82, 0.62], [164, 82, 0.62], [120, 58, 0.72], [96, 116, 0.58], [144, 116, 0.58], [120, 104, 0.66]];
  spots.forEach(([x, y, s], i) => {
    const [c, d, l, e] = palette[i % palette.length];
    EDGE = e ?? 'none';
    const b = blooms[i % blooms.length];
    out += `<g transform="translate(${R(x - 120 * s)} ${R(y - 88 * s)}) scale(${s})">${BLOOMS[b](c, d, l)}</g>`;
  });
  out += `<path d="M84 150 Q 120 138, 156 150" stroke="#9E4A6C" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  return wrap(out);
}

// palettes: [base, dark, light]
const P = {
  red: ['#C62A38', '#8E1220', '#E04C58'],
  white: ['#FBFAF7', '#B9AE9C', '#FFFFFF', '#B9AE9C'],
  cream: ['#F0DDB4', '#C9AD77', '#FAF1DC', '#C9AD77'],
  pink: ['#E38AA8', '#BC5C7C', '#F3B3C7'],
  hotpink: ['#D4527E', '#A63359', '#EE86A8'],
  yellow: ['#E9B93B', '#C1901C', '#F6D77A'],
  peach: ['#E9A075', '#C1744A', '#F6C4A4'],
  blue: ['#7FA6D4', '#4F7BB0', '#AFC9E8'],
  lilac: ['#A98CC7', '#7D5FA0', '#C9B4DE'],
  green: ['#6E9A63', '#4F7A47', '#93BC88'],
};

const FILES = {
  'rose-freedom.svg': flower('rose', P.red),
  'rose-avalanche.svg': flower('rose', P.white),
  'rose-mondial.svg': flower('rose', P.cream),
  'rose-spray-bombastic.svg': flower('spray', P.pink),
  'tulip-pink.svg': flower('tulip', P.pink, { stemTop: 128 }),
  'tulip-yellow.svg': flower('tulip', P.yellow, { stemTop: 128 }),
  'chrysanthemum.svg': flower('chrys', P.yellow),
  'eustoma.svg': flower('eustoma', P.white),
  'gypsophila.svg': flower('gyps', P.white),
  'alstroemeria.svg': flower('alstro', P.pink),
  'peony.svg': flower('peony', P.hotpink),
  'ranunculus.svg': flower('ranunculus', P.peach),
  'hydrangea.svg': flower('hydrangea', P.blue),
  'eucalyptus.svg': flower('euca', P.green, { noStem: true }),
  'ruscus.svg': flower('ruscus', P.green, { noStem: true }),
  'statice.svg': flower('statice', P.lilac),
  'kraft.svg': KRAFT,
  'ribbon.svg': RIBBON,
  'foam.svg': FOAM,
  'bouquet-morning.svg': bouquetMixed([P.pink, P.green, P.pink, P.green, P.pink, P.pink], ['tulip', 'euca', 'tulip', 'euca', 'tulip', 'tulip']),
  'bouquet-compliment.svg': bouquetMixed([P.pink, P.green, P.pink, P.green, P.pink, P.pink], ['alstro', 'ruscus', 'alstro', 'ruscus', 'alstro', 'alstro']),
  'bouquet-tenderness.svg': bouquetMixed([P.red, P.green, P.red, P.green, P.red, P.red], ['rose', 'euca', 'rose', 'euca', 'rose', 'rose']),
  'bouquet-classic25.svg': bouquetMixed([P.red], ['rose']),
  'bouquet-summer.svg': bouquetMixed([P.white, P.yellow, P.lilac, P.white, P.yellow, P.lilac], ['eustoma', 'chrys', 'statice', 'eustoma', 'chrys', 'statice']),
};

let total = 0;
for (const [name, svg] of Object.entries(FILES)) {
  writeFileSync(path.join(OUT, name), svg);
  total += svg.length;
  console.log(`${name.padEnd(30)} ${String(svg.length).padStart(6)} B`);
}
console.log(`\n${Object.keys(FILES).length} files, ${(total / 1024).toFixed(1)} KB total`);
