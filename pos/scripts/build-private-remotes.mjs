// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Open-core (TechDocs/POS_OPENCORE.md §5, step O-2). The Playwright `webServer`
// builds the online-only module bundles the private e2e specs serve — but only
// the ones whose source is present. When those modules' source moves to a
// private repo (O-6), a stripped public checkout builds none of them and the
// ten specs that need them skip (e2e/_private.ts), instead of the whole job
// failing on the first missing `build:<id>-remote`.
//
// Run from `pos/`: `node scripts/build-private-remotes.mjs`.
// `stocktake` is an online-only remote too, but an open one (POS_OPENCORE.md §2),
// so it is always present and stays an explicit build in playwright.config.ts.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const posRoot = path.resolve(dir, '..');

// Each private remote the e2e suite serves: its `src/modules/<id>` source and
// the `npm run build:<id>-remote` script that produces `dist-remotes/<id>`.
const PRIVATE_REMOTES = [
  'vertical-flowers',
  'vertical-cafe',
  'vertical-grocery',
  'tables',
  'debts',
  'fiscal-cashalot',
  'fiscal-checkbox',
  'tiktok-live',
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const id of PRIVATE_REMOTES) {
  const present = existsSync(path.join(posRoot, 'src', 'modules', id));
  if (!present) {
    console.warn(`[build-private-remotes] skip ${id}: src/modules/${id} not present`);
    continue;
  }
  console.warn(`[build-private-remotes] build ${id}`);
  execFileSync(npm, ['run', `build:${id}-remote`], { cwd: posRoot, stdio: 'inherit' });
}
