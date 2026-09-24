// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Adds `apple` to `<html>` on a Mac, iPhone or iPad, where `styles/tokens.css`
 * switches `--pos-font` from Inter to the system font (SF — what Things is set
 * in). Called first thing by each entry, before React renders anything.
 *
 * A class and not a font stack, because a stack cannot express it: Chrome and
 * the WebView2 the Windows till runs in resolve `BlinkMacSystemFont` as
 * `system-ui`, which there is Segoe UI, so any stack that leads with the system
 * font never reaches Inter on Windows. Not an inline <script> in the HTML
 * either: the Tauri CSP allows no inline scripts, and this is an SPA — nothing
 * is on screen until the entry runs. iPadOS reports `MacIntel`, so it is
 * covered by `Mac`.
 */
export function markApplePlatform(): void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
  if (/Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
    document.documentElement.classList.add('apple');
  }
}
