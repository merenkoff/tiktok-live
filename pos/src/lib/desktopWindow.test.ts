// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which system's window buttons the desktop till draws, read from the webview's
// own user agent — WKWebView, WebView2, WebKitGTK.

import { describe, expect, it } from 'vitest';
import { desktopPlatform } from './desktopWindow';

describe('desktopPlatform', () => {
  it('reads macOS, Windows and Linux off the webview', () => {
    expect(
      desktopPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
        'MacIntel'
      )
    ).toBe('mac');
    expect(
      desktopPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        'Win32'
      )
    ).toBe('windows');
    expect(
      desktopPlatform('Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)', 'Linux x86_64')
    ).toBe('linux');
  });

  it('falls back to Linux for anything it does not know', () => {
    expect(desktopPlatform('', '')).toBe('linux');
  });
});
