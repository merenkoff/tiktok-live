// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Checks that a module's own compiled CSS covers every utility class it uses
// (roadmap #4). Each `vite.<id>-remote.config.ts` runs Tailwind over just that
// module's source → `dist-remotes/<id>/style.css`; if a class is used but that
// pass didn't see it (e.g. built from a stale/partial checkout), it renders
// unstyled at runtime. This makes the coupling checkable.
//
// Usage (after `npm run build:<id>-remote`):
//   node scripts/check-module-css-coverage.mjs src/modules/stock dist-remotes/stock/style.css
//
// Second arg may be a file or a directory (all *.css under it are concatenated).
// Omitted → defaults to `dist/assets` (the host bundle, for the bundled path).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir, matchExt) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, matchExt));
    else if (matchExt.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

const moduleDir = process.argv[2];
if (!moduleDir) {
  console.error('usage: node scripts/check-module-css-coverage.mjs <module-dir> [css-file-or-dir]');
  process.exit(1);
}
const cssTarget = process.argv[3] ?? 'dist/assets';

let cssFiles;
try {
  cssFiles = statSync(cssTarget).isDirectory() ? walk(cssTarget, ['.css']) : [cssTarget];
} catch {
  cssFiles = [];
}
if (cssFiles.length === 0) {
  console.error(`No CSS at ${cssTarget} — build the module first.`);
  process.exit(1);
}
// The hand-written `.sq-*` / `.pos-*` layer + tokens is always host-provided
// (src/styles/tokens.css, <link>ed on every page) — fold it in so those classes
// aren't false positives when checking a module's utilities-only style.css.
const TOKENS = 'src/styles/tokens.css';
const css = [
  ...cssFiles.map((f) => readFileSync(f, 'utf-8')),
  ...((() => {
    try {
      return [readFileSync(TOKENS, 'utf-8')];
    } catch {
      return [];
    }
  })()),
].join('\n');

const sourceFiles = walk(moduleDir, ['.ts', '.tsx']);
const text = sourceFiles.map((f) => readFileSync(f, 'utf-8')).join('\n');

const PREFIXES = [
  'bg-', 'text-', 'border-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'p-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-', 'gap-', 'w-', 'h-', 'min-w',
  'min-h', 'max-w', 'max-h', 'rounded', 'shadow', 'space-', 'divide-',
  'overflow-', 'justify-', 'items-', 'shrink', 'grow', 'sq-', 'lg:', 'z-',
  'font-', 'select-', 'disabled:', 'hover:', 'focus:', 'opacity-', 'cursor-',
  'inset-', 'top-', 'bottom-', 'left-', 'right-',
];

const tokens = new Set(text.match(/[a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9[\].\/#%]+)+/g) ?? []);
const candidates = [...tokens].filter((t) => PREFIXES.some((p) => t.startsWith(p)));

const missing = candidates.filter((cls) => {
  const escaped = cls.replace(/([:.[\]/%#])/g, '\\$1');
  return !css.includes(escaped) && !css.includes(cls);
});

console.log(`Checked ${candidates.length} candidate classes from ${sourceFiles.length} files in ${moduleDir}`);

if (missing.length > 0) {
  console.error(`Missing from ${cssTarget} (${missing.length}):`);
  for (const m of missing) console.error(` - ${m}`);
  console.error(
    "\nThese classes are used in the module but the CSS pass didn't emit them. " +
      "If it's a hand-written `.sq-*` / `.pos-*` class it belongs in " +
      'src/styles/tokens.css (host-provided); otherwise the module Tailwind pass ' +
      "(vite.<id>-remote.config.ts `content`) didn't see the file it's in.",
  );
  process.exit(1);
}

console.log(`OK — every class the module uses is present in ${cssTarget}.`);
