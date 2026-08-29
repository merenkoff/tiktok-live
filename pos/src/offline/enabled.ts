// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

let enabled = false;

/** Call only from the cashier shell entry (`cashier-main.tsx`). */
export function enableOfflinePos(): void {
  enabled = true;
}

export function isOfflinePosEnabled(): boolean {
  return enabled;
}
