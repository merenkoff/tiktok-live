// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A `client_uuid` for a write the server dedupes on (a round, seating a table).
 *
 * Only a very old webview lacks `randomUUID`; the value still has to look like
 * one, because the server validates the shape before it dedupes on it.
 */
export function newUuid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const tail = `${Date.now()}${Math.floor(Math.random() * 1e6)}`.padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${tail}`;
}
