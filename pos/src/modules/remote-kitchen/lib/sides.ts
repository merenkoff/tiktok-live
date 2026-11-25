// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which side of a link this store is on — a cafe that asks a kitchen, a
// kitchen that cooks for cafes, both, or neither — from one read of
// `GET /remote-kitchen/setup`. The till's banner holds two strips (the
// kitchen's «Запити з точок» and the cafe's «Замовлення з кухні»), and both
// start by asking this; one read in flight serves both, and a fresh answer
// is reused for half a minute.

import { posRequest } from './hostPlatform';

export interface StoreSides {
  cafe: boolean;
  kitchen: boolean;
}

export const SIDES_FRESH_MS = 30_000;

/** `GET /remote-kitchen/setup` as it came: the tile marks read the cafe's half of it too. */
export interface RawSetup {
  as_cafe?: unknown;
  as_kitchen?: unknown;
}

let cached: { at: number; read: Promise<RawSetup>; sides?: Promise<StoreSides> } | null = null;

export function readSides(now: number = Date.now()): Promise<StoreSides> {
  const read = readSetupShared(now);
  const entry = cached;
  if (entry && entry.read === read && entry.sides) return entry.sides;
  const sides = read.then((res) => ({ cafe: res?.as_cafe != null, kitchen: res?.as_kitchen != null }));
  if (entry && entry.read === read) entry.sides = sides;
  return sides;
}

/** The same read, whole — shared with `readSides`, fresh for half a minute. */
export function readSetupShared(now: number = Date.now()): Promise<RawSetup> {
  if (cached && now - cached.at < SIDES_FRESH_MS) return cached.read;
  const read = posRequest<RawSetup>('get', '/remote-kitchen/setup').then((res) => res ?? {});
  const entry = { at: now, read };
  cached = entry;
  // A failed read is not remembered: the next ask goes to the server again.
  read.catch(() => {
    if (cached === entry) cached = null;
  });
  return read;
}

/** Tests only: forget the last answer. */
export function forgetSides(): void {
  cached = null;
}
