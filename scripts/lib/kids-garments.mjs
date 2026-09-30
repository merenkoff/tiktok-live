// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/lib/kids-garments.mjs — schematic flat garments for a KIDS' clothing
// catalogue (TechDocs/POS_CLOTHING.md, phase C1).
//
// Same look as the demo store's pictures (`gen-demo-clothing.mjs`: a 240×240
// card, cream background, flat shapes with a shade for folds, nothing to
// license), but drawn for what a baby-wear shop sells — a two-piece set, a
// romper, a dress, a long-sleeve top, a bomber — and tinted from the product's
// OWN colour words («світло-бузьковий з переливом», «рожевий в горошок»,
// «біло-блакитний»). Pure: no I/O, so it is tested by `--selftest` of
// `backfill-store-catalog.mjs` and reusable for any shop.
//
// What a picture does NOT do: draw a character. A product called «Костюм
// Білосніжка» gets a pink two-piece, not a cartoon — those are somebody's
// trademarks, and the owner's real photo replaces this one anyway.

export const BG = '#F7F5F1';
export const EDGE = '#B9AE9C';

// ── colour ──────────────────────────────────────────────────────────────

/** `#rrggbb` → [r, g, b]. */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Mix `a` toward `b` by `t` (0 = a, 1 = b). */
export function mix(a, b, t) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return hex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

const lighten = (c, t) => mix(c, '#FFFFFF', t);
const darken = (c, t) => mix(c, '#000000', t);

