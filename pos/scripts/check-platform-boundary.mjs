// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Guards the invariant the externalised-`@pos/platform` web build depends on:
// the shared singletons (auth/cart Zustand stores, the api singleton's axios
// client, the offline-status store, the offline module-hooks registry, the
// applied module-remote map, the shell React context) must be reached ONLY
// through `@pos/platform`. A file outside the platform chunk that imports them
// from a local relative path instead gets a second, disconnected copy once
// `@pos/platform` is an external chunk — the exact bug this build layout
// exists to prevent (see TechDocs/POS_MODULE_REMOTE_POC.md).
//
// This used to be a hand-written list of banned import specifiers, and it let
// the real thing through: `hooks/useVertical.ts` reaches `hooks/useAuth.ts`
// transitively, nobody added it to the list, and SettingsPage shipped a second
// auth store — an empty one — so a flower shop read as «Одяг» in the admin.
// So the two sets are COMPUTED now, and only the state owners are named:
//
//   PLATFORM  — the transitive closure of relative imports from
//               `src/platform/index.ts`: what is compiled INTO the external
//               chunk (vite.platform-remote.config.ts).
//   STATEFUL  — the state owners below plus everything that reaches one of
//               them through relative imports.
//
// A violation is an edge from OUTSIDE `PLATFORM` into a file that is in
// `PLATFORM` *and* `STATEFUL`. Everything else is fine: host code importing
// host code duplicates nothing (one Rollup run, one copy), and a stateless
// leaf inside the platform chunk (`lib/money.ts`, `lib/vertical.ts`, every
// `@pos/platform/ui` component) is deliberately bundled by each consumer.
//
// Import edges come from the TypeScript parser rather than a regex per line:
// the old line-based matcher could not see a multi-line
// `import {\n  useAuthStore,\n} from '../hooks/useAuth'` at all, and could not
// tell a type-only import (erased, harmless) from a value one.
//
//   node scripts/check-platform-boundary.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(pos, 'src');

/** What `@pos/platform` is built from — the root of the PLATFORM closure. */
const PLATFORM_ENTRY = 'src/platform/index.ts';

/**
 * The files that OWN something a page may have only one of.
 *
 * Mostly shared mutable state — a Zustand store, a module-level registry or
 * client, a React context — where a second copy is a second source of truth.
 *
 * But not only. `lib/urls.ts` owns no state at all: it is pure functions, and
 * by the rule above it reads as one of the stateless leaves a remote is
 * *supposed* to bundle. What it actually owns is the **identity of the API
 * origin**, baked in at build time from `VITE_API_BASE` — and a remote is built
 * once, in CI, and served to many stores on many domains. Its copy therefore
 * compiles with an empty origin and can only ever produce root-relative URLs,
 * against the POS's own host rather than the API's.
 *
 * That shipped: `ProductTile` reached it relatively, so every catalog tile in
 * the flowers module asked `pos.<shop>` for `/demo-flowers/*.svg`, got a 404 and
 * fell back to its grey caption — while the cart, host code with the host's
 * copy, showed the same photos correctly.
 *
 * So the test is not «does it hold state» but «would a second copy disagree
 * with the host's». A pure leaf that bakes in build configuration does.
 */
const STATE_OWNERS = [
  ['src/hooks/useAuth.ts', 'useAuthStore — the session every screen reads'],
  ['src/hooks/useCart.ts', 'useCartStore — the cart the sell screen rings up'],
  ['src/offline/status.ts', 'the offline-status store'],
  ['src/shell.tsx', 'PosShellContext / usePosShell'],
  [
    'src/services/api.ts',
    "the api singleton's axios client (a second one can even bake in a different VITE_API_BASE)",
  ],
  [
    'src/modules/appliedRemotes.ts',
    'the applied module-remote map — a second copy never sees what useAuth.ts writes, so the "module source changed" banner never clears',
  ],
  [
    'src/offline/moduleHooks.ts',
    'the offline module-hooks registry — a second copy is one the sync loop never reads',
  ],
  [
    'src/lib/urls.ts',
    'the API origin, baked in from VITE_API_BASE — a remote is built in CI without it, so its copy resolves every /pos-uploads and /demo-flowers path against the POS host instead of the API',
    // Scoped, unlike the stores above, and the difference is real: a second
    // copy of a store is wrong anywhere, while a second copy of this one is
    // wrong only where it is compiled SEPARATELY from the host. Host code
    // duplicates nothing — one Rollup run, one module. So the danger zone is
    // exactly what a remote bundle can pull in.
    'remote-bundled',
  ],
];

/** The entry whose closure a remote compiles into its own bundle. */
const UI_ENTRY = 'src/platform/ui.ts';

/**
 * Files that may reach a singleton relatively although they are not part of the
 * platform chunk. Only the test harness qualifies: it drives the stores
 * directly under Vitest, where nothing is externalised.
 */
const ALLOW = ['src/test/'];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const rel = (file) => path.relative(pos, file).replaceAll(path.sep, '/');

