// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop till's window, from the login screen (TechDocs/POS_DESKTOP.md,
// «Вікно каси»). A release build opens fullscreen, undecorated and not
// closable — the kiosk — so the login screen draws the system's three buttons
// itself, and these are what they call (`src-tauri/src/window_controls.rs`).

import { invoke } from '@tauri-apps/api/core';

/** Whose buttons to draw: they sit and look where that system puts its own. */
export type DesktopPlatform = 'mac' | 'windows' | 'linux';

/**
 * The OS the webview runs on. Tauri's webview is the system's own — WKWebView,
 * WebView2, WebKitGTK — so its user agent names the system truthfully.
 */
export function desktopPlatform(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  platform: string = typeof navigator === 'undefined' ? '' : navigator.platform ?? ''
): DesktopPlatform {
  const both = `${platform} ${userAgent}`;
  if (/Mac|iPhone|iPad/i.test(both)) return 'mac';
  if (/Win/i.test(both)) return 'windows';
  return 'linux';
}

function warn(error: unknown): void {
  console.warn('[window]', error);
}

/** «Згорнути» — on macOS the till hides itself (a fullscreen window cannot be minimised). */
export function minimizeWindow(): Promise<void> {
  return invoke<void>('window_minimize').catch(warn);
}

/**
 * Fullscreen ⇄ an ordinary window with the system's frame. Resolves to whether
 * the window is fullscreen afterwards, or null when the till could not say.
 */
export function toggleFullscreen(): Promise<boolean | null> {
  return invoke<boolean>('window_toggle_fullscreen').then(
    (value) => (typeof value === 'boolean' ? value : null),
    (error) => {
      warn(error);
      return null;
    }
  );
}

/** Whether the window is fullscreen now; null when the till could not say. */
export function windowIsFullscreen(): Promise<boolean | null> {
  return invoke<boolean>('window_is_fullscreen').then(
    (value) => (typeof value === 'boolean' ? value : null),
    () => null
  );
}

/** «Закрити» — the app exits; the offline outbox stays in IndexedDB. */
export function closeApp(): Promise<void> {
  return invoke<void>('window_close').catch(warn);
}
