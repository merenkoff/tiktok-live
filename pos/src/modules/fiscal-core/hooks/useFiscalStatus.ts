// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/hooks/useFiscalStatus.ts
//
// The store's fiscal/shift status, polled. Same "plain interval, no
// react-query" reasoning as `tiktok-live/hooks/useLiveSession.ts`: this
// module ships as a standalone chunk sharing only `@pos/platform` with the
// host, and one interval is not worth a second data layer.
//
// `GET /fiscal/status` never throws — an unreachable provider is a state to
// render (`FiscalStatus.error`), not a failed request. This hook's own
// `isError`/`diagnostic` are therefore only for the HTTP call itself failing
// (network, host too old), not for the provider being down — that case is in
// `status.error` and the caller renders it inline, not as a failure screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFiscalStatus } from '../data/fiscalApi';
import { diagnose, reportFiscalFailure, type FiscalDiagnostic } from '../lib/diagnostics';
import type { FiscalStatus } from '../types';

const POLL_MS = 5000;

export function useFiscalStatus() {
  const [status, setStatus] = useState<FiscalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [diagnostic, setDiagnostic] = useState<FiscalDiagnostic | null>(null);
  // Kept alongside `diagnostic` so a caller can hand the ORIGINAL error to
  // `FiscalErrorCard` (which computes its own diagnosis) without this hook
  // needing to know anything about how that component renders.
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getFiscalStatus();
      if (!mountedRef.current) return;
      setStatus(next);
      setDiagnostic(null);
      setError(null);
    } catch (e) {
      const d = diagnose(e);
      reportFiscalFailure(d);
      if (mountedRef.current) {
        setDiagnostic(d);
        setError(e);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { status, isLoading, diagnostic, error, refresh };
}
