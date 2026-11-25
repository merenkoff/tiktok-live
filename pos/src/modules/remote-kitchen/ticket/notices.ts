// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The guest's ticket that the till printed by itself after the sale did not
// come out (no paper, a jam). The checkout block that printed it is gone by
// then — the cart is empty — so it tells the tracker, which hangs over every
// till screen and shows the line under that order with «Талон» beside it.

export interface TicketNotice {
  orderId: number;
  error: string;
}

const listeners = new Set<(notice: TicketNotice) => void>();

export function noticeTicketFailure(notice: TicketNotice): void {
  for (const listener of listeners) listener(notice);
}

export function onTicketFailure(listener: (notice: TicketNotice) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
