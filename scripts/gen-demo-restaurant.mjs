// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-demo-restaurant.mjs — regenerates public/demo-restaurant/*.svg.
//
// The demo restaurant catalogue (migration 053) needs a picture per product,
// the same way the café and flowers demos do: flat vector illustrations,
// nothing to license, shipped inside the image under public/ (already mounted
// at '/'), editable text instead of base64 in a migration.
//
//   node scripts/gen-demo-restaurant.mjs public/demo-restaurant
//
// A restaurant has more products than a café, and most of them are food on a
// plate. So the vocabulary here is built around one primitive — `plated`, a
// round plate seen from above with things arranged on it — rather than around
// the café's cup. Ingredients get the simpler `blob` and `bottleOf` shapes:
// they are never on the sell screen, only in the stock list and the recipes.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) {
  console.error('usage: node scripts/gen-demo-restaurant.mjs <out-dir>');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const BG = '#F7F5F1';
const INK = '#3B2F2A';
const PLATE = '#FFFFFF';
const PLATE_RIM = '#E4DED4';
const SHADOW = '#3B2F2A';

const MEAT = '#8C4A32';
const MEAT_DARK = '#6B3323';
const CHICKEN = '#E7C382';
const SALMON = '#F0916B';
const BACON = '#C96A54';
const BEET = '#9B2D5B';
const CABBAGE = '#CFE0B8';
const POTATO = '#E8CE8F';
const CARROT = '#E8964B';
const ONION = '#E9DCC9';
const GARLIC = '#F2EADF';
const TOMATO = '#D9452F';
const CUCUMBER = '#7FA85A';
const GREEN = '#6E9A63';
const GREEN_DARK = '#4F7A47';
const PUMPKIN = '#E79A3C';
const CHEESE = '#F0B94A';
const FETA = '#FAF6EE';
const CREAM = '#FFF8EC';
const BUTTER = '#F3CF5A';
const OIL = '#D7B740';
const FLOUR = '#EFE6D6';
const EGG = '#F7E7B8';
const PASTA = '#E9C978';
const RICE = '#F4EFE2';
const BREAD = '#D9A45B';
const BREAD_CRUST = '#A86B2E';
const SUGAR = '#FFFFFF';
const LEMON = '#F2D33F';
const MINT = '#74B06A';
const WATER = '#BFD8E8';
const SODA = '#DCEAF2';
const COFFEE = '#5A3A22';
const LATTE = '#C99A6B';
const MILK = '#FFFFFF';
const WINE_RED = '#7A2338';
const WINE_WHITE = '#E8DFA8';
const ICE = '#EAF2F6';
const CHOCO = '#6B4429';
const SAVOIARDI = '#E5C88E';
const GLASS = '#DCE6EA';

function card(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><rect width="240" height="240" fill="${BG}"/>${inner}</svg>`;
}

/** The round plate every dish is served on, seen from above. */
function plate(inner) {
  let out = '';
  out += `<ellipse cx="120" cy="128" rx="92" ry="88" fill="${SHADOW}" opacity="0.07"/>`;
  out += `<circle cx="120" cy="122" r="88" fill="${PLATE}"/>`;
  out += `<circle cx="120" cy="122" r="88" fill="none" stroke="${PLATE_RIM}" stroke-width="3"/>`;
  out += `<circle cx="120" cy="122" r="66" fill="none" stroke="${PLATE_RIM}" stroke-width="2" opacity="0.7"/>`;
  return out + inner;
}

const plated = (inner) => card(plate(inner));

/** A bowl for anything liquid: soup, sauce, ice cream. */
function bowl(liquid, garnish = '') {
  let out = '';
  out += `<ellipse cx="120" cy="196" rx="70" ry="12" fill="${SHADOW}" opacity="0.08"/>`;
  out += `<path d="M42 110 L198 110 Q186 196 120 198 Q54 196 42 110 Z" fill="${PLATE}"/>`;
  out += `<ellipse cx="120" cy="110" rx="78" ry="24" fill="${PLATE}"/>`;
  out += `<ellipse cx="120" cy="110" rx="66" ry="19" fill="${liquid}"/>`;
  return out + garnish;
}

function steam(x = 120, y = 34) {
  let out = '';
  for (const dx of [-18, 0, 18]) {
    out += `<path d="M${x + dx} ${y + 30} C ${x + dx - 6} ${y + 20}, ${x + dx + 6} ${y + 10}, ${x + dx} ${y}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.22"/>`;
  }
  return out;
}

/** A loose heap — how a raw ingredient reads in a stock list. */
function blob(fill, { dark = null, n = 7 } = {}) {
  const pts = [
    [96, 150, 26], [144, 150, 26], [120, 118, 28], [84, 116, 20],
    [156, 116, 20], [104, 178, 18], [136, 178, 18],
  ];
  let out = `<ellipse cx="120" cy="196" rx="62" ry="11" fill="${SHADOW}" opacity="0.08"/>`;
  pts.slice(0, n).forEach(([cx, cy, r], i) => {
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i % 3 === 2 && dark ? dark : fill}"/>`;
  });
  return card(out);
}

