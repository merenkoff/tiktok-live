// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { create } from 'zustand';
import { db } from './db';
import { isOfflinePosEnabled } from './enabled';
import { modulePendingCounts } from './moduleHooks';

interface OfflineStatus {
  online: boolean;
  pending: number;
  /** Rows the server will never accept. They need the cashier, not another tick. */
  dead: number;
  /** Per-module share of `pending` (roadmap #12 track 3), by module id. */
  modulePending: Record<string, number>;
  syncing: boolean;
  lastError: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastError: (lastError: string | null) => void;
  refreshPending: () => Promise<void>;
}

export const useOfflineStatus = create<OfflineStatus>((set) => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pending: 0,
  dead: 0,
  modulePending: {},
  syncing: false,
  lastError: null,
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setLastError: (lastError) => set({ lastError }),
  refreshPending: async () => {
    if (!isOfflinePosEnabled()) {
      set({ pending: 0, dead: 0, modulePending: {} });
      return;
    }
    // `'dead'` is deliberately outside the pending count: a permanently
    // rejected row used to sit here forever and pin the offline banner.
    const [own, dead, modulePending] = await Promise.all([
      db.outbox.where('status').anyOf(['pending', 'error']).count(),
      db.outbox.where('status').equals('dead').count(),
      modulePendingCounts(),
    ]);
    const modules = Object.values(modulePending).reduce((a, b) => a + b, 0);
    set({ pending: own + modules, dead, modulePending });
  },
}));
