// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Guards the module-signing trust surface of the HOST shell build.
//
// `remoteSigningKeys.ts` trusts the non-secret DEV signing key only when the
// build sets `VITE_REMOTE_ALLOW_DEV_KEY=1` (web) / `POS_REMOTE_ALLOW_DEV_KEY=1`
// (desktop Rust). Anyone can sign a module with the dev key, so an OFFICIAL
// build that trusts it would load any attacker's module — the whole prod-key
// moat (`TechDocs/POS_LICENSING.md`) gone silently. The release pipeline already
// checks that a *module* was signed with the prod key
// (`.github/workflows/module-release.yml`), but nothing checked that the host
// shell itself was built WITHOUT the dev-key escape hatch. This does.
//
// Two checks, "pin the set, fail on drift" like check-tauri-capabilities.mjs:
//
//   1. Build-executor scan — only files that actually drive a build can make a
//      build trust the dev key: the two package.json manifests, the CI
//      workflows, Dockerfiles, and the e2e harness. (Docs and the source that
//      merely READS the flag mention its name constantly; they cannot set it for
//      a build, so they are out of scope.) In that scoped set the only files
//      allowed to set a `*_ALLOW_DEV_KEY=1` flag are the dev/test entry points
//      in APPROVED below (local run, e2e). A flag set anywhere else — a release
//      workflow, the Dockerfile, `build`/`build:cashier` — fails this guard.
//   2. Build-output scan — if a built host bundle is present (`dist/`,
//      `dist-cashier/`), the dev keyId must have been tree-shaken out of it; its
//      presence means the bundle trusts the dev key. Skipped when no build is
//      present, so `npm run check:prod-no-dev-key` is cheap locally and catches
//      a tainted bundle when run after a build in CI.
//
// No ESLint in pos/ — same lightweight style as check-tauri-capabilities.mjs.
//
//   node scripts/check-prod-no-dev-key.mjs

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(pos, '..');
const DOC = 'TechDocs/POS_LICENSING.md';

// A shell-style assignment of either flag to 1. Deliberately matches the
// SETTER `NAME=1`, not the readers (`=== '1'`, `option_env!(…), Some("1")`).
const SETTER_RE = /\b(?:VITE|POS)_REMOTE_ALLOW_DEV_KEY=1\b/;

// Dev keyId from remoteSigningKeys.ts DEV_REMOTE_KEY — must never survive into
// an official host bundle (it is dead code there and tree-shaken away).
const DEV_KEY_ID = 'a5dae462a776005d';

// Approved dev/test entry points that MAY set the dev-key flag, each with why.
// A path here is a deliberate, reviewed exception — never add one to make an
// official build pass; remove the flag from the official build instead.
// `pos/package.json` is handled by the precise per-script check below, not here.
const APPROVED = new Map([
  ['pos/playwright.config.ts', 'e2e — remotes.spec.ts signs a throwaway module with the dev key'],
]);

/** Does this tracked file actually drive a build (so a flag in it would bite)? */
function isBuildExecutor(rel) {
  if (rel === 'package.json' || rel === 'pos/package.json') return true;
  if (rel.startsWith('.github/workflows/') && /\.ya?ml$/.test(rel)) return true;
  if (/(^|\/)Dockerfile[^/]*$/i.test(rel)) return true;
  if (rel === 'pos/playwright.config.ts') return true;
  return false;
}

const problems = [];

// ── 1. Scan the files that actually drive a build ──────────────────────────
let tracked;
try {
  tracked = execSync('git ls-files', { cwd: repo, encoding: 'utf-8' }).split('\n').filter(Boolean);
} catch (e) {
  console.error(`check-prod-no-dev-key: cannot list tracked files\n  ${e.message}`);
  process.exit(1);
}

for (const rel of tracked) {
  if (!isBuildExecutor(rel)) continue;
  if (rel === 'pos/package.json') continue; // precise per-script check below
  let text;
  try {
    text = readFileSync(path.join(repo, rel), 'utf-8');
  } catch {
    continue;
  }
  if (!SETTER_RE.test(text)) continue;
  if (!APPROVED.has(rel)) {
    problems.push(
      `${rel} sets a *_ALLOW_DEV_KEY=1 flag but is not an approved dev/test entry point.\n` +
        `    -> An official build must NOT trust the dev signing key. Remove the flag, or — only if\n` +
        `       this really is a dev/test-only file — add it to APPROVED in pos/scripts/check-prod-no-dev-key.mjs with a reason, and note it in ${DOC}.`
    );
  }
}

// pos/package.json: pin WHICH script may carry the flag (build:local only), so a
// future `build`/`build:cashier` that adds it is caught.
try {
  const pkg = JSON.parse(readFileSync(path.join(pos, 'package.json'), 'utf-8'));
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    if (typeof cmd === 'string' && SETTER_RE.test(cmd) && name !== 'build:local') {
      problems.push(
        `pos/package.json script "${name}" sets a *_ALLOW_DEV_KEY=1 flag.\n` +
          `    -> Only "build:local" may. An official build command must not trust the dev key.`
      );
    }
  }
} catch (e) {
  problems.push(`cannot parse pos/package.json: ${e.message}`);
}

// ── 2. Build-output scan (only if a host build is present) ─────────────────
let scannedBundle = false;
for (const distDir of ['dist', 'dist-cashier']) {
  const assets = path.join(pos, distDir, 'assets');
  if (!existsSync(assets)) continue;
  scannedBundle = true;
  for (const file of readdirSync(assets)) {
    if (!file.endsWith('.js')) continue;
    const js = readFileSync(path.join(assets, file), 'utf-8');
    if (js.includes(DEV_KEY_ID)) {
      problems.push(
        `${distDir}/assets/${file} contains the dev signing keyId ${DEV_KEY_ID}.\n` +
          `    -> This host bundle TRUSTS the dev key — it was built with the escape hatch set.\n` +
          `       Rebuild without VITE_REMOTE_ALLOW_DEV_KEY. An official build tree-shakes the dev key out.`
      );
    }
  }
}

if (problems.length > 0) {
  console.error('check-prod-no-dev-key: the dev-signing-key escape hatch could ship in an official build:\n');
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

console.log(
  `check-prod-no-dev-key: OK — dev-key flag set only in ${APPROVED.size} approved dev/test place(s)` +
    (scannedBundle ? '; built host bundle does not trust the dev key.' : ' (no built bundle to scan).')
);
