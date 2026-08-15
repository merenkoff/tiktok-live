import { createContext, useContext } from 'react';

/** `web` = Railway SPA (адмінка + каса). `cashier` = десктоп / cashier entry (лише каса). */
export type PosShell = 'web' | 'cashier';

export const PosShellContext = createContext<PosShell>('web');

export function usePosShell(): PosShell {
  return useContext(PosShellContext);
}
