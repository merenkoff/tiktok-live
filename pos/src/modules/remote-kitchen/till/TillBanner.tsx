// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// This module's `till.Banner` (platform 25): what the host's till frame draws
// over every screen of a store with «Віддалена кухня». A kitchen gets
// «Запити з точок» (РК3); a cafe gets «Замовлення з кухні» (РК5); a store
// that is both gets both. Each draws nothing while it has nothing to say, and
// both learn the store's side from one read of the setup (`lib/sides.ts`).

import { RequestsStrip } from '../kitchen/RequestsStrip';
import { CafeTracker } from '../tracker/CafeTracker';

/** `till.Banner` takes no props. */
export default function RemoteKitchenBanner() {
  return (
    <>
      <RequestsStrip />
      <CafeTracker />
    </>
  );
}
