// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { createContext, useContext } from 'react';

/**
 * `web` = Railway SPA (адмінка + каса в браузері). `cashier` = десктоп / cashier
 * entry (лише каса). `tablet` = планшет офіціанта, PWA з того ж деплою, що й
 * `web`, під `/tablet/`: екрани каси без `/admin`, читає офлайн, пише онлайн
 * (TechDocs/POS_PWA.md).
 */
export type PosShell = 'web' | 'cashier' | 'tablet';

export const PosShellContext = createContext<PosShell>('web');

export function usePosShell(): PosShell {
  return useContext(PosShellContext);
}
