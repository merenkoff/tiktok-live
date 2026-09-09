// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { invoke } from '@tauri-apps/api/core';

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

/**
 * Open the OS print dialog.
 *
 * Extracted from `usePrintableReceipt` so price tags inherit the macOS
 * workaround rather than rediscovering it: WKWebView's `window.print()`
 * silently no-ops there — no dialog, no error, nothing — because no native
 * print delegate is wired up. The `print_webview` Tauri command drives the same
 * pipeline through AppKit instead. On the web build `invoke` simply rejects and
 * the fallback runs.
 */
export function triggerPrint(): void {
  if (isMac) {
    void invoke('print_webview').catch(() => window.print());
    return;
  }
  window.print();
}
