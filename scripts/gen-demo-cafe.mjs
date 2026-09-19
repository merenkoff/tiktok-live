// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-demo-cafe.mjs — regenerates public/demo-cafe/*.svg.
//
// The demo café catalogue (migration 048) needs a picture per product, the
// same way the flowers demo does (`gen-demo-flowers.mjs`): flat vector
// illustrations, nothing to license, shipped inside the image under public/
// (already mounted at '/'), editable text instead of base64 in a migration.
//
//   node scripts/gen-demo-cafe.mjs public/demo-cafe
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const BG = '#F7F5F1';
const INK = '#3B2F2A';
const CREAM = '#FFF8EC';
const PAPER = '#F1E6D2';
const PAPER_DARK = '#D9C8A9';
const COFFEE = '#5A3A22';
const COFFEE_LIGHT = '#8A5A36';
const LATTE = '#C99A6B';
const FOAM = '#F5EBDD';
const COCOA = '#7A4A32';
const TEA = '#B7772F';
const GREEN = '#6E9A63';
const GREEN_DARK = '#4F7A47';
const SUGAR = '#FFFFFF';
const BLUE = '#7FA6D4';
const BLUE_DARK = '#4F7BB0';
const BUTTER = '#F3CF5A';
const CHEESE = '#F0B94A';
const BREAD = '#D9A45B';
const BREAD_CRUST = '#A86B2E';

