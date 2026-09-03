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

/**
 * A refund is a document that has to reference a real server-side sale (and,
 * once ПРРО lands, its fiscal number), so it cannot be queued offline. Only a
 * sale still waiting in the outbox can be cancelled without a connection.
 */
export class OfflineRefundError extends Error {
  constructor() {
    super('Повернення потребує інтернету — цей чек уже на сервері');
    this.name = 'OfflineRefundError';
  }
}
