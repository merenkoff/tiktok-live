// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/gen-icons.mjs — turns design/icons/**/*.svg into React components.
//
// The glyphs are drawn by hand in the style of Things (Cultured Code): one hue
// per icon, a heavy rounded 2 px line, a light fill of the same hue inside.
// They are meant to be pixel-exact at their own size, so the drawing rules are
// checked here rather than by eye:
//
//   - colour glyphs sit on a 24 px grid (viewBox 0 0 24 24), UI glyphs on 20,
//     and a UI glyph the till draws at 16 or smaller may carry a second,
//     separately drawn 16 px version (design/icons/ui16/) that the component
//     switches to by itself — scaling the 20 px drawing down would put its
//     edges between pixels, the way SF Symbols ships more than one size;
//   - every <rect> has whole-pixel x / y / width / height, so a straight edge
//     never lands between two pixels on a 1× till screen;
//   - every number in path data and every circle is on a quarter-pixel grid;
//   - every stroke width is a whole number (a 2 px stroke centred on a whole
//     coordinate covers exactly two pixel columns).
//
// Colour glyphs keep their own colours (they are not recoloured by CSS, the
// way Things' sidebar icons are not); UI glyphs draw in currentColor.
//
// Masks need document-unique ids — two instances of the same glyph on one
// page must not share one — so a glyph that declares an id gets React's
// useId() prefixed to it. Every glyph carries `data-glyph="<Name>"`, which is
// what tests look for.
//
// A name drawn both ways takes a suffix on the side that came second: the
// colour magnifier of the nav set is `SearchColor` because `Search` is the UI
// one; a UI tag is `TagLine` because `Tag` is the colour one the site uses.
//
//   node scripts/gen-icons.mjs            # write the components
//   node scripts/gen-icons.mjs --check    # CI: sources obey the grid, output is current
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'design/icons');
const CHECK = process.argv.includes('--check');

/** Where the components go. Each app has its own node_modules, so each gets its own copy. */
const TARGETS = [
  { app: 'site', file: 'site/src/components/glyphs.tsx', header: [] },
  {
    app: 'pos',
    file: 'pos/src/platform/glyphs.tsx',
    // The two maps at the bottom are data, not components.
    header: ['/* eslint-disable react-refresh/only-export-components */'],
  },
];

const KINDS = {
  color: { size: 24, viewBox: '0 0 24 24' },
  ui: { size: 20, viewBox: '0 0 20 20' },
};
const SMALL = { dir: 'ui16', size: 16, viewBox: '0 0 16 16' };

const problems = [];
const problem = (file, msg) => problems.push(`${path.relative(REPO, file)}: ${msg}`);

// --- parsing ---------------------------------------------------------------

const ATTR_RE = /([a-zA-Z:-]+)="([^"]*)"/g;
function attrs(s) {
  const out = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1]] = m[2];
  return out;
}

function readGlyph(kind, file, viewBox = KINDS[kind].viewBox) {
  const text = readFileSync(file, 'utf8').trim();
  const open = text.match(/^<svg\b([^>]*)>/);
  if (!open || !text.endsWith('</svg>')) {
    problem(file, 'not a single <svg> element');
    return null;
  }
  const root = attrs(open[1]);
  if (root.viewBox !== viewBox) problem(file, `viewBox must be "${viewBox}"`);
  const body = text.slice(open[0].length, -'</svg>'.length).trim();
  checkGrid(file, body);
  return { name: path.basename(file, '.svg'), kind, hue: root['data-hue'], body };
}

// --- the grid rules ----------------------------------------------------------

const onGrid = (n, step) => Math.abs(n / step - Math.round(n / step)) < 1e-9;
const numbers = (s) => (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) ?? []).map(Number);

function checkGrid(file, body) {
  for (const m of body.matchAll(/<(rect|circle|path|g|mask)\b([^>]*?)\/?>/g)) {
    const [, tag, raw] = m;
    const a = attrs(raw);
    if (a['stroke-width'] !== undefined && !Number.isInteger(Number(a['stroke-width']))) {
      problem(file, `<${tag}> stroke-width ${a['stroke-width']} is not a whole pixel`);
    }
    if (tag === 'rect') {
      for (const k of ['x', 'y', 'width', 'height']) {
        const v = Number(a[k] ?? 0);
        if (!Number.isInteger(v)) problem(file, `<rect> ${k}="${a[k]}" is not on a whole pixel`);
      }
    }
    if (tag === 'circle') {
      for (const k of ['cx', 'cy', 'r']) {
        if (!onGrid(Number(a[k]), 0.25)) problem(file, `<circle> ${k}="${a[k]}" is off the quarter-pixel grid`);
      }
    }
    if (tag === 'path' && a.d) {
      // Arc flags and radii are numbers too; they are all on the grid by construction.
      const bad = numbers(a.d).filter((n) => !onGrid(n, 0.25));
      if (bad.length) problem(file, `<path> d has off-grid numbers: ${[...new Set(bad)].join(', ')}`);
    }
  }
}