/** A bottle or carton: liquids that arrive sealed. */
function bottleOf(liquid, { cap = INK, label = null, carton = false } = {}) {
  let out = `<ellipse cx="120" cy="206" rx="46" ry="10" fill="${SHADOW}" opacity="0.08"/>`;
  if (carton) {
    out += `<path d="M84 76 L156 76 L156 202 L84 202 Z" fill="${SUGAR}" stroke="${PLATE_RIM}" stroke-width="2"/>`;
    out += `<path d="M84 76 L102 48 L138 48 L156 76 Z" fill="${FLOUR}" stroke="${PLATE_RIM}" stroke-width="2"/>`;
    out += `<rect x="108" y="36" width="24" height="14" rx="4" fill="${cap}"/>`;
    out += `<rect x="94" y="120" width="52" height="54" rx="6" fill="${liquid}"/>`;
  } else {
    out += `<path d="M104 54 L136 54 L136 84 Q162 100 162 130 L162 190 Q162 202 150 202 L90 202 Q78 202 78 190 L78 130 Q78 100 104 84 Z" fill="${liquid}" opacity="0.55"/>`;
    out += `<path d="M104 54 L136 54 L136 84 Q162 100 162 130 L162 190 Q162 202 150 202 L90 202 Q78 202 78 190 L78 130 Q78 100 104 84 Z" fill="none" stroke="${PLATE_RIM}" stroke-width="2"/>`;
    out += `<rect x="100" y="38" width="40" height="20" rx="5" fill="${cap}"/>`;
    out += `<rect x="86" y="130" width="68" height="40" rx="4" fill="${label ?? SUGAR}" opacity="0.85"/>`;
  }
  return card(out);
}

/** A stemmed glass — wine by the glass, and the lemonade. */
function stemGlass(liquid, { fizz = false } = {}) {
  let out = `<ellipse cx="120" cy="212" rx="40" ry="8" fill="${SHADOW}" opacity="0.08"/>`;
  out += `<path d="M78 48 L162 48 L150 118 Q120 138 90 118 Z" fill="${GLASS}" opacity="0.6"/>`;
  out += `<path d="M84 74 L156 74 L148 116 Q120 132 92 116 Z" fill="${liquid}"/>`;
  out += `<rect x="116" y="130" width="8" height="62" fill="${GLASS}"/>`;
  out += `<ellipse cx="120" cy="196" rx="34" ry="9" fill="${GLASS}"/>`;
  if (fizz) {
    for (const [cx, cy] of [[104, 96], [120, 104], [136, 92], [112, 110]]) {
      out += `<circle cx="${cx}" cy="${cy}" r="3" fill="${SUGAR}" opacity="0.7"/>`;
    }
  }
  return card(out);
}

