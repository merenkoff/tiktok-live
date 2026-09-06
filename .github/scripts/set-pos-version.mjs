// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Single source of truth for the POS desktop app version.
//
// Usage:
//   node .github/scripts/set-pos-version.mjs 1.0.5          # explicit
//   node .github/scripts/set-pos-version.mjs patch|minor|major   # bump current
//
// Writes the resolved version into every manifest the Tauri build and the
// in-app updater read, so a plain `npm run tauri:build` from a fresh checkout
// reports the right version (update.rs compares GitHub's newest `pos-v*` tag
// against `app.package_info().version`, which is baked from tauri.conf.json).
// Prints the resolved version to stdout — nothing else — so CI can capture it.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const p = (...s) => path.join(repoRoot, ...s);

const PKG_JSON = p('pos', 'package.json');
const TAURI_CONF = p('pos', 'src-tauri', 'tauri.conf.json');
const CARGO_TOML = p('pos', 'src-tauri', 'Cargo.toml');
const CARGO_LOCK = p('pos', 'src-tauri', 'Cargo.lock');
const CRATE = 'cloth-pos';

// Plain semver: MAJOR.MINOR.PATCH, optional -prerelease, optional +build.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function die(msg) {
  console.error(`set-pos-version: ${msg}`);
  process.exit(1);
}

function currentVersion() {
  return JSON.parse(readFileSync(PKG_JSON, 'utf-8')).version;
}

function resolveTarget(arg) {
  if (!arg) die('missing argument: <version> | patch | minor | major');
  if (['patch', 'minor', 'major'].includes(arg)) {
    const m = SEMVER.exec(currentVersion());
    if (!m) die(`current version "${currentVersion()}" is not plain semver`);
    let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (arg === 'major') { maj += 1; min = 0; pat = 0; }
    else if (arg === 'minor') { min += 1; pat = 0; }
    else { pat += 1; }
    return `${maj}.${min}.${pat}`;
  }
  const v = arg.replace(/^pos-v/, '').replace(/^v/, '');
  if (!SEMVER.test(v)) die(`"${arg}" is not a valid semver version or bump keyword`);
  return v;
}

const version = resolveTarget(process.argv[2]);

// package.json — keep 2-space indent + trailing newline (npm convention).
{
  const json = JSON.parse(readFileSync(PKG_JSON, 'utf-8'));
  json.version = version;
  writeFileSync(PKG_JSON, JSON.stringify(json, null, 2) + '\n');
}

// tauri.conf.json — same formatting rules.
{
  const json = JSON.parse(readFileSync(TAURI_CONF, 'utf-8'));
  json.version = version;
  writeFileSync(TAURI_CONF, JSON.stringify(json, null, 2) + '\n');
}

// Cargo.toml — only the version line inside [package].
{
  const src = readFileSync(CARGO_TOML, 'utf-8');
  let inPackage = false;
  let replaced = false;
  const out = src.split('\n').map((line) => {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (section) { inPackage = section[1].trim() === 'package'; return line; }
    if (inPackage && !replaced && /^\s*version\s*=/.test(line)) {
      replaced = true;
      return `version = "${version}"`;
    }
    return line;
  }).join('\n');
  if (!replaced) die('could not find [package] version in Cargo.toml');
  writeFileSync(CARGO_TOML, out);
}

// Cargo.lock — the version line in the `name = "cloth-pos"` block.
{
  const src = readFileSync(CARGO_LOCK, 'utf-8');
  const re = new RegExp(`(name = "${CRATE}"\\nversion = ")[^"]+(")`);
  if (!re.test(src)) die(`could not find ${CRATE} entry in Cargo.lock`);
  writeFileSync(CARGO_LOCK, src.replace(re, `$1${version}$2`));
}

console.log(version);
