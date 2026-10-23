// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { formatSignedUah, formatUah } from '@pos/platform';

/**
 * A receipt's cash rounding (НБУ № 25, TechDocs/POS_CASH_ROUNDING.md) under
 * its «Разом». «Разом» stays the goods' value — what the paper's «СУМА» says
 * and what a refund counts from — so this line names the kopecks the cash
 * part moved by and what was actually due. Nothing for a receipt that was not
 * rounded, or one read from a server older than migration 070.
 */
export function SaleRoundingLine({
  totalCents,
  roundingCents,
}: {
  totalCents: number;
  roundingCents?: number | null;
}) {
  if (!roundingCents) return null;
  return (
    <p className="text-right text-[13px] text-sq-muted tabular-nums" data-testid="sale-rounding">
      Заокруглення готівки {formatSignedUah(roundingCents)} · до сплати {formatUah(totalCents + roundingCents)}
    </p>
  );
}
