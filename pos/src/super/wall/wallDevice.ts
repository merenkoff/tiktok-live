// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The screen on the wall: it stays awake (Screen Wake Lock), goes full screen
// where the browser allows it, and nothing the browser refuses breaks the
// widget. Everything starts from the «Почати» touch.
//
// Carried over from the «Малин» stop-sticker widget.

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (t: 'release', cb: () => void) => void };
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

/**
 * Keeps the screen on while the page is visible; the browser drops the lock
 * when the tab is hidden, so it is asked for again on return. `onChange` feeds
 * the indicator in the header.
 */
export function keepScreenAwake(onChange: (active: boolean) => void): () => void {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  if (!wakeLock) {
    onChange(false);
    return () => {};
  }
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const request = async () => {
    if (stopped || document.visibilityState !== 'visible') return;
    try {
      sentinel = await wakeLock.request('screen');
      onChange(true);
      sentinel.addEventListener?.('release', () => onChange(false));
    } catch {
      onChange(false);
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void request();
  };
  document.addEventListener('visibilitychange', onVisible);
  void request();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => {});
  };
}

/** Full screen — from a touch only; a refusal (iOS, a desktop policy) is ignored. */
export async function enterWallFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    }
  } catch {
    /* the widget works without full screen too */
  }
}
