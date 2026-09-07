// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useRef, useState } from 'react';
import { liveClient } from '../lib/liveClient';
import { diagnose, reportLiveFailure, type LiveDiagnostic } from '../lib/diagnostics';
import type { LiveSession } from '../types';

/** How often the broadcast status is re-read. The admin SPA used react-query with the same interval. */
const POLL_MS = 5000;

/**
 * The store's current LIVE session, polled.
 *
 * A plain poll rather than react-query: this module ships as a standalone
 * chunk with only `@pos/platform` shared with the host, and one interval is
 * not worth pulling a second data layer across that boundary.
 *
 * `enabled` is false while the token bridge is still resolving — polling before
 * then would just mint a token twice.
 */
export function useLiveSession(enabled: boolean) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  // The bridge can succeed while `/api/sessions/*` does not (e.g. a backend
  // that has the POS routes but not the LIVE ones). That failure lands here,
  // past the bootstrap screen, so it needs its own support code.
  const [diagnostic, setDiagnostic] = useState<LiveDiagnostic | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await liveClient.getCurrentSession();
      if (!mountedRef.current) return;
      setSession(next);
      setIsError(false);
      setDiagnostic(null);
    } catch (error) {
      // `reportLiveFailure` de-dupes by code, so a persistently failing poll
      // logs once rather than every five seconds.
      const d = diagnose(error);
      reportLiveFailure(d);
      if (mountedRef.current) {
        setIsError(true);
        setDiagnostic(d);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  const start = useCallback(async () => {
    setActionError(null);
    setIsStarting(true);
    try {
      await liveClient.startSession();
      await refresh();
    } catch {
      if (mountedRef.current) setActionError('Не вдалося почати ефір');
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }, [refresh]);

  const stop = useCallback(async () => {
    setActionError(null);
    setIsStopping(true);
    try {
      await liveClient.stopSession();
      await refresh();
    } catch {
      if (mountedRef.current) setActionError('Не вдалося зупинити ефір');
    } finally {
      if (mountedRef.current) setIsStopping(false);
    }
  }, [refresh]);

  return {
    session,
    isActive: session?.status === 'running',
    isLoading,
    isError,
    diagnostic,
    isStarting,
    isStopping,
    actionError,
    start,
    stop,
    refresh,
  };
}