/** Perceived brightness 0..1 — a white garment needs an edge on a cream card. */
function brightness(c) {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Colour words → a base tone. Matched on the START of a token, so every
 * gender/number ending and the usual typos land: «блакитний», «блакитна»,
 * «біла», «коричневій», «щоколад». First match wins, so the longer or more
 * specific stems go first.
 */
const STEMS = [
  ['молоч', '#F1E9DC'],
  ['біл', '#FBFAF7'],
  ['блакит', '#8FB8E8'],
  ['син', '#4C6C9C'],
  ['беж', '#D9C4A5'],
  ['пудр', '#E6CDC3'],
  ['рожев', '#F0A9BE'],
  ['рож', '#F0A9BE'],
  ['черв', '#D1453B'],
  ['малин', '#C2185B'],
  ['бузьк', '#B9A2D8'],
  ['сір', '#9A9CA0'],
  ['корич', '#7A4E2D'],
  ['шоколад', '#6B4226'],
  ['щоколад', '#6B4226'],
  ['теракот', '#C0654A'],
  ['жовт', '#F2C94C'],
  ['помаранч', '#F2994A'],
  ['морквян', '#E8833A'],
  ['салат', '#B5D98A'],
  ['зелен', '#6FAF6B'],
  ['хакі', '#8B8A5E'],
  ['графіт', '#5A5D63'],
  ['чорн', '#2B2B2B'],
];

const LIGHT_WORDS = ['світл', 'св', 'ніжн', 'пастел'];
const DARK_WORDS = ['темн', 'насичен'];

/** Neutral used when a colour says nothing we know («МІН», empty). */
export const FALLBACK_TONE = '#D9C4A5';

/**
 * A colour field as the owner typed it → what to paint.
 * `{ base, accent, dots, known }`: `accent` is the second colour of a compound
 * («біло-блакитний» → white with blue trim), `dots` a «в горошок» pattern,
 * `known` false when no word was recognised (the fallback neutral is used).
 */
export function colourFromText(text) {
  const tokens = String(text ?? '')
    .toLowerCase()
    .split(/[\s\-–—/]+/)
    .filter(Boolean);
  let lightness = 0;
  const tones = [];
  let dots = false;
  for (const token of tokens) {
    if (token.startsWith('горош')) {
      dots = true;
      continue;
    }
    if (LIGHT_WORDS.some((w) => token === w || (w.length > 2 && token.startsWith(w)))) {
      lightness += 1;
      continue;
    }
    if (DARK_WORDS.some((w) => token.startsWith(w))) {
      lightness -= 1;
      continue;
    }
    const hit = STEMS.find(([stem]) => token.startsWith(stem));
    if (hit) tones.push(hit[1]);
  }
  const adjust = (c) => (lightness > 0 ? lighten(c, 0.32) : lightness < 0 ? darken(c, 0.25) : c);
  const base = tones.length ? adjust(tones[0]) : FALLBACK_TONE;
  const second = tones.find((t) => t !== tones[0]);
  return { base, accent: second ? adjust(second) : null, dots, known: tones.length > 0 };
}

// ── what it is ──────────────────────────────────────────────────────────

/**
 * A product name → the garment to draw. Keyword on the name, not on a
 * catalogue field: a baby-wear shop's names are the only place the shape lives
 * («Костюмчик Зайчик», «сукня Свято», «Чоловічок нарядний»).
 */
export function classifyGarment(name) {
  const n = String(name ?? '').toLowerCase();
  if (n.includes('сукн') || n.includes('плать')) return 'dress';
  if (n.includes('чоловічок') || n.includes('боді') || n.includes('ромпер') || n.includes('пісочник')) return 'romper';
  if (n.includes('костюм') || n.includes('комплект') || n.includes('піжам')) return 'set';
  if (n.includes('бомбер') || n.includes('куртк') || n.includes('жилет') || n.includes('желет')) return 'jacket';
  if (n.includes('реглан') || n.includes('кофт') || n.includes('світшот') || n.includes('худі') || n.includes('футболк')) return 'top';
  return 'top';
}

// ── shapes ──────────────────────────────────────────────────────────────
// Each returns `{ parts, body }`: the drawing, and the path of the main fabric
// so a «в горошок» pattern can be laid over exactly that and nothing else.

function tone(base, accent) {
  const shade = darken(base, 0.14);
  const trim = accent ?? shade;
  const edge = brightness(base) > 0.88 ? ` stroke="${EDGE}" stroke-width="2"` : '';
  return { base, shade, trim, edge };
}

function topShape(c, { long = true } = {}) {
  const sleeveEnd = long ? 196 : 118;
  const sleeveX = long ? 30 : 26;
  let parts = '';
  parts += `<path d="M72 62 L${sleeveX} 92 L${sleeveX + 18} ${sleeveEnd} L74 ${long ? 176 : 104} Z" fill="${c.shade}"/>`;
  parts += `<path d="M168 62 L${210 - sleeveX + 26} 92 L${210 - sleeveX + 8} ${sleeveEnd} L166 ${long ? 176 : 104} Z" fill="${c.shade}"/>`;
  const body = 'M72 62 L102 50 Q120 66 138 50 L168 62 L162 206 L78 206 Z';
  parts += `<path d="${body}" fill="${c.base}"${c.edge}/>`;
  parts += `<path d="M102 50 Q120 68 138 50 Q120 60 102 50 Z" fill="${c.trim}"/>`;
  if (long) {
    parts += `<rect x="78" y="196" width="84" height="12" rx="4" fill="${c.trim}"/>`;
    parts += `<rect x="${sleeveX + 12}" y="${sleeveEnd - 6}" width="30" height="10" rx="4" fill="${c.trim}" transform="rotate(-12 ${sleeveX + 27} ${sleeveEnd})"/>`;
    parts += `<rect x="${210 - sleeveX - 42}" y="${sleeveEnd - 6}" width="30" height="10" rx="4" fill="${c.trim}" transform="rotate(12 ${210 - sleeveX - 27} ${sleeveEnd})"/>`;
  }
  return { parts, body };
}

function romperShape(c) {
  let parts = '';
  parts += `<path d="M72 56 L36 82 L48 112 L76 96 Z" fill="${c.shade}"/>`;
  parts += `<path d="M168 56 L204 82 L192 112 L164 96 Z" fill="${c.shade}"/>`;
  const body = 'M72 56 L100 46 Q120 64 140 46 L168 56 L164 128 L184 198 L150 206 L120 150 L90 206 L56 198 L76 128 Z';
  parts += `<path d="${body}" fill="${c.base}"${c.edge}/>`;
  parts += `<path d="M100 46 Q120 66 140 46 Q120 58 100 46 Z" fill="${c.trim}"/>`;
  parts += `<path d="M56 198 L90 206 L92 192 L58 184 Z M184 198 L150 206 L148 192 L182 184 Z" fill="${c.trim}"/>`;
  for (const [x, y] of [[112, 140], [120, 152], [128, 140]]) parts += `<circle cx="${x}" cy="${y}" r="2.6" fill="${c.shade}"/>`;
  return { parts, body };
}

function dressShape(c) {
  let parts = '';
  const body = 'M88 48 L108 44 Q120 60 132 44 L152 48 L156 92 L146 100 L180 212 L60 212 L94 100 L84 92 Z';
  parts += `<path d="${body}" fill="${c.base}"${c.edge}/>`;
  parts += `<path d="M108 44 Q120 60 132 44 Q120 54 108 44 Z" fill="${c.trim}"/>`;
  parts += `<path d="M94 100 L146 100" stroke="${c.trim}" stroke-width="5"/>`;
  parts += `<path d="M110 106 L100 212 M130 106 L140 212" stroke="${c.shade}" stroke-width="2" opacity="0.55"/>`;
  parts += `<rect x="60" y="204" width="120" height="8" rx="3" fill="${c.trim}"/>`;
  return { parts, body };
}

function jacketShape(c) {
  let parts = '';
  parts += `<path d="M70 66 L28 96 L40 172 L72 164 Z" fill="${c.shade}"/>`;
  parts += `<path d="M170 66 L212 96 L200 172 L168 164 Z" fill="${c.shade}"/>`;
  const body = 'M70 66 L100 54 L120 62 L140 54 L170 66 L164 200 L76 200 Z';
  parts += `<path d="${body}" fill="${c.base}"${c.edge}/>`;
  parts += `<rect x="76" y="190" width="88" height="14" rx="5" fill="${c.trim}"/>`;
  parts += `<path d="M100 54 Q120 46 140 54 Q120 70 100 54 Z" fill="${c.trim}"/>`;
  parts += `<path d="M120 62 L120 190" stroke="${c.trim}" stroke-width="6"/>`;
  parts += `<rect x="86" y="128" width="22" height="30" rx="4" fill="${c.shade}" opacity="0.6"/>`;
  parts += `<rect x="132" y="128" width="22" height="30" rx="4" fill="${c.shade}" opacity="0.6"/>`;
  return { parts, body };
}

/** Kids' pants: elastic waist, straight legs, cuffs. Drawn in a 104×164 box at (68, 44). */
function pantsShape(c) {
  let parts = '';
  const body = 'M76 44 L164 44 L170 208 L130 208 L120 106 L110 208 L70 208 Z';
  parts += `<path d="${body}" fill="${c.base}"${c.edge}/>`;
  parts += `<rect x="76" y="44" width="88" height="14" fill="${c.trim}"/>`;
  parts += `<path d="M120 58 L120 106" stroke="${c.shade}" stroke-width="3"/>`;
  parts += `<rect x="70" y="198" width="40" height="10" rx="3" fill="${c.trim}"/>`;
  parts += `<rect x="130" y="198" width="40" height="10" rx="3" fill="${c.trim}"/>`;
  return { parts, body };
}

function setShape(c) {
  // The trousers sit behind the top; the top is drawn smaller and higher.
  const pants = pantsShape({ ...c, base: c.accent ? c.accentBase : c.base });
  const top = topShape(c, { long: true });
  const parts =
    `<g transform="translate(46 112) scale(0.6)">${pants.parts}</g>` +
    `<g transform="translate(38 6) scale(0.68)">${top.parts}</g>`;
  return {
    parts,
    // The dots go on the top only (the larger, nearer fabric).
    body: top.body,
    bodyTransform: 'translate(38 6) scale(0.68)',
  };
}

const SHAPES = { top: topShape, romper: romperShape, dress: dressShape, jacket: jacketShape, set: setShape };

// ── card ────────────────────────────────────────────────────────────────

/**
 * One picture. `colour` is the owner's own colour text; `garment` one of
 * `top | romper | dress | jacket | set`.
 */
export function garmentSvg({ garment = 'top', colour = '' } = {}) {
  const paint = colourFromText(colour);
  const c = tone(paint.base, paint.accent);
  // The set's trousers take the second colour when the compound has one, else
  // a slightly deeper tone of the first — two pieces, one set.
  c.accent = paint.accent;
  c.accentBase = paint.accent ? paint.accent : darken(paint.base, 0.08);
  const shape = (SHAPES[garment] ?? topShape)(c);
  let overlay = '';
  if (paint.dots) {
    const dotFill = brightness(paint.base) > 0.6 ? darken(paint.base, 0.22) : lighten(paint.base, 0.5);
    let dots = '';
    for (let y = 70; y < 210; y += 22) {
      for (let x = 78 + ((y / 22) % 2) * 11; x < 170; x += 22) dots += `<circle cx="${x}" cy="${y}" r="3.6" fill="${dotFill}" opacity="0.85"/>`;
    }
    const id = 'body';
    const transform = shape.bodyTransform ? ` transform="${shape.bodyTransform}"` : '';
    overlay =
      `<clipPath id="${id}"><path d="${shape.body}"${transform}/></clipPath>` +
      `<g clip-path="url(#${id})"><g${transform}>${dots}</g></g>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img">` +
    `<rect width="240" height="240" rx="18" fill="${BG}"/>${shape.parts}${overlay}</svg>\n`
  );
}
