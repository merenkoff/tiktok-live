// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useState } from 'react';
import { bridgeToken, liveUsername } from '../lib/liveClient';
import { diagnose, reportLiveFailure, type LiveDiagnostic } from '../lib/diagnostics';

export type LiveAuthStatus = 'loading' | 'ready' | 'not-configured' | 'error';

/**
 * Bootstraps the POS→LIVE token bridge for the screen.
 *
 * Everything else in the module ({@link useLiveSession}, {@link useLiveLogs})
 * mints on demand too, so this hook is not a gate on the network — it exists so
 * the page can tell the failures apart. Every one of them looks the same to the
 * operator (a screen with no feed), so each carries a {@link LiveDiagnostic}
 * with a support code: "this store isn't linked to TikTok yet" is an errand for
 * the owner, "the shell is older than this module" is an app update, and a dead
 * network is neither.
 */
export function useLiveAuth() {
  const [status, setStatus] = useState<LiveAuthStatus>('loading');
  const [username, setUsername] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<LiveDiagnostic | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    bridgeToken()
      .then(() => {
        if (!alive) return;
        setUsername(liveUsername());
        setDiagnostic(null);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const d = diagnose(error);
        reportLiveFailure(d);
        setDiagnostic(d);
        setStatus(d.reason === 'not_configured' ? 'not-configured' : 'error');
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, username, diagnostic, refresh };
}
