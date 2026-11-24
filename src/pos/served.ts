// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/served.ts — how much of a round's line has been carried to the
// guest (migration 115, TechDocs/POS_PASS.md).
//
// One SQL fragment, read by the waiter's «Роздача», the kitchen board and the
// bill alike, so the three can never disagree about a plate. Kept apart from
// `serving.service.ts` because `bills.service.ts` and `kitchen.service.ts`
// need it and the service imports both.

/**
 * The carried quantity of bill line `item` in round `round` (table aliases).
 *
 * A round already `served` is carried whole — that covers the rounds handed
 * over before migration 115, which have no rows, without inventing an author
 * for them. Otherwise it is the sum of the line's live rows.
 */
export function servedQuantitySql(item: string, round: string): string {
  return `(CASE WHEN ${round}.prep_status = 'served' THEN ${item}.quantity
               ELSE COALESCE((SELECT SUM(e.quantity) FROM pos_bill_item_serves e
                               WHERE e.bill_item_id = ${item}.id AND e.undone_at IS NULL), 0)
          END)::int`;
}