function card(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><rect width="240" height="240" fill="${BG}"/>${inner}</svg>`;
}

/** A takeaway cup, lid on: the shape every hot drink leaves the counter in. */
function takeaway({ body = PAPER, band = PAPER_DARK, lid = INK, badge = null } = {}) {
  let out = '';
  out += `<path d="M72 72 L168 72 L156 202 Q120 210 84 202 Z" fill="${body}"/>`;
  out += `<path d="M78 112 L162 112 L157 150 L83 150 Z" fill="${band}"/>`;
  out += `<rect x="62" y="56" width="116" height="18" rx="5" fill="${lid}"/>`;
  out += `<rect x="104" y="46" width="32" height="12" rx="4" fill="${lid}"/>`;
  if (badge) {
    out += `<circle cx="120" cy="131" r="17" fill="${badge}"/>`;
  }
  return out;
}

/** An open cup seen from slightly above: the drink itself is visible. */
function openCup({ liquid, foam = null, art = false, handle = false, body = CREAM } = {}) {
  let out = '';
  if (handle) {
    out += `<path d="M164 112 C 200 108, 200 160, 164 160" stroke="${body}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  }
  out += `<path d="M64 96 L176 96 L166 196 Q120 206 74 196 Z" fill="${body}"/>`;
  out += `<ellipse cx="120" cy="96" rx="58" ry="20" fill="${body}"/>`;
  out += `<ellipse cx="120" cy="96" rx="48" ry="15" fill="${liquid}"/>`;
  if (foam) {
    out += `<ellipse cx="120" cy="96" rx="38" ry="11" fill="${foam}"/>`;
  }
  if (art) {
    out += `<path d="M120 84 C 112 88, 112 98, 120 104 C 128 98, 128 88, 120 84 Z" fill="${liquid}" opacity="0.9"/>`;
    out += `<path d="M120 90 L120 106" stroke="${liquid}" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  out += `<ellipse cx="120" cy="196" rx="46" ry="10" fill="${INK}" opacity="0.08"/>`;
  return out;
}

function steam(x = 120, y = 40) {
  let out = '';
  for (const dx of [-16, 0, 16]) {
    out += `<path d="M${x + dx} ${y + 30} C ${x + dx - 6} ${y + 20}, ${x + dx + 6} ${y + 10}, ${x + dx} ${y}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.25"/>`;
  }
  return out;
}

/** A milk carton with a coloured cap and stripe; the colour says which milk. */
function carton(accent, label) {
  let out = '';
  out += `<path d="M82 78 L158 78 L158 200 L82 200 Z" fill="${SUGAR}" stroke="${PAPER_DARK}" stroke-width="2"/>`;
  out += `<path d="M82 78 L100 50 L140 50 L158 78 Z" fill="${PAPER}" stroke="${PAPER_DARK}" stroke-width="2"/>`;
  out += `<rect x="108" y="38" width="24" height="14" rx="4" fill="${accent}"/>`;
  out += `<rect x="82" y="120" width="76" height="26" fill="${accent}"/>`;
  out += `<text x="120" y="138" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="${SUGAR}" text-anchor="middle">${label}</text>`;
  return out;
}

const bean = (cx, cy, rot = 0, fill = COFFEE) =>
  `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="22" ry="15" fill="${fill}"/><path d="M${cx - 14} ${cy - 6} Q ${cx} ${cy + 2}, ${cx + 14} ${cy + 8}" stroke="${BG}" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;

const BEANS = [
  bean(84, 96, -30),
  bean(150, 88, 20, COFFEE_LIGHT),
  bean(120, 132, 60),
  bean(76, 160, 15, COFFEE_LIGHT),
  bean(152, 156, -40),
  bean(118, 186, 30, COFFEE_LIGHT),
].join('');

function sugarCubes() {
  const cube = (x, y) =>
    `<path d="M${x} ${y} L${x + 40} ${y} L${x + 52} ${y - 12} L${x + 12} ${y - 12} Z" fill="${PAPER}"/><rect x="${x}" y="${y}" width="40" height="34" fill="${SUGAR}" stroke="${PAPER_DARK}" stroke-width="2"/><path d="M${x + 40} ${y} L${x + 52} ${y - 12} L${x + 52} ${y + 22} L${x + 40} ${y + 34} Z" fill="${PAPER_DARK}"/>`;
  return cube(66, 120) + cube(120, 132) + cube(94, 78);
}

const WATER_DROP = `<path d="M120 44 C 92 96, 70 118, 70 150 A 50 50 0 0 0 170 150 C 170 118, 148 96, 120 44 Z" fill="${BLUE}"/><path d="M100 150 A 20 20 0 0 0 120 172" stroke="${SUGAR}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.9"/>`;

function bowl(contents, contentsDark) {
  return `<path d="M52 128 L188 128 Q188 196 120 196 Q52 196 52 128 Z" fill="${CREAM}"/><ellipse cx="120" cy="128" rx="68" ry="18" fill="${PAPER}"/><ellipse cx="120" cy="126" rx="56" ry="13" fill="${contents}"/><path d="M84 122 Q 120 106, 156 122" stroke="${contentsDark}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}

function leaves(color, dark) {
  const leaf = (cx, cy, rot) =>
    `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="34" ry="14" fill="${color}"/><path d="M${cx - 28} ${cy} L${cx + 28} ${cy}" stroke="${dark}" stroke-width="2.5"/></g>`;
  return leaf(90, 104, -30) + leaf(150, 120, 20) + leaf(112, 158, -10);
}

function cupStack() {
  const cup = (y, w) =>
    `<path d="M${120 - w} ${y} L${120 + w} ${y} L${120 + w - 10} ${y + 40} L${120 - w + 10} ${y + 40} Z" fill="${PAPER}" stroke="${PAPER_DARK}" stroke-width="2"/><ellipse cx="120" cy="${y}" rx="${w}" ry="9" fill="${CREAM}" stroke="${PAPER_DARK}" stroke-width="2"/>`;
  return cup(150, 42) + cup(118, 46) + cup(86, 50);
}

const LID = `<ellipse cx="120" cy="130" rx="76" ry="30" fill="${INK}"/><ellipse cx="120" cy="122" rx="76" ry="30" fill="#5A4A44"/><ellipse cx="120" cy="120" rx="30" ry="11" fill="${INK}"/><rect x="104" y="108" width="32" height="10" rx="4" fill="${INK}"/>`;

const BREAD_SLICE = `<path d="M62 106 Q62 66 92 66 Q108 52 120 62 Q132 52 148 66 Q178 66 178 106 L178 190 Q178 200 168 200 L72 200 Q62 200 62 190 Z" fill="${BREAD_CRUST}"/><path d="M74 110 Q74 80 98 80 Q110 70 120 78 Q130 70 142 80 Q166 80 166 110 L166 186 L74 186 Z" fill="${BREAD}"/>`;

const CHEESE_WEDGE = `<path d="M50 160 L190 100 L190 170 L50 190 Z" fill="${CHEESE}"/><path d="M50 160 L190 100 L150 84 L50 138 Z" fill="#F6D27A"/><circle cx="110" cy="150" r="9" fill="#D89A2B"/><circle cx="150" cy="132" r="6" fill="#D89A2B"/><circle cx="84" cy="172" r="5" fill="#D89A2B"/>`;

const BUTTER_BLOCK = `<path d="M56 120 L150 96 L184 112 L90 136 Z" fill="#F8DE7E"/><path d="M56 120 L90 136 L90 186 L56 170 Z" fill="#E2B93A"/><path d="M90 136 L184 112 L184 162 L90 186 Z" fill="${BUTTER}"/>`;

const SYRUP = `<rect x="94" y="46" width="52" height="22" rx="5" fill="${INK}"/><path d="M96 68 L144 68 L156 100 L156 196 Q156 206 146 206 L94 206 Q84 206 84 196 L84 100 Z" fill="#C97B3A"/><rect x="92" y="116" width="56" height="44" rx="4" fill="${CREAM}"/><path d="M84 100 L156 100" stroke="#8A4E1F" stroke-width="3"/>`;

const CROISSANT = `<path d="M40 150 C 40 100, 90 70, 140 88 C 190 106, 210 140, 196 176 C 186 196, 160 190, 152 172 C 146 156, 150 140, 136 130 C 118 118, 96 130, 90 152 C 84 178, 62 186, 48 174 C 42 168, 40 160, 40 150 Z" fill="${BREAD}"/><path d="M96 96 L112 124 M128 90 L134 126 M154 104 L148 136" stroke="${BREAD_CRUST}" stroke-width="4" stroke-linecap="round" fill="none"/>`;

const CHEESECAKE = `<path d="M44 150 L120 92 L196 150 L196 178 L120 220 L44 178 Z" fill="#F3E4C6"/><path d="M44 150 L120 92 L196 150 L120 196 Z" fill="${CREAM}"/><path d="M44 178 L44 150 L120 196 L120 220 Z" fill="#E6C99B"/><path d="M196 178 L196 150 L120 196 L120 220 Z" fill="#D9B888"/><circle cx="120" cy="120" r="9" fill="#C8443E"/><circle cx="104" cy="132" r="7" fill="#D8524C"/>`;

const SYRNYK = `<ellipse cx="120" cy="170" rx="70" ry="22" fill="${BREAD_CRUST}"/><ellipse cx="120" cy="160" rx="70" ry="22" fill="${BREAD}"/><ellipse cx="120" cy="136" rx="62" ry="20" fill="${BREAD_CRUST}"/><ellipse cx="120" cy="126" rx="62" ry="20" fill="#E4B36C"/><ellipse cx="120" cy="120" rx="30" ry="9" fill="${CREAM}"/>`;

const SANDWICH = `<path d="M40 180 L200 180 L120 70 Z" fill="${BREAD_CRUST}"/><path d="M52 172 L188 172 L120 84 Z" fill="${BREAD}"/><path d="M46 176 L194 176 L194 188 L46 188 Z" fill="${CHEESE}"/><path d="M50 188 L190 188 L190 198 L50 198 Z" fill="${GREEN}"/><path d="M54 198 L186 198 L186 210 L54 210 Z" fill="${BREAD}"/>`;

const BOTTLE = `<rect x="100" y="36" width="40" height="18" rx="4" fill="${BLUE_DARK}"/><path d="M104 54 L136 54 L150 90 L150 196 Q150 206 140 206 L100 206 Q90 206 90 196 L90 90 Z" fill="${BLUE}" opacity="0.85"/><rect x="96" y="118" width="48" height="40" rx="3" fill="${SUGAR}"/><path d="M100 78 L100 190" stroke="${SUGAR}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`;

const FILES = {
  // ingredients
  'beans.svg': card(BEANS),
  'milk.svg': card(carton(BLUE_DARK, 'МОЛОКО')),
  'milk-oat.svg': card(carton(TEA, 'ВІВСЯНЕ')),
  'milk-almond.svg': card(carton(COFFEE_LIGHT, 'МИГДАЛЬ')),
  'sugar.svg': card(sugarCubes()),
  'water.svg': card(WATER_DROP),
  'cocoa.svg': card(bowl(COCOA, '#5A3220')),
  'tea-black.svg': card(leaves('#8F6B3A', '#5F4423')),
  'tea-green.svg': card(leaves(GREEN, GREEN_DARK)),
  'cup-paper.svg': card(cupStack()),
  'lid.svg': card(LID),
  'bread.svg': card(BREAD_SLICE),
  'cheese.svg': card(CHEESE_WEDGE),
  'butter.svg': card(BUTTER_BLOCK),
  'syrup.svg': card(SYRUP),
  'sauce.svg': card(bowl('#E9C46A', '#C9973A')),
  // drinks
  'espresso.svg': card(steam() + openCup({ liquid: COFFEE, handle: true })),
  'americano.svg': card(steam() + takeaway({ badge: COFFEE })),
  'latte.svg': card(steam() + openCup({ liquid: LATTE, art: true })),
  'cappuccino.svg': card(steam() + openCup({ liquid: LATTE, foam: FOAM })),
  'flat-white.svg': card(steam() + openCup({ liquid: COFFEE_LIGHT, art: true })),
  'raf.svg': card(steam() + openCup({ liquid: '#D9B088', foam: FOAM })),
  'cocoa-cup.svg': card(steam() + takeaway({ body: CREAM, band: COCOA, badge: COCOA })),
  'tea-cup.svg': card(steam() + openCup({ liquid: TEA }) + `<path d="M150 100 L172 60" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><rect x="164" y="44" width="22" height="18" rx="3" fill="${GREEN}"/>`),
  // food and water
  'croissant.svg': card(CROISSANT),
  'cheesecake.svg': card(CHEESECAKE),
  'syrnyk.svg': card(SYRNYK),
  'sandwich.svg': card(SANDWICH),
  'bottle.svg': card(BOTTLE),
};

let total = 0;
for (const [name, svg] of Object.entries(FILES)) {
  writeFileSync(path.join(OUT, name), svg);
  total += svg.length;
  console.log(`${name.padEnd(24)} ${String(svg.length).padStart(6)} B`);
}
console.log(`\n${Object.keys(FILES).length} files, ${(total / 1024).toFixed(1)} KB total`);
