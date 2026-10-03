// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatUah } from '@pos/platform';
import { foodCostPercent, missingReason } from '../data/techCards';
import type { TechCardRow } from '../data/techCardsApi';

/**
 * What this variant costs to assemble, beside the recipe it is summed from.
 *
 * The same rule as «Техкарти» and for the same reason: a recipe with one
 * unpriced ingredient has no honest food cost, so it says «—» and why. It is
 * the SAVED recipe's figure — edit the composition and it refreshes after the
 * save, which is when the server recomputes it.
 */
export function TechCardLine({ card }: { card?: TechCardRow }) {
  if (!card) return null;
  const reason = missingReason(card);
  return (
    <p className="text-[13px] text-sq-secondary">
      Собівартість: <strong className="font-semibold text-sq-text tabular-nums">{formatUah(card.cost_cents)}</strong>
      {' · food cost: '}
      {reason ? (
        <span>— ({reason})</span>
      ) : (
        <strong className="font-semibold text-sq-text tabular-nums">{foodCostPercent(card.food_cost_bps!)}</strong>
      )}
      {' · за останніми цінами закупівлі'}
    </p>
  );
}
