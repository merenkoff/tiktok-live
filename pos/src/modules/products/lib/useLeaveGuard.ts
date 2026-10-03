// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef } from 'react';

/**
 * Stops an unsaved card from being left by accident.
 *
 * Two doors: the browser's (`beforeunload` — a reload, a closed tab, a typed
 * address) and the app's own links («← Товари», the sidebar). The app runs on
 * `<BrowserRouter>`, which has no `useBlocker`, so in-app links are caught at
 * the document in the CAPTURE phase — before React's root listener, so the
 * `<Link>` never navigates — and handed to the page, which asks. A link with a
 * modifier key (new tab), a download, an external or hash link is left alone.
 * The browser's own Back button is not caught; that is documented.
 */
export function useLeaveGuard(dirty: boolean, onAttempt: (href: string) => void): void {
  const attempt = useRef(onAttempt);
  attempt.current = onAttempt;

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome still wants the legacy property set to show its prompt.
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (href === '' || href.startsWith('#')) return;
      if (anchor.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      attempt.current(`${anchor.pathname}${anchor.search}${anchor.hash}`);
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
