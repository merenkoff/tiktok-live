// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which side of a link this store is on — a cafe that asks a kitchen, a
// kitchen that cooks for cafes, both, or neither — from one read of
// `GET /remote-kitchen/setup`. The till's banner holds two strips (the
// kitchen's «Запити з точок» and the cafe's «Замовлення з кухні»), and both
// start by asking this; one read in flight serves both, and a fresh answer
// is reused for half a minute — for the same store only, so signing into
// another store on this till asks again.
//
// A store is a cafe while it has a link to a kitchen OR orders it still has
// to follow (`cafe_orders`): after the super admin revokes the link, what is
// on its way and a kitchen's unanswered cancel stay on the cafe's till.

import { currentStoreId, posRequest } from './hostPlatform';

export interface StoreSides {
  cafe: boolean;
  kitchen: boolean;
}

export const SIDES_FRESH_MS = 30_000;

let cached: { at: number; store: number | null; read: Promise<StoreSides> } | null = null;

export function readSides(now: number = Date.now(), store: number | null = currentStoreId()): Promise<StoreSides> {
  if (cached && cached.store === store && now - cached.at < SIDES_FRESH_MS) return cached.read;
  const read = posRequest<{ as_cafe?: unknown; as_kitchen?: unknown; cafe_orders?: unknown }>(
    'get',
    '/remote-kitchen/setup'
  ).then((res) => ({ cafe: res?.as_cafe != null || res?.cafe_orders === true, kitchen: res?.as_kitchen != null }));
  const entry = { at: now, store, read };
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
