// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Guards the two lists that decide what a runtime-loaded feature module can
// reach inside the desktop cashier's webview (roadmap #13 Part E):
//
//   1. the window's capability permissions — everything a `core:*`/plugin
//      command path is allowed to do;
//   2. the app's own `tauri::generate_handler!` commands — which are NOT
//      ACL-gated, so every entry there is reachable by any script in the
//      webview, module code included.
//
// Both are pinned here. Widening either is a real change to the trust surface,
// so it has to be a deliberate edit of this file plus
// TechDocs/POS_MODULE_TAURI_CAPABILITIES.md — not a silent drift.
//
// No ESLint in pos/ — same lightweight style as check-platform-boundary.mjs.
//
//   node scripts/check-tauri-capabilities.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'TechDocs/POS_MODULE_TAURI_CAPABILITIES.md';

/**
 * The permissions `capabilities/default.json` is expected to grant, normalised
 * to one string per entry (`identifier` + its scope, if scoped).
 */
const EXPECTED_PERMISSIONS = [
  'opener:allow-open-url allow=https://github.com/merenkoff/tiktok-live/releases/*',
];

/** The commands registered in `src/lib.rs`'s `tauri::generate_handler![…]`. */
const EXPECTED_COMMANDS = [
  'check_for_update',
  'list_hardware',
  'list_printers',
  'print_receipt',
  'print_webview',
  'sync_module_remote',
];

/** `"core:default"` or `{ identifier, allow?: [{url|path}] }` → a stable string. */
function describePermission(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object' || typeof entry.identifier !== 'string') {
    return `<malformed: ${JSON.stringify(entry)}>`;
  }
  const scope = [];
  for (const key of ['allow', 'deny']) {
    for (const item of entry[key] ?? []) {
      scope.push(`${key}=${item?.url ?? item?.path ?? JSON.stringify(item)}`);
    }
  }
  return [entry.identifier, ...scope].join(' ');
}

/** Command idents inside `tauri::generate_handler![ … ]`, last path segment only. */
function parseHandlerCommands(src) {
  const start = src.indexOf('generate_handler![');
  if (start < 0) return null;
  const open = src.indexOf('[', start);
  const close = src.indexOf(']', open);
  if (close < 0) return null;
  return src
    .slice(open + 1, close)
    .split(',')
    .map((s) => s.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean)
    .map((s) => s.split('::').pop());
}

const problems = [];

function compare(what, actual, expected, hint) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  const added = a.filter((x) => !e.includes(x));
  const removed = e.filter((x) => !a.includes(x));
  if (added.length || removed.length) {
    problems.push({ what, added, removed, hint });
  }
}

// 1. capabilities/default.json
const capPath = path.join(pos, 'src-tauri/capabilities/default.json');
let cap;
try {
  cap = JSON.parse(readFileSync(capPath, 'utf-8'));
} catch (e) {
  console.error(`check-tauri-capabilities: cannot read ${capPath}\n  ${e.message}`);
  process.exit(1);
}
compare(
  'src-tauri/capabilities/default.json permissions',
  (cap.permissions ?? []).map(describePermission),
  EXPECTED_PERMISSIONS,
  `Widening these widens what any script in the cashier webview may do. Update EXPECTED_PERMISSIONS here and the "Текущий набор прав" section of ${DOC}.`
);

// 2. tauri::generate_handler!
const libPath = path.join(pos, 'src-tauri/src/lib.rs');
const commands = parseHandlerCommands(readFileSync(libPath, 'utf-8'));
if (commands === null) {
  console.error(`check-tauri-capabilities: no generate_handler![…] found in ${libPath}`);
  process.exit(1);
}
compare(
  'src-tauri/src/lib.rs generate_handler! commands',
  commands,
  EXPECTED_COMMANDS,
  `App commands are not ACL-gated: every one of these is callable by a runtime-loaded module. Update EXPECTED_COMMANDS here and run the new-command checklist in ${DOC}.`
);

if (problems.length > 0) {
  console.error('Tauri trust surface changed:\n');
  for (const p of problems) {
    console.error(`  ${p.what}`);
    for (const x of p.added) console.error(`    + ${x}`);
    for (const x of p.removed) console.error(`    - ${x}`);
    console.error(`    -> ${p.hint}\n`);
  }
  process.exit(1);
}

console.log(
  `check-tauri-capabilities: OK — ${EXPECTED_PERMISSIONS.length} permission(s), ` +
    `${EXPECTED_COMMANDS.length} app command(s), both as documented.`
);