// --- JSX ---------------------------------------------------------------------

const CAMEL = {
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-opacity': 'strokeOpacity',
};

function toJsx(body) {
  const usesIds = /\bid="/.test(body);
  let jsx = body
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .replace(/([a-z]+-[a-z]+)=/g, (all, k) => (CAMEL[k] ? `${CAMEL[k]}=` : all));
  if (usesIds) {
    jsx = jsx
      .replace(/\bid="([^"]+)"/g, (_, id) => `id={u + '${id}'}`)
      .replace(/="url\(#([^)]+)\)"/g, (_, id) => `={'url(#' + u + '${id})'}`);
  }
  return { jsx, usesIds };
}

function component(g) {
  const { size, viewBox } = KINDS[g.kind];
  const main = toJsx(g.body);
  const small = g.small ? toJsx(g.small) : null;
  const usesIds = main.usesIds || small?.usesIds;
  const hue = g.hue ? ` · ${g.hue}` : '';
  const svg = (vb, jsx) => [
    `    <svg width={size} height={size} viewBox="${vb}" fill="none" aria-hidden="true" focusable="false" data-glyph="${g.name}" {...props}>`,
    `      ${jsx}`,
    '    </svg>',
  ];
  return [
    `/** ${g.kind === 'color' ? 'Colour glyph' : 'UI glyph'}, ${size} px grid${small ? ` (+ a 16 px drawing for size ≤ 16)` : ''}${hue}. */`,
    `export function ${g.name}({ size = ${size}, ...props }: GlyphProps) {`,
    ...(usesIds ? ['  const u = useGlyphId();'] : []),
    ...(small ? ['  if (size <= 16)', '    return (', ...svg(SMALL.viewBox, small.jsx), '    );'] : []),
    '  return (',
    ...svg(viewBox, main.jsx),
    '  );',
    '}',
  ].join('\n');
}

function render(glyphs, header) {
  const color = glyphs.filter((g) => g.kind === 'color');
  const ui = glyphs.filter((g) => g.kind === 'ui');
  return [
    '// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC',
    '// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.',
    '// Commercial use requires a separate agreement: mer.sergei@gmail.com',
    '',
    '// GENERATED by scripts/gen-icons.mjs from design/icons/ — edit the SVGs there, not this file.',
    '// Colour glyphs (24 px grid) carry their own hue; UI glyphs (20 px grid) draw in currentColor.',
    '// Render them at their grid size or twice it — anything else lands edges between pixels.',
    ...header,
    "import { useId, type SVGProps } from 'react';",
    '',
    'export type GlyphProps = Omit<SVGProps<SVGSVGElement>, \'ref\'> & { size?: number };',
    'export type Glyph = (props: GlyphProps) => JSX.Element;',
    '',
    '/** Masks need an id unique in the document; useId is stable across SSR and hydration. */',
    "const useGlyphId = () => useId().replace(/:/g, '') + '-';",
    '',
    ...color.map((g) => component(g) + '\n'),
    ...ui.map((g) => component(g) + '\n'),
    `/** Every colour glyph by name. */`,
    `export const COLOR_GLYPHS = { ${color.map((g) => g.name).join(', ')} } as const satisfies Record<string, Glyph>;`,
    '',
    `/** Every UI glyph by name. */`,
    `export const UI_GLYPHS = { ${ui.map((g) => g.name).join(', ')} } as const satisfies Record<string, Glyph>;`,
    '',
  ].join('\n');
}

// --- main --------------------------------------------------------------------

const glyphs = [];
for (const kind of Object.keys(KINDS)) {
  const dir = path.join(SRC, kind);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
    const g = readGlyph(kind, path.join(dir, f));
    if (g) glyphs.push(g);
  }
}
const uiNames = new Set(glyphs.filter((g) => g.kind === 'ui').map((g) => g.name));
const smallDir = path.join(SRC, SMALL.dir);
if (existsSync(smallDir)) {
  for (const f of readdirSync(smallDir).filter((f) => f.endsWith('.svg')).sort()) {
    const file = path.join(smallDir, f);
    const s = readGlyph('ui', file, SMALL.viewBox);
    if (!s) continue;
    if (!uiNames.has(s.name)) problem(file, 'a 16 px drawing needs its 20 px UI glyph of the same name');
    else glyphs.find((g) => g.kind === 'ui' && g.name === s.name).small = s.body;
  }
}
const seen = new Set();
for (const g of glyphs) {
  if (seen.has(g.name)) problem(path.join(SRC, g.kind, `${g.name}.svg`), 'name used by both a colour and a UI glyph');
  seen.add(g.name);
}

for (const t of TARGETS) {
  const out = render(glyphs, t.header);
  const file = path.join(REPO, t.file);
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== out) problem(file, 'out of date — run node scripts/gen-icons.mjs');
  } else {
    writeFileSync(file, out);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${CHECK ? 'checked' : 'wrote'} ${glyphs.length} glyphs → ${TARGETS.map((t) => t.file).join(', ')}`);
