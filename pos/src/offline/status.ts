import { create } from 'zustand';
import { db } from './db';
import { isOfflinePosEnabled } from './enabled';

interface OfflineStatus {
  online: boolean;
  pending: number;
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
  syncing: false,
  lastError: null,
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setLastError: (lastError) => set({ lastError }),
  refreshPending: async () => {
    if (!isOfflinePosEnabled()) {
      set({ pending: 0 });
      return;
    }
    const pending = await db.outbox.where('status').anyOf(['pending', 'error']).count();
    set({ pending });
  },
}));
