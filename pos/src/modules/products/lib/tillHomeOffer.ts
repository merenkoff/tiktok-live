// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which stores the till's home screen means something in (migration 112): the
// clothing catalog draws it — the one Evelin sells through, and every other
// vertical's fallback — while a florist's, a café's and a grocer's catalogs
// open on their own screens. The owner is asked only where the tick changes
// what the cashier sees.

export function offersTillHome(verticalId: string | undefined): boolean {
  return verticalId === 'clothing';
}
