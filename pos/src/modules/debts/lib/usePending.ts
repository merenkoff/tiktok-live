// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What this till wrote down for one customer without the server — the desktop
// only, the one shell with a queue. Read again whenever the queue moves.

import { useEffect, useState } from 'react';
import { isOfflinePosEnabled, useAuthStore } from '@pos/platform';
import { onQueueChange, pendingFor } from '../data/queue';

export interface Pending {
  cents: number;
  count: number;
}

export const NO_PENDING: Pending = { cents: 0, count: 0 };

export function usePending(customerId: number | null): Pending {
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const queue = isOfflinePosEnabled();
  const [pending, setPending] = useState<Pending>(NO_PENDING);

  useEffect(() => {
    if (!queue || storeId == null || customerId == null) {
      setPending(NO_PENDING);
      return undefined;
    }
    let live = true;
    const read = () => {
      void pendingFor(storeId, customerId).then((next) => {
        if (!live) return;
        setPending((prev) => (prev.cents === next.cents && prev.count === next.count ? prev : next));
      });
    };
    read();
    const off = onQueueChange(read);
    return () => {
      live = false;
      off();
    };
  }, [queue, storeId, customerId]);

  return pending;
}
