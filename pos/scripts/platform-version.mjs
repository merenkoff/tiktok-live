// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `PLATFORM_VERSION` from src/platform/version.ts, for build scripts that
// cannot import TypeScript — `sign-remote.mjs` stamps it into a module
// remote's manifest as `minHostPlatform` (roadmap #12 track 2). Read with a
// regex rather than compiled, same spirit as pkg-version.mjs.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The integer `PLATFORM_VERSION` this checkout's `@pos/platform` declares. */
export function platformVersion() {
  const file = path.join(dir, '..', 'src/platform/version.ts');
  const m = /export const PLATFORM_VERSION\s*=\s*(\d+)\s*;/.exec(readFileSync(file, 'utf-8'));
  if (!m) throw new Error(`platform-version: no PLATFORM_VERSION in ${file}`);
  return Number(m[1]);
}
