import { create } from 'zustand';
import { checkForUpdate, UpdateInfo } from '../lib/updates';

interface UpdateStore {
  updateInfo: UpdateInfo | null;
  checked: boolean;
  check: () => void;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  updateInfo: null,
  checked: false,

  check: () => {
    if (get().checked) return;
    set({ checked: true });
    void checkForUpdate()
      .then((updateInfo) => set({ updateInfo }))
      .catch(() => undefined);
  },
}));
