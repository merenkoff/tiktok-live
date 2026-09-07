// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's own error types, in their own file so `diagnostics.ts` can
// classify them without importing `liveClient.ts` (which imports diagnostics'
// dependencies in turn). `HostTooOldError` lives in `hostPlatform.ts` — it is
// raised before any of this is reachable.

/** The store has no TikTok account connected — the owner has to do that first. */
export class LiveNotConfiguredError extends Error {
  /** The bridge's HTTP status, so `diagnose()` classifies it like any other. */
  readonly status = 409;

  constructor() {
    super('live_not_configured');
    this.name = 'LiveNotConfiguredError';
  }
}

/** A non-2xx from the LIVE API after the one permitted token re-mint. */
export class LiveApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'LiveApiError';
  }
}
