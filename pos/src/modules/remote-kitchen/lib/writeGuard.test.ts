// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { createWriteGuard } from './writeGuard';

describe('createWriteGuard', () => {
  it('applies a read nothing was written around', () => {
    const guard = createWriteGuard();
    expect(guard.fresh(guard.stamp())).toBe(true);
  });

  it('drops a read that started before a write, whether the write is still out or back', () => {
    const guard = createWriteGuard();
    const before = guard.stamp();
    guard.begin();
    expect(guard.fresh(before)).toBe(false);
    const during = guard.stamp();
    expect(guard.fresh(during)).toBe(false); // the write is still on its way
    guard.end();
    expect(guard.fresh(before)).toBe(false);
    expect(guard.fresh(during)).toBe(false);
    expect(guard.fresh(guard.stamp())).toBe(true); // the read after the write
  });

  it('waits for every write when two are out at once', () => {
    const guard = createWriteGuard();
    guard.begin();
    guard.begin();
    guard.end();
    expect(guard.fresh(guard.stamp())).toBe(false);
    guard.end();
    expect(guard.fresh(guard.stamp())).toBe(true);
  });
});
