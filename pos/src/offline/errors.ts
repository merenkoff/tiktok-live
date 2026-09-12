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

/**
 * This till may not print a fiscal receipt without a connection.
 *
 * Before фаза 3 that was every fiscalising store, because a ПРРО receipt is
 * registered at the moment of sale. Now a store in offline mode stamps from
 * its own reserve instead, and this is what is left: the reasons that reserve
 * cannot be used — no codes, no shift, past the tax office's limits, another
 * till holds the register, or the requisites the receipt header needs have
 * never been fetched. Nothing is written in any of them: no outbox row, no
 * stock movement, no synthetic receipt.
 */
export class OfflineFiscalError extends Error {
  constructor(
    readonly reason: string = 'offline_off',
    message = 'Продаж із фіскалізацією потребує інтернету — чек не проведено'
  ) {
    super(message);
    this.name = 'OfflineFiscalError';
  }
}

/**
 * The request went out and no answer came back, in a fiscalising store.
 *
 * The sale may not exist, may exist un-fiscalised, or may exist fully
 * fiscalised — a timeout cannot tell us. Queueing it (what a non-fiscal store
 * does) would decrement stock, mint a synthetic `OFF-` receipt and show a
 * success screen for a sale we cannot vouch for. So the uuid is handed back
 * instead: re-sending it is idempotent, and the server's answer resolves every
 * branch at once — 200 with the sale, 409 if it was voided, or a fresh sale.
 */
export class FiscalSaleUnknownError extends Error {
  constructor(readonly clientUuid: string) {
    super('Сервер не відповів — стан чека невідомий. Не пробивайте чек повторно.');
    this.name = 'FiscalSaleUnknownError';
  }
}
