// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useLayoutEffect, useRef } from 'react';
import { useAuthStore } from '@pos/platform';

/**
 * What a copy WITHOUT a valid licence key tells every user of the POS once it
 * has served more client launches than its threshold (TechDocs/POS_LICENSING.md,
 * phase 2G). The text comes with the session (`store.license_notice`), so the
 * till shows the same strip when it starts without a network.
 *
 * It is a notice and nothing more. It cannot be closed — and it is not allowed
 * to cost anything: the strip takes its own row at the top (the frames subtract
 * `--lic-h`, `CashierLayout` / `AdminLayout`), covers no button, and sits UNDER
 * every sheet and dialog, so nothing a cashier needs is ever behind it. A copy
 * with a valid key gets no `license_notice` and draws nothing here.
 */
export function LicenseNoticeStrip() {
  const text = useAuthStore((s) => (s.isAuthenticated ? s.auth?.store.license_notice?.text ?? null : null));
  const ref = useRef<HTMLDivElement>(null);

  // The strip's height is whatever its text needs (a long one wraps on a
  // phone), and the frames below must start exactly under it.
  useLayoutEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const root = document.documentElement;
    const apply = () => {
      const height = `${strip.offsetHeight}px`;
      root.style.setProperty('--lic-h', height);
      document.body.style.paddingTop = height;
    };
    apply();
    // Both: the observer catches the text re-wrapping, and the window's own
    // event is the one that still fires where observers are not delivered
    // (a page that is not being painted) — a stale height would leave the
    // frames starting in the wrong place.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    observer?.observe(strip);
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      observer?.disconnect();
      root.style.removeProperty('--lic-h');
      document.body.style.paddingTop = '';
    };
  }, [text]);

  if (!text) return null;
  return (
    <div
      ref={ref}
      role="status"
      data-testid="license-notice"
      className="fixed inset-x-0 top-0 z-30 border-b border-amber-300 bg-amber-100 px-3 py-1 text-center text-xs font-medium leading-snug text-amber-900"
    >
      {text}
    </div>
  );
}
