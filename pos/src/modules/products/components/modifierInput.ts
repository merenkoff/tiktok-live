// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { uahInputToCents } from '@pos/platform';

/**
 * «-20» / «−20» / «+15» / «15» → signed kopecks. `uahInputToCents` alone
 * reads a minus as 0, and a smaller portion IS a negative delta.
 */
export function signedUahInputToCents(value: string): number {
  const trimmed = value.trim();
  const negative = /^[-−–]/.test(trimmed);
  const cents = uahInputToCents(trimmed.replace(/^[-−–+]\s*/, ''));
  return negative ? -cents : cents;
}

/** What the server said, or the fallback. */
export function errorText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } } | null;
  return e?.response?.data?.error || fallback;
}
