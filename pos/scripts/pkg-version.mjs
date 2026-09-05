// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `version` from this app's own package.json. Every Vite config stamps it into
// the bundle as `__POS_APP_VERSION__` (see pos/src/platform/version.ts →
// POS_APP_VERSION); a module-remote built from its own checkout therefore
// reports its own build version in the session-manifest telemetry (roadmap #6).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Read `version` from `pos/package.json`. Falls back to `0.0.0` if missing. */
export function posAppVersion() {
  const pkgPath = path.join(dir, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}
