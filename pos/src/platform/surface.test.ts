// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Pins the runtime export set of `@pos/platform` and `@pos/platform/ui` to
 * `surface.snapshot.json`, together with the `PLATFORM_VERSION` that surface
 * was published under (roadmap #12 track 2, TechDocs/POS_MODULE_PLATFORM_VERSION.md).
 *
 * Why: a module-remote links against these exports at `import()` time. Adding
 * or removing one silently is what makes a module built later fail to link on
 * a till that has not updated. So the surface may only change together with a
 * `PLATFORM_VERSION` bump, and this test is what remembers that.
 *
 * Failing here means one of:
 *   - the export set changed → bump `PLATFORM_VERSION` in `version.ts`, then
 *     `npm run platform:snapshot`;
 *   - `PLATFORM_VERSION` was bumped (e.g. for a signature change) → just
 *     `npm run platform:snapshot`.
 * The snapshot script refuses to record a changed surface without a bump.
 *
 * Only names are compared — a signature or semantic change is invisible here
 * and stays the reviewer's job. That is the honest scope: what this catches is
 * exactly the class of failure that reaches a user as a blank screen.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as platform from './index';
import * as ui from './ui';
import { PLATFORM_VERSION } from './version';

// Under jsdom `import.meta.url` is an http: URL, so resolve from the package
// root vitest runs in (`pos/`).
const SNAPSHOT_PATH = path.resolve(process.cwd(), 'src/platform/surface.snapshot.json');

interface Snapshot {
  platformVersion: number;
  exports: { platform: string[]; ui: string[] };
}

const current: Snapshot['exports'] = {
  platform: Object.keys(platform).sort(),
  ui: Object.keys(ui).sort(),
};

function sameSurface(a: Snapshot['exports'], b: Snapshot['exports']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe('@pos/platform surface', () => {
  it('matches surface.snapshot.json for the current PLATFORM_VERSION', () => {
    let snapshot: Snapshot | null = null;
    try {
      snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as Snapshot;
    } catch {
      snapshot = null;
    }

    if (process.env.UPDATE_PLATFORM_SURFACE === '1') {
      if (snapshot && !sameSurface(current, snapshot.exports) && PLATFORM_VERSION <= snapshot.platformVersion) {
        throw new Error(
          `The @pos/platform export set changed but PLATFORM_VERSION is still ${PLATFORM_VERSION} ` +
            `(snapshot: ${snapshot.platformVersion}). Bump PLATFORM_VERSION in src/platform/version.ts first.`
        );
      }
      writeFileSync(
        SNAPSHOT_PATH,
        `${JSON.stringify({ platformVersion: PLATFORM_VERSION, exports: current }, null, 2)}\n`
      );
      return;
    }

    expect(snapshot, 'surface.snapshot.json missing — run `npm run platform:snapshot`').not.toBeNull();
    expect(
      current,
      'The @pos/platform export set differs from surface.snapshot.json. If the change is intended: ' +
        'bump PLATFORM_VERSION in src/platform/version.ts, then `npm run platform:snapshot`.'
    ).toEqual(snapshot!.exports);
    expect(
      PLATFORM_VERSION,
      'PLATFORM_VERSION differs from surface.snapshot.json — run `npm run platform:snapshot` to record it.'
    ).toBe(snapshot!.platformVersion);
  });
});
