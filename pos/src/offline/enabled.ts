let enabled = false;

/** Call only from the cashier shell entry (`cashier-main.tsx`). */
export function enableOfflinePos(): void {
  enabled = true;
}

export function isOfflinePosEnabled(): boolean {
  return enabled;
}
