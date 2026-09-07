// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `getAppliedRemotes`/`setAppliedRemotes`/`sameRemoteMap` MUST be reachable
// through `@pos/platform` — that's what makes `registry.ts` (host app) and
// `useAuth.ts` (bundled into the externalised platform chunk) share ONE
// `applied` instance in the real, split web build. This test can't reproduce
// that split (vitest resolves `@pos/platform` straight to `src/platform/
// index.ts`, so there's only ever one instance here regardless), but it does
// guard the other half of the fix: that the barrel keeps re-exporting these
// names at all. `check-platform-boundary.mjs` is what catches a file going
// around the barrel with a direct import; this catches the barrel itself
// losing the export. Between the two, this exact regression — the "module
// source changed" banner never clearing on pos.the-live.shop — can't
// reappear silently.
import { describe, expect, it } from 'vitest';
import * as platform from '.';

describe('@pos/platform re-exports the module-remotes singleton', () => {
  it('exposes getAppliedRemotes, setAppliedRemotes and sameRemoteMap', () => {
    expect(platform.getAppliedRemotes).toBeTypeOf('function');
    expect(platform.setAppliedRemotes).toBeTypeOf('function');
    expect(platform.sameRemoteMap).toBeTypeOf('function');
  });

  it('is the SAME instance useAuth.ts writes to directly', async () => {
    const direct = await import('../modules/appliedRemotes');
    // Same module under the hood in this test runtime — real proof the
    // barrel isn't wrapping a second copy of the state.
    expect(platform.setAppliedRemotes).toBe(direct.setAppliedRemotes);
    expect(platform.getAppliedRemotes).toBe(direct.getAppliedRemotes);
  });
});