/** `./x` -> the file it actually is. Bare specifiers are someone else's problem. */
function resolveRelative(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [
    base + '.ts',
    base + '.tsx',
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** True when the whole import/export is types — erased, so it duplicates nothing. */
function isTypeOnly(node) {
  // `import type { X } from` carries the flag on the CLAUSE, `export type { X }
  // from` on the declaration itself. Reading only the latter is why the first
  // draft of this rewrite reported every `import type { PosShell }`.
  if (ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly) return true;
  const bindings = ts.isImportDeclaration(node)
    ? node.importClause?.namedBindings
    : node.exportClause;
  if (bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0) {
    return bindings.elements.every((el) => el.isTypeOnly);
  }
  if (bindings && ts.isNamedExports(bindings) && bindings.elements.length > 0) {
    return bindings.elements.every((el) => el.isTypeOnly);
  }
  return false;
}

/** Every relative import edge of one file, as { target, statement }. */
function edgesOf(file) {
  const text = readFileSync(file, 'utf-8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out = [];
  const add = (node, spec) => {
    const target = resolveRelative(file, spec);
    if (!target) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    out.push({ target, spec, line: line + 1 });
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!isTypeOnly(node)) add(node, node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const [arg] = node.arguments;
      if ((isDynamicImport || isRequire) && arg && ts.isStringLiteral(arg)) add(node, arg.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return out;
}

const files = walk(srcRoot);
const edges = new Map(files.map((f) => [f, edgesOf(f)]));

/** Everything reachable from `start` through relative imports. */
function closure(start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const edge of edges.get(file) ?? []) queue.push(edge.target);
  }
  return seen;
}

const platformEntry = path.join(pos, PLATFORM_ENTRY);
if (!existsSync(platformEntry)) {
  console.error(`check-platform-boundary: ${PLATFORM_ENTRY} is gone — update this script.`);
  process.exit(1);
}
const PLATFORM = closure(platformEntry);

/**
 * What can end up inside a remote's own bundle, computed rather than guessed:
 * the closure of `@pos/platform/ui` (which every remote bundles by alias) plus
 * the closure of each module's `remote-entry.ts`.
 *
 * Deliberately not «everything under src/modules/» — `registry.ts`,
 * `selectNav.ts` and their neighbours are host files that happen to live there.
 * And deliberately not «only a module's own folder» either: a module reaches
 * shared helpers like `modules/telemetry.ts`, and those travel with it.
 *
 * Anything outside this set is host-only, compiled once, and cannot hold a
 * second copy of anything.
 */
const uiEntry = path.join(pos, UI_ENTRY);
if (!existsSync(uiEntry)) {
  console.error(`check-platform-boundary: ${UI_ENTRY} is gone — update this script.`);
  process.exit(1);
}
const REMOTE_BUNDLED = closure(uiEntry);
for (const file of files) {
  if (/^src\/modules\/[^/]+\/remote-entry\.ts$/.test(rel(file))) {
    for (const reached of closure(file)) REMOTE_BUNDLED.add(reached);
  }
}

const owners = new Map(
  STATE_OWNERS.map(([file, what, scope]) => [path.join(pos, file), { what, scope }])
);
for (const owner of owners.keys()) {
  if (!existsSync(owner)) {
    console.error(`check-platform-boundary: state owner ${rel(owner)} is gone — update this script.`);
    process.exit(1);
  }
}

/** The path from `file` to the state owner it reaches, or null. */
const reachMemo = new Map();
function reachesOwner(file, stack = new Set()) {
  if (owners.has(file)) return [file];
  if (reachMemo.has(file)) return reachMemo.get(file);
  if (stack.has(file)) return null; // cycle — this branch answers nothing
  stack.add(file);
  let found = null;
  for (const edge of edges.get(file) ?? []) {
    const rest = reachesOwner(edge.target, stack);
    if (rest) {
      found = [file, ...rest];
      break;
    }
  }
  stack.delete(file);
  reachMemo.set(file, found);
  return found;
}

const violations = [];
for (const file of files) {
  const relPath = rel(file);
  if (PLATFORM.has(file)) continue; // inside the chunk: relative is how it is built
  if (ALLOW.some((a) => relPath.startsWith(a) || relPath === a)) continue;
  for (const edge of edges.get(file) ?? []) {
    if (!PLATFORM.has(edge.target)) continue;
    const chain = reachesOwner(edge.target);
    if (!chain) continue; // stateless leaf of the platform chunk — a copy is harmless
    const owner = owners.get(chain[chain.length - 1]);
    // An owner that only matters inside a remote lets host-only importers past.
    if (owner.scope === 'remote-bundled' && !REMOTE_BUNDLED.has(file)) continue;
    violations.push({
      relPath,
      line: edge.line,
      spec: edge.spec,
      chain: chain.map(rel).join(' -> '),
      what: owner.what,
    });
  }
}

if (violations.length > 0) {
  console.error('Cross-boundary singleton imports found — route these through "@pos/platform":\n');
  for (const v of violations) {
    console.error(`  ${v.relPath}:${v.line}  imports "${v.spec}"`);
    console.error(`    ${v.chain}`);
    console.error(`    -> a second copy of ${v.what}\n`);
  }
  process.exit(1);
}

console.log('check-platform-boundary: OK — shared singletons only reached via "@pos/platform".');
