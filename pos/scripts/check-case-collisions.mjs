// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Refuses two source files in one directory whose names differ only by case.
//
// Why: CI and the Linux build run on a case-sensitive file system, where
// `VariantMatrix.tsx` and `variantMatrix.ts` are two files. The macOS and
// Windows runners of «POS Release» are case-insensitive, where TypeScript
// resolves `./VariantMatrix` and `./variantMatrix` to ONE file and fails with
// TS1149 / TS2305 — which is how release 2.5.0 built for Linux and failed for
// the two platforms the shops actually run (2026-10-05). The extension is
// ignored on purpose: module resolution ignores it too.
//
// Usage: node scripts/check-case-collisions.mjs [dir ...]   (default: src)

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('src');

const collisions = [];

function walk(dir) {
  const byKey = new Map();
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    // `variantMatrix.test.ts` → `variantmatrix.test`; `VariantMatrix.tsx` → `variantmatrix`.
    const stem = entry.replace(/\.[^.]+$/, '');
    const key = stem.toLowerCase();
    const seen = byKey.get(key);
    if (seen && seen.stem !== stem) collisions.push([path.join(dir, seen.name), full]);
    if (!seen) byKey.set(key, { stem, name: entry });
  }
}

for (const root of roots) walk(root);

if (collisions.length > 0) {
  console.error('check-case-collisions: files in one directory that differ only by case:');
  for (const [a, b] of collisions) console.error(`  ${a}\n  ${b}`);
  console.error('TypeScript on macOS/Windows resolves them to one file; rename or move one of each pair.');
  process.exit(1);
}
console.log(`check-case-collisions: OK — no case-only name pairs under ${roots.join(', ')}.`);
