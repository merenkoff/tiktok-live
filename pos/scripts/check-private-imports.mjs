// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Keeps the online-only modules separable from the open platform
// (TechDocs/POS_OPENCORE.md §2, §4, O-1). Two rules, both about import EDGES:
//
//   1. A private module reaches the host only through `@host/*` or
//      `@pos/platform` — never a relative path out of the private set. A
//      relative `../../lib/x` works today and breaks the day the module's
//      sources live somewhere else; O-1 rewrote 100 of them, and nothing else
//      would stop the next PR from adding one back.
//   2. Nothing outside the private set imports into it — by a relative path or
//      by `@host/modules/<private>`. The host ships none of their code (they
//      load by URL at run time); an import edge into one would make the open
//      platform fail to build without the private sources.
//
// Moving between private modules is fine (`fiscal-checkbox` → `../fiscal-core`
// travels with them). Type-only imports count too: a missing file fails `tsc`
// just as surely as a missing value. Tests count too: they move with their
// module.
//
//   node scripts/check-private-imports.mjs

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(pos, 'src');
const modulesRoot = path.join(srcRoot, 'modules');

/** POS_OPENCORE.md §2: the online-only remotes plus the library two of them share (`private-modules.json`). */
const privateList = JSON.parse(readFileSync(path.join(pos, 'private-modules.json'), 'utf-8'));
const PRIVATE = [...privateList.remotes, ...privateList.libraries];

const privateDirs = PRIVATE.map((id) => path.join(modulesRoot, id));
const isPrivate = (file) => privateDirs.some((dir) => file === dir || file.startsWith(dir + path.sep));
const rel = (file) => path.relative(pos, file).replaceAll(path.sep, '/');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Where a specifier points inside `src/`, or null for a package. */
function targetOf(from, spec) {
  if (spec.startsWith('@host/')) return path.join(srcRoot, spec.slice('@host/'.length));
  if (spec.startsWith('.')) return path.resolve(path.dirname(from), spec);
  return null;
}

const MOCK_CALLS = new Set(['mock', 'doMock', 'unmock', 'importActual', 'importMock']);

/** Every module specifier a file names: imports, re-exports, `import()`, `require`, `vi.mock(...)`. */
function specifiersOf(file) {
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
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    out.push({ spec, line: line + 1 });
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node, node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node, node.argument.literal.text);
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments;
      const callee = node.expression;
      const named =
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === 'require') ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'vi' &&
          MOCK_CALLS.has(callee.name.text));
      if (named && arg && ts.isStringLiteral(arg)) add(node, arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const problems = [];
for (const file of walk(srcRoot)) {
  const fromPrivate = isPrivate(file);
  for (const { spec, line } of specifiersOf(file)) {
    const target = targetOf(file, spec);
    if (!target) continue;
    const toPrivate = isPrivate(target);
    if (fromPrivate && spec.startsWith('.') && !toPrivate) {
      problems.push(`${rel(file)}:${line}  imports "${spec}" — leaves the private modules by a relative path; use "@host/${rel(target).replace(/^src\//, '')}" or "@pos/platform"`);
    } else if (!fromPrivate && toPrivate) {
      problems.push(`${rel(file)}:${line}  imports "${spec}" — the open platform must not import a private module (${rel(target)})`);
    }
  }
}

if (problems.length > 0) {
  console.error('Imports across the open/private line (TechDocs/POS_OPENCORE.md §4):\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`check-private-imports: OK — ${PRIVATE.length} private modules reach the host only through @host/* or @pos/platform, and nothing open imports them.`);
