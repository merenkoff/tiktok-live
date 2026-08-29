// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export class OfflineAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'no_cache' | 'mismatch'
  ) {
    super(message);
    this.name = 'OfflineAuthError';
  }
}
