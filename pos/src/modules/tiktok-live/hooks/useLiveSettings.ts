// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Load/save state for the module's admin surface.
//
// Everything here goes through the HOST's authenticated POS client
// (`hostPlatform`), not through `liveClient`. That is the whole point of the
// split: the bridge token `liveClient` holds is mintable by any staff member
// and says nothing about role, so configuration has to travel a POS route that
// can check for an owner. See `src/pos/routes/live.routes.ts`.

import { useCallback, useEffect, useState } from 'react';
import {
  hasSettingsApi,
  liveSettings as fetchSettings,
  missingSettingsApi,
  testLiveTelegram,
  updateLiveSettings,
} from '../lib/hostPlatform';
import { diagnose, reportLiveFailure, type LiveDiagnostic } from '../lib/diagnostics';
import type { LiveSettings, LiveSettingsPatch } from '../types';

export type LiveSettingsStatus =
  | 'loading'
  | 'ready'
  /** The store has no TikTok account connected yet — an errand for the owner. */
  | 'not-configured'
  /** This shell predates the settings proxy; the desk still works. */
  | 'host-too-old'
  | 'error';

export interface TelegramTestResult {
  ok: boolean;
  username?: string | null;
  error?: string;
}

export function useLiveSettings() {
  const [status, setStatus] = useState<LiveSettingsStatus>('loading');
  const [settings, setSettings] = useState<LiveSettings | null>(null);
  const [diagnostic, setDiagnostic] = useState<LiveDiagnostic | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TelegramTestResult | null>(null);

  useEffect(() => {
    // Probe before any network call: on an older shell there is nothing to call.
    if (!hasSettingsApi()) {
      setStatus('host-too-old');
      return;
    }

    let alive = true;
    setStatus('loading');
    fetchSettings()
      .then((data) => {
        if (!alive) return;
        setSettings(data);
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

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const save = useCallback(async (patch: LiveSettingsPatch) => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      setSettings(await updateLiveSettings(patch));
      setSaved(true);
      return true;
    } catch (error: unknown) {
      // The backend answers a malformed field with 400 and a message; anything
      // else is ours to explain generically.
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      setSaveError(message || 'Не вдалося зберегти. Спробуйте ще раз.');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const testTelegram = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLiveTelegram();
      setTestResult({ ok: result.ok, username: result.username });
    } catch (error: unknown) {
      const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setTestResult({
        ok: false,
        error:
          code === 'telegram_token_not_set'
            ? 'Токен бота не збережено.'
            : code === 'telegram_token_invalid'
              ? 'Telegram відхилив цей токен.'
              : 'Не вдалося перевірити.',
      });
    } finally {
      setTesting(false);
    }
  }, []);

  return {
    status,
    settings,
    diagnostic,
    missingHostApi: missingSettingsApi(),
    reload,
    save,
    saving,
    saveError,
    saved,
    clearSaved: () => setSaved(false),
    testTelegram,
    testing,
    testResult,
  };
}
