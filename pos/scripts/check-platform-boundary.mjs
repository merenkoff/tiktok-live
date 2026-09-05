// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Guards the invariant the externalised-`@pos/platform` web build depends on:
// the shared singletons (auth/cart Zustand stores, the offline-status store,
// the shell React context) must be reached ONLY through `@pos/platform`. A
// file that imports them from a local relative path instead gets a second,
// disconnected copy once `@pos/platform` is an external chunk — the exact bug
// this build layout exists to prevent (see TechDocs/POS_MODULE_REMOTE_POC.md).
//
// No ESLint in pos/ — same lightweight style as check-module-css-coverage.mjs.
//
//   node scripts/check-platform-boundary.mjs

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(pos, 'src');

// Files/dirs that legitimately own or re-export these singletons.
const ALLOW = [
  'src/platform/',
  'src/shell.tsx',
  'src/hooks/useAuth.ts',
  'src/hooks/useCart.ts',
  'src/offline/status.ts',
  'src/offline/enabled.ts',
  'src/test/',
  // Re-exported by src/platform/auth.ts, i.e. bundled INTO the platform chunk —
  // importing it back through "@pos/platform" would be a barrel cycle.
  'src/modules/useEnabledModules.ts',
];

// import specifier (any relative depth) -> what it smuggles in
const BANNED = [
  { re: /(['"])(?:\.\.?\/)+hooks\/useAuth\1/, what: 'useAuthStore (import from "@pos/platform")' },
  { re: /(['"])(?:\.\.?\/)+hooks\/useCart\1/, what: 'useCartStore (import from "@pos/platform")' },
  { re: /(['"])(?:\.\.?\/)+offline\/status\1/, what: 'the offline-status store (import from "@pos/platform")' },
  { re: /(['"])(?:\.\.?\/)+shell\1/, what: 'PosShellContext / usePosShell (import from "@pos/platform")' },
  {
    re: /(['"])(?:\.\.?\/)+modules\/useEnabledModules\1/,
    what: 'useEnabledModules — reads the auth store, so a host-local copy sees an empty one (import from "@pos/platform")',
  },
];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(srcRoot)) {
  const rel = path.relative(pos, file).replaceAll(path.sep, '/');
  if (ALLOW.some((a) => rel.startsWith(a) || rel === a)) continue;
  const src = readFileSync(file, 'utf-8');
  for (const line of src.split('\n')) {
    if (!/^\s*import\b/.test(line) && !/\brequire\(/.test(line)) continue;
    if (/^\s*import\s+type\b/.test(line)) continue; // types are erased — harmless
    for (const { re, what } of BANNED) {
      if (re.test(line)) violations.push({ rel, line: line.trim(), what });
    }
  }
}

if (violations.length > 0) {
  console.error('Cross-boundary singleton imports found — route these through "@pos/platform":\n');
  for (const v of violations) console.error(`  ${v.rel}\n    ${v.line}\n    -> ${v.what}\n`);
  process.exit(1);
}

console.log('check-platform-boundary: OK — shared singletons only reached via "@pos/platform".');