/** A cup for the bar's coffee. */
function coffeeCup(liquid, foam = null) {
  let out = steam();
  out += `<path d="M164 112 C 200 108, 200 160, 164 160" stroke="${CREAM}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  out += `<path d="M64 96 L176 96 L166 196 Q120 206 74 196 Z" fill="${CREAM}"/>`;
  out += `<ellipse cx="120" cy="96" rx="58" ry="20" fill="${CREAM}"/>`;
  out += `<ellipse cx="120" cy="96" rx="48" ry="15" fill="${liquid}"/>`;
  if (foam) out += `<ellipse cx="120" cy="96" rx="38" ry="11" fill="${foam}"/>`;
  return card(out);
}

// ── Dish compositions ───────────────────────────────────────────────────────

const STEAK =
  `<path d="M62 92 Q120 64 178 92 Q190 122 178 156 Q120 186 62 156 Q50 122 62 92 Z" fill="${MEAT}"/>` +
  `<path d="M78 104 Q120 88 162 104" stroke="${MEAT_DARK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
  `<path d="M74 126 Q120 110 166 126" stroke="${MEAT_DARK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
  `<path d="M78 148 Q120 132 162 148" stroke="${MEAT_DARK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
  `<circle cx="120" cy="178" r="9" fill="${GREEN_DARK}"/>`;

const CHICKEN_DISH =
  `<ellipse cx="112" cy="120" rx="52" ry="38" fill="${CHICKEN}"/>` +
  `<path d="M70 112 Q112 96 154 112" stroke="${MEAT_DARK}" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>` +
  `<path d="M74 132 Q112 118 150 132" stroke="${MEAT_DARK}" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>` +
  `<circle cx="164" cy="158" r="12" fill="${GREEN}"/><circle cx="142" cy="172" r="9" fill="${GREEN_DARK}"/>`;

const SALMON_DISH =
  `<path d="M68 106 L172 96 L166 148 L74 152 Z" fill="${SALMON}"/>` +
  `<path d="M78 116 L164 108" stroke="${CREAM}" stroke-width="4" opacity="0.7" stroke-linecap="round"/>` +
  `<path d="M78 130 L162 124" stroke="${CREAM}" stroke-width="4" opacity="0.7" stroke-linecap="round"/>` +
  `<path d="M96 170 Q120 158 144 170" stroke="${GREEN_DARK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
  `<circle cx="160" cy="168" r="10" fill="${LEMON}"/>`;

const CARBONARA =
  `<ellipse cx="120" cy="124" rx="60" ry="42" fill="${PASTA}"/>` +
  [0, 1, 2, 3, 4].map((i) =>
    `<path d="M${70 + i * 22} 102 Q${80 + i * 22} 130, ${66 + i * 22} 150" stroke="${CREAM}" stroke-width="4" fill="none" opacity="0.8" stroke-linecap="round"/>`).join('') +
  `<circle cx="104" cy="112" r="9" fill="${BACON}"/><circle cx="140" cy="132" r="9" fill="${BACON}"/>` +
  `<circle cx="122" cy="98" r="7" fill="${CHEESE}"/>`;

const BURGER =
  `<path d="M60 108 Q120 62 180 108 L180 116 L60 116 Z" fill="${BREAD}"/>` +
  `<rect x="60" y="116" width="120" height="14" rx="4" fill="${GREEN}"/>` +
  `<rect x="58" y="130" width="124" height="20" rx="6" fill="${MEAT}"/>` +
  `<rect x="62" y="150" width="116" height="12" rx="4" fill="${CHEESE}"/>` +
  `<path d="M60 162 L180 162 Q180 194 120 196 Q60 194 60 162 Z" fill="${BREAD}"/>` +
  [86, 110, 134, 158].map((x) => `<circle cx="${x}" cy="92" r="3" fill="${FLOUR}"/>`).join('');

const BRUSCHETTA =
  `<path d="M52 128 L188 108 L192 140 L56 160 Z" fill="${BREAD}"/>` +
  `<path d="M52 128 L188 108 L189 118 L53 138 Z" fill="${BREAD_CRUST}"/>` +
  `<circle cx="92" cy="122" r="13" fill="${TOMATO}"/><circle cx="124" cy="116" r="13" fill="${TOMATO}"/>` +
  `<circle cx="156" cy="112" r="12" fill="${TOMATO}"/>` +
  `<circle cx="108" cy="106" r="7" fill="${GREEN_DARK}"/><circle cx="142" cy="100" r="6" fill="${GREEN_DARK}"/>`;

const CHEESE_PLATE =
  `<path d="M64 148 L112 96 L140 148 Z" fill="${CHEESE}"/>` +
  `<rect x="130" y="112" width="46" height="38" rx="5" fill="${FETA}" stroke="${PLATE_RIM}" stroke-width="2"/>` +
  `<circle cx="150" cy="122" r="4" fill="${PLATE_RIM}"/><circle cx="162" cy="138" r="3" fill="${PLATE_RIM}"/>` +
  `<path d="M74 168 L166 168" stroke="${BREAD}" stroke-width="10" stroke-linecap="round"/>` +
  `<circle cx="96" cy="94" r="8" fill="${GREEN_DARK}"/>`;

const CAESAR =
  `<ellipse cx="120" cy="126" rx="64" ry="46" fill="${GREEN}"/>` +
  `<ellipse cx="104" cy="112" rx="26" ry="18" fill="${GREEN_DARK}" opacity="0.6"/>` +
  `<ellipse cx="146" cy="136" rx="24" ry="16" fill="${GREEN_DARK}" opacity="0.5"/>` +
  `<rect x="96" y="120" width="44" height="18" rx="5" fill="${CHICKEN}"/>` +
  `<rect x="78" y="146" width="16" height="14" rx="3" fill="${BREAD}"/>` +
  `<rect x="152" y="104" width="16" height="14" rx="3" fill="${BREAD}"/>` +
  `<path d="M84 100 Q120 88 158 98" stroke="${CREAM}" stroke-width="5" fill="none" stroke-linecap="round"/>`;

const GREEK =
  `<ellipse cx="120" cy="128" rx="64" ry="44" fill="${GREEN}" opacity="0.35"/>` +
  `<circle cx="96" cy="112" r="15" fill="${TOMATO}"/><circle cx="148" cy="120" r="14" fill="${TOMATO}"/>` +
  `<circle cx="118" cy="146" r="14" fill="${CUCUMBER}"/><circle cx="86" cy="146" r="12" fill="${CUCUMBER}"/>` +
  `<rect x="126" y="96" width="28" height="24" rx="4" fill="${FETA}" stroke="${PLATE_RIM}" stroke-width="2"/>` +
  `<circle cx="152" cy="152" r="8" fill="${INK}" opacity="0.75"/><circle cx="100" cy="170" r="7" fill="${INK}" opacity="0.75"/>`;

const BORSCHT = bowl(BEET,
  `<ellipse cx="128" cy="106" rx="18" ry="7" fill="${CREAM}"/>` +
  `<circle cx="102" cy="112" r="6" fill="${CABBAGE}"/><circle cx="146" cy="116" r="5" fill="${GREEN_DARK}"/>`);

const PUMPKIN_SOUP = bowl(PUMPKIN,
  `<ellipse cx="120" cy="106" rx="20" ry="8" fill="${CREAM}" opacity="0.85"/>` +
  `<circle cx="104" cy="114" r="4" fill="${GREEN_DARK}"/><circle cx="138" cy="112" r="4" fill="${GREEN_DARK}"/>`);

const TIRAMISU =
  `<ellipse cx="120" cy="198" rx="62" ry="10" fill="${SHADOW}" opacity="0.08"/>` +
  `<rect x="60" y="94" width="120" height="100" rx="8" fill="${CREAM}"/>` +
  `<rect x="60" y="94" width="120" height="22" rx="8" fill="${CHOCO}"/>` +
  `<rect x="60" y="126" width="120" height="18" fill="${SAVOIARDI}"/>` +
  `<rect x="60" y="160" width="120" height="18" fill="${SAVOIARDI}"/>` +
  `<circle cx="96" cy="104" r="3" fill="${INK}" opacity="0.4"/><circle cx="140" cy="108" r="3" fill="${INK}" opacity="0.4"/>`;

const ICE_BOWL = bowl(CREAM,
  `<circle cx="104" cy="104" r="17" fill="${CREAM}"/><circle cx="136" cy="102" r="17" fill="${CREAM}"/>` +
  `<circle cx="120" cy="92" r="16" fill="${SUGAR}"/>` +
  `<circle cx="102" cy="88" r="6" fill="${BEET}"/><circle cx="140" cy="90" r="6" fill="${BEET}"/>` +
  `<path d="M120 76 L120 66" stroke="${MINT}" stroke-width="4" stroke-linecap="round"/>`);

const SIDE_FRIES = [0, 1, 2, 3, 4, 5].map((i) =>
  `<rect x="${72 + i * 17}" y="${96 + (i % 3) * 8}" width="12" height="${70 - (i % 3) * 8}" rx="3" fill="${POTATO}"/>`).join('');
const SIDE_MASH =
  `<ellipse cx="120" cy="132" rx="56" ry="38" fill="${POTATO}"/>` +
  `<ellipse cx="120" cy="120" rx="20" ry="10" fill="${BUTTER}"/>`;
const SIDE_RICE =
  `<ellipse cx="120" cy="134" rx="56" ry="36" fill="${RICE}"/>` +
  [0, 1, 2, 3, 4, 5, 6].map((i) =>
    `<ellipse cx="${88 + i * 11}" cy="${120 + (i % 3) * 12}" rx="6" ry="3" fill="${PLATE_RIM}"/>`).join('');
const SIDE_VEG =
  `<circle cx="98" cy="118" r="17" fill="${TOMATO}"/><circle cx="140" cy="126" r="17" fill="${CUCUMBER}"/>` +
  `<circle cx="116" cy="152" r="15" fill="${PUMPKIN}"/>` +
  `<path d="M74 152 L166 152" stroke="${INK}" stroke-width="3" opacity="0.2" stroke-linecap="round"/>`;

const DEMIGLACE = bowl(MEAT_DARK, `<ellipse cx="120" cy="108" rx="24" ry="8" fill="${MEAT}" opacity="0.6"/>`);
const STOCK_POT = bowl(CARROT, `<circle cx="106" cy="110" r="5" fill="${MEAT}"/><circle cx="136" cy="112" r="5" fill="${ONION}"/>`);
const DRESSING = bowl(CREAM, `<ellipse cx="120" cy="108" rx="22" ry="8" fill="${EGG}" opacity="0.8"/>`);

const EGG_ART =
  `<ellipse cx="120" cy="196" rx="52" ry="10" fill="${SHADOW}" opacity="0.08"/>` +
  `<ellipse cx="96" cy="140" rx="34" ry="44" fill="${EGG}"/>` +
  `<ellipse cx="146" cy="150" rx="32" ry="42" fill="${EGG}"/>`;

const BREAD_ART =
  `<ellipse cx="120" cy="196" rx="62" ry="10" fill="${SHADOW}" opacity="0.08"/>` +
  `<path d="M52 118 Q120 74 188 118 Q188 176 120 186 Q52 176 52 118 Z" fill="${BREAD}"/>` +
  `<path d="M70 112 Q120 88 170 112" stroke="${BREAD_CRUST}" stroke-width="6" fill="none" stroke-linecap="round"/>` +
  `<path d="M86 132 L154 132" stroke="${BREAD_CRUST}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`;

const BUN_ART =
  `<ellipse cx="120" cy="192" rx="56" ry="10" fill="${SHADOW}" opacity="0.08"/>` +
  `<path d="M56 140 Q120 76 184 140 Q184 178 120 184 Q56 178 56 140 Z" fill="${BREAD}"/>` +
  [82, 106, 130, 154].map((x) => `<circle cx="${x}" cy="${120 + (x % 3) * 4}" r="3.5" fill="${FLOUR}"/>`).join('');

const PASTA_RAW = [0, 1, 2, 3, 4, 5].map((i) =>
  `<rect x="${74 + i * 16}" y="72" width="9" height="120" rx="4" fill="${PASTA}"/>`).join('');

const SAVOIARDI_ART = [0, 1, 2].map((i) =>
  `<rect x="${66 + i * 38}" y="${92 + i * 8}" width="30" height="96" rx="12" fill="${SAVOIARDI}"/>`).join('');

const LEMONADE = stemGlass(LEMON, { fizz: true });

const FILES = {
  // ── menu ────────────────────────────────────────────────────────────────
  'bruschetta.svg': plated(BRUSCHETTA),
  'cheese-plate.svg': plated(CHEESE_PLATE),
  'caesar.svg': plated(CAESAR),
  'greek.svg': plated(GREEK),
  'borscht.svg': card(steam() + BORSCHT),
  'pumpkin-soup.svg': card(steam() + PUMPKIN_SOUP),
  'steak.svg': plated(STEAK),
  'chicken-dish.svg': plated(CHICKEN_DISH),
  'salmon-dish.svg': plated(SALMON_DISH),
  'carbonara.svg': plated(CARBONARA),
  'burger.svg': plated(BURGER),
  'tiramisu.svg': card(TIRAMISU),
  'ice-bowl.svg': card(ICE_BOWL),
  'espresso.svg': coffeeCup(COFFEE),
  'americano.svg': coffeeCup(COFFEE, null),
  'latte.svg': coffeeCup(LATTE, CREAM),
  'lemonade.svg': LEMONADE,
  'bottle.svg': bottleOf(WATER, { cap: '#4F7BB0' }),
  'glass-red.svg': stemGlass(WINE_RED),
  'glass-white.svg': stemGlass(WINE_WHITE),

  // ── off-menu builders ───────────────────────────────────────────────────
  'stock-pot.svg': card(STOCK_POT),
  'dressing.svg': card(DRESSING),
  'demiglace.svg': card(DEMIGLACE),
  'fries.svg': plated(SIDE_FRIES),
  'mash.svg': plated(SIDE_MASH),
  'rice-side.svg': plated(SIDE_RICE),
  'veg-grill.svg': plated(SIDE_VEG),

  // ── ingredients ─────────────────────────────────────────────────────────
  'beef.svg': blob(MEAT, { dark: MEAT_DARK }),
  'ribeye.svg': plated(STEAK),
  'chicken.svg': blob(CHICKEN),
  'salmon.svg': blob(SALMON),
  'bacon.svg': blob(BACON, { dark: MEAT_DARK, n: 5 }),
  'beet.svg': blob(BEET),
  'cabbage.svg': blob(CABBAGE, { dark: GREEN }),
  'potato.svg': blob(POTATO),
  'carrot.svg': blob(CARROT),
  'onion.svg': blob(ONION, { dark: PLATE_RIM }),
  'garlic.svg': blob(GARLIC, { dark: PLATE_RIM, n: 5 }),
  'tomato.svg': blob(TOMATO),
  'cucumber.svg': blob(CUCUMBER),
  'lettuce.svg': blob(GREEN, { dark: GREEN_DARK }),
  'pumpkin.svg': blob(PUMPKIN),
  'parmesan.svg': blob(CHEESE, { n: 5 }),
  'feta.svg': blob(FETA, { dark: PLATE_RIM, n: 5 }),
  'mascarpone.svg': blob(CREAM, { dark: PLATE_RIM, n: 5 }),
  'cream.svg': bottleOf(CREAM, { cap: '#7FA6D4', carton: true }),
  'sour-cream.svg': blob(CREAM, { dark: PLATE_RIM, n: 4 }),
  'butter.svg': blob(BUTTER, { n: 4 }),
  'oil.svg': bottleOf(OIL, { cap: GREEN_DARK }),
  'flour.svg': blob(FLOUR, { dark: PLATE_RIM }),
  'egg.svg': card(EGG_ART),
  'pasta.svg': card(PASTA_RAW),
  'rice.svg': blob(RICE, { dark: PLATE_RIM }),
  'bread.svg': card(BREAD_ART),
  'bun.svg': card(BUN_ART),
  'savoiardi.svg': card(SAVOIARDI_ART),
  'sugar.svg': blob(SUGAR, { dark: PLATE_RIM }),
  'lemon.svg': blob(LEMON),
  'mint.svg': blob(MINT, { dark: GREEN_DARK, n: 5 }),
  'water.svg': bottleOf(WATER, { cap: '#4F7BB0' }),
  'soda.svg': bottleOf(SODA, { cap: GREEN }),
  'beans.svg': blob(COFFEE, { dark: '#3E2617' }),
  'milk.svg': bottleOf(MILK, { cap: '#4F7BB0', carton: true }),
  'wine-red.svg': bottleOf(WINE_RED, { cap: '#2E1119' }),
  'wine-white.svg': bottleOf(WINE_WHITE, { cap: GREEN_DARK }),
  'ice-cream.svg': blob(CREAM, { dark: ICE, n: 5 }),
};

let total = 0;
for (const [name, svg] of Object.entries(FILES)) {
  writeFileSync(path.join(OUT, name), svg);
  total += svg.length;
}
console.log(`${Object.keys(FILES).length} files, ${(total / 1024).toFixed(1)} KB total`);
