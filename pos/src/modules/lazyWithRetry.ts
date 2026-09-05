// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy, type ComponentType } from 'react';

interface RetryOptions {
  retries?: number;
  backoffMs?: number;
}

/**
 * Retry a dynamic `import()` a few times with exponential backoff before
 * giving up. A module-remote page chunk is fetched over the network at
 * navigation time; a single transient failure (slow till, remote redeploying)
 * should not surface as a dead route. If every attempt fails the rejection
 * propagates — `RouteErrorBoundary` turns it into a ret/reload UI.
 */
export async function importWithRetry<T>(
  factory: () => Promise<T>,
  { retries = 2, backoffMs = 400 }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** attempt));
    }
  }
  throw lastError;
}

/** `React.lazy`, but the underlying `import()` is retried (see `importWithRetry`). */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options?: RetryOptions
) {
  return lazy<T>(() => importWithRetry(factory, options));
}
